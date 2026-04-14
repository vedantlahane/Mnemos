# === FILE: backend/app/routes/pages.py ===

from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import PageCreate, PageUpdate
from app.db.supabase import db
from app.services import cache as cache_svc
from app.services.canvas_state import canvas_state
from app.services.spatial_planner import spatial_planner
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.pages")

router = APIRouter()


@router.get("/pages")
async def list_pages(include_archived: bool = False, user_id: str = Depends(get_optional_user_id)):
    pages = await db.list_pages(include_archived=include_archived, user_id=user_id)
    return {"pages": pages}


@router.post("/pages")
async def create_page(payload: PageCreate, user_id: str = Depends(get_optional_user_id)):
    existing = await db.get_page_by_name(payload.name, user_id=user_id)
    if existing:
        raise HTTPException(status_code=400, detail=f"Page '{payload.name}' already exists")
    page = await db.insert_page(
        name=payload.name, description=payload.description,
        icon=payload.icon, color=payload.color, user_id=user_id,
    )
    return page


@router.get("/pages/{page_id}")
async def get_page(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await cache_svc.get_page_cached(
        page_id, fetcher=lambda: db.get_page(page_id, user_id=user_id)
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/pages/{page_id}")
async def update_page(page_id: str, payload: PageUpdate, user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if "name" in updates:
        existing = await db.get_page_by_name(updates["name"], user_id=user_id)
        if existing and existing["id"] != page_id:
            raise HTTPException(status_code=400, detail=f"Page '{updates['name']}' already exists")

    updated = await db.update_page(page_id, user_id=user_id, **updates)
    await cache_svc.invalidate_page(page_id)
    return updated


@router.delete("/pages/{page_id}")
async def delete_page(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if page["name"] == "Uncategorized":
        raise HTTPException(status_code=400, detail="Cannot delete Uncategorized page")

    await db.delete_page(page_id, user_id=user_id)
    await cache_svc.invalidate_page(page_id)
    await cache_svc.invalidate_overview()
    return {"status": "deleted"}


@router.get("/pages/{page_id}/canvas")
async def get_page_canvas(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    canvas = await cache_svc.get_canvas_cached(
        page_id, fetcher=lambda: db.get_page_canvas(page_id, user_id=user_id)
    )
    return canvas


@router.put("/pages/{page_id}/canvas")
async def save_page_canvas(page_id: str, payload: dict, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    updates = {}
    if "viewport" in payload:
        updates["viewport"] = payload["viewport"]
    if "canvas_data" in payload:
        updates["canvas_data"] = payload["canvas_data"] or {}
    elif any(key in payload for key in ("elements", "appState", "files")):
        updates["canvas_data"] = {
            "elements": payload.get("elements") or [],
            "appState": payload.get("appState") or {},
            "files": payload.get("files") or {},
        }

    if not updates:
        raise HTTPException(status_code=400, detail="viewport or canvas_data required")

    await db.update_page(page_id, user_id=user_id, **updates)
    await cache_svc.invalidate_canvas(page_id)

    # Sync positions from scene → DB (scene is authority)
    try:
        scene = updates.get("canvas_data")
        if scene:
            await canvas_state.sync_scene_to_db(page_id, scene)
    except Exception as e:
        logger.warning(f"Position sync from scene failed: {e}")

    return {"status": "saved"}


@router.post("/pages/{page_id}/layout")
async def trigger_page_layout(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Use spatial planner for full layout
    positions = await spatial_planner.compute_full_layout(page_id)

    for p in positions:
        await db.update_note(p["note_id"], canvas_x=p["x"], canvas_y=p["y"])

    # Resolve overlaps
    moves = await spatial_planner.resolve_overlaps(page_id)
    for m in moves:
        await db.update_note(m["note_id"], canvas_x=m["x"], canvas_y=m["y"])

    # Sync excalidraw
    from app.services.excalidraw_scene import sync_page_notes_to_canvas
    await sync_page_notes_to_canvas(page_id)

    return await db.get_page_canvas(page_id)