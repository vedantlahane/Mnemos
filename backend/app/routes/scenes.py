from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import SceneSave, ViewportSave
from app.db.supabase import db
from app.excalidraw.scene import normalize_scene
from app.services import operations as ops_svc
from app.services import cache as cache_svc
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/pages/{page_id}/scene")
async def get_scene(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])
    return {
        "scene": scene,
        "version": stored["version"],
        "page_id": page_id,
    }


@router.put("/pages/{page_id}/scene")
async def save_scene(page_id: str, payload: SceneSave,
                     user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    scene_data = normalize_scene({
        "elements": payload.elements,
        "appState": payload.appState,
        "files": payload.files,
    })

    stored = await db.get_scene(page_id)
    new_version = stored["version"] + 1

    await db.save_scene(page_id, scene_data, new_version)
    await ops_svc.log_and_notify(
        page_id, new_version, "user_sync", actor="user",
    )
    await cache_svc.invalidate_page(page_id)

    return {"status": "saved", "version": new_version}


@router.get("/pages/{page_id}/scene/version")
async def get_scene_version(page_id: str):
    stored = await db.get_scene(page_id)
    return {"version": stored["version"], "page_id": page_id}


@router.post("/pages/{page_id}/scene/rebuild")
async def rebuild_scene(page_id: str, user_id: str = Depends(get_optional_user_id)):
    """Full scene rebuild from notes — nuclear option."""
    from app.excalidraw import scene_manager
    from app.excalidraw.constants import DEFAULT_SCENE
    from app.services.placement import find_placement
    from app.config import settings

    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    notes = await db.get_notes_for_page(page_id, user_id=user_id)
    scene = normalize_scene({**DEFAULT_SCENE})

    for note in notes:
        placement = await find_placement(page_id, scene, note=note, strategy="sequential")
        scene, element_ids = scene_manager.upsert_note_card(
            scene, note, placement.x, placement.y,
        )
        await db.update_note(
            note["id"],
            canvas_x=placement.x, canvas_y=placement.y,
            element_ids=element_ids,
        )

    stored = await db.get_scene(page_id)
    new_version = stored["version"] + 1
    await db.save_scene(page_id, scene, new_version)
    await ops_svc.log_and_notify(
        page_id, new_version, "full_rebuild", actor="system",
        payload={"note_count": len(notes)},
    )
    await cache_svc.invalidate_page(page_id)

    return {
        "status": "rebuilt",
        "version": new_version,
        "notes_placed": len(notes),
    }