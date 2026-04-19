from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.schemas import CuratorAction
from app.db.supabase import db
from app.excalidraw.scene import normalize_scene
from app.excalidraw import scene_manager
from app.services import operations as ops_svc
from app.services.placement import find_placement
from app.services.composition import compose_content, stream_compose
from app.services.curator import curator
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id
from app.config import settings
import json
import asyncio

router = APIRouter()


@router.post("/pages/{page_id}/ai/diagram")
async def generate_diagram(page_id: str, topic: str = None,
                           user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not topic:
        raise HTTPException(status_code=400, detail="Topic required")

    topology = await llm.generate_diagram(topic, user_id=user_id)

    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])

    placement = await find_placement(page_id, scene, strategy="auto")
    scene, bbox = scene_manager.add_diagram(
        scene, topology, placement.x, placement.y,
    )

    new_version = stored["version"] + 1
    await db.save_scene(page_id, scene, new_version)
    await ops_svc.log_and_notify(
        page_id, new_version, "add_diagram", actor="ai",
        payload={"topic": topic, "bbox": bbox},
    )

    return {
        "status": "created",
        "topic": topic,
        "bbox": bbox,
        "version": new_version,
        "topology": topology,
    }


@router.post("/pages/{page_id}/ai/compose")
async def compose_on_canvas(page_id: str, topic: str = None,
                            user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not topic:
        raise HTTPException(status_code=400, detail="Topic required")

    content = await compose_content(topic, page_id, user_id)

    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])

    placement = await find_placement(page_id, scene, strategy="auto")
    scene, measurement, el_id = scene_manager.add_text(
        scene, content, placement.x, placement.y,
        font_size=14, max_width=500,
    )

    new_version = stored["version"] + 1
    await db.save_scene(page_id, scene, new_version)
    await ops_svc.log_and_notify(
        page_id, new_version, "add_elements", actor="ai",
        element_ids=[el_id],
        payload={"topic": topic, "type": "composed_text"},
    )

    return {
        "status": "created",
        "topic": topic,
        "element_id": el_id,
        "measurement": measurement,
        "version": new_version,
    }


@router.post("/pages/{page_id}/ai/compose/stream")
async def compose_stream(page_id: str, topic: str = None,
                         user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not topic:
        raise HTTPException(status_code=400, detail="Topic required")

    async def generate():
        full_content = ""
        try:
            async for chunk in stream_compose(topic, page_id, user_id):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                await asyncio.sleep(settings.stream_chunk_delay)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            return

        # Place on canvas after streaming completes
        try:
            stored = await db.get_scene(page_id)
            scene = normalize_scene(stored["scene"])
            placement = await find_placement(page_id, scene, strategy="auto")
            scene, measurement, el_id = scene_manager.add_text(
                scene, full_content, placement.x, placement.y,
                font_size=14, max_width=500,
            )
            new_version = stored["version"] + 1
            await db.save_scene(page_id, scene, new_version)
            await ops_svc.log_and_notify(
                page_id, new_version, "add_elements", actor="ai",
                element_ids=[el_id],
                payload={"topic": topic, "type": "composed_text"},
            )
            yield f"data: {json.dumps({'type': 'placed', 'element_id': el_id, 'version': new_version})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'place_error', 'content': str(e)})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/pages/{page_id}/ai/sticky")
async def add_sticky(page_id: str, content: str = None,
                     color: str = "#fef08a",
                     user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not content:
        raise HTTPException(status_code=400, detail="Content required")

    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])

    placement = await find_placement(
        page_id, scene, strategy="auto", size=(180, 160),
    )
    scene, group_id = scene_manager.add_sticky(
        scene, content, placement.x, placement.y, bg_color=color,
    )

    new_version = stored["version"] + 1
    await db.save_scene(page_id, scene, new_version)
    await ops_svc.log_and_notify(
        page_id, new_version, "add_elements", actor="ai",
        payload={"type": "sticky", "content": content[:100]},
    )

    return {
        "status": "created",
        "group_id": group_id,
        "version": new_version,
    }


@router.post("/pages/{page_id}/ai/background")
async def set_background(page_id: str, color: str = None,
                         theme: str = None,
                         user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])

    if theme and theme in ("dark", "light"):
        scene = scene_manager.set_theme(scene, theme)
    elif color:
        scene = scene_manager.set_background(scene, color)
    else:
        raise HTTPException(status_code=400, detail="Provide color or theme")

    new_version = stored["version"] + 1
    await db.save_scene(page_id, scene, new_version)
    await ops_svc.log_and_notify(
        page_id, new_version, "set_background", actor="ai",
        payload={"color": color, "theme": theme},
    )

    return {
        "status": "updated",
        "version": new_version,
        "background": scene["appState"]["viewBackgroundColor"],
        "theme": scene["appState"]["theme"],
    }


@router.get("/ai/curator/scan")
async def curator_scan(user_id: str = Depends(get_optional_user_id)):
    result = await curator.full_scan(user_id=user_id)
    return result


@router.post("/ai/curator/action")
async def curator_action(payload: CuratorAction,
                         user_id: str = Depends(get_optional_user_id)):
    result = await curator.apply_action(
        action_type=payload.action_type,
        params=payload.params,
        user_id=user_id,
    )
    return result


@router.get("/pages/{page_id}/ai/analyze")
async def analyze_page(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])
    analysis = scene_manager.analyze(scene)

    notes = await db.get_notes_for_page(page_id, user_id=user_id)
    edges = await db.get_edges_for_page(page_id)

    all_tags: set[str] = set()
    content_types: dict[str, int] = {}
    for n in notes:
        all_tags.update(n.get("tags") or [])
        ct = n.get("content_type", "note")
        content_types[ct] = content_types.get(ct, 0) + 1

    return {
        "page": {"id": page_id, "name": page["name"]},
        "scene": analysis,
        "notes": {
            "count": len(notes),
            "content_types": content_types,
            "tags": sorted(all_tags),
        },
        "edges": {
            "count": len(edges),
            "types": {},
        },
        "version": stored["version"],
    }