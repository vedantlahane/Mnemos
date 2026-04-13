from fastapi import APIRouter, HTTPException
from app.models.schemas import PageCreate, PageUpdate
from app.db.supabase import db

router = APIRouter()


@router.get("/pages")
async def list_pages(include_archived: bool = False):
    pages = await db.list_pages(include_archived=include_archived)
    return {"pages": pages}


@router.post("/pages")
async def create_page(payload: PageCreate):
    existing = await db.get_page_by_name(payload.name)
    if existing:
        raise HTTPException(status_code=400, detail=f"Page '{payload.name}' already exists")

    page = await db.insert_page(
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
        color=payload.color,
    )
    return page


@router.get("/pages/{page_id}")
async def get_page(page_id: str):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/pages/{page_id}")
async def update_page(page_id: str, payload: PageUpdate):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Prevent renaming to existing name
    if "name" in updates:
        existing = await db.get_page_by_name(updates["name"])
        if existing and existing["id"] != page_id:
            raise HTTPException(status_code=400, detail=f"Page '{updates['name']}' already exists")

    updated = await db.update_page(page_id, **updates)
    return updated


@router.delete("/pages/{page_id}")
async def delete_page(page_id: str):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if page["name"] == "Uncategorized":
        raise HTTPException(status_code=400, detail="Cannot delete the Uncategorized page")

    await db.delete_page(page_id)
    return {"status": "deleted"}


@router.get("/pages/{page_id}/canvas")
async def get_page_canvas(page_id: str):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    canvas = await db.get_page_canvas(page_id)
    return canvas


@router.put("/pages/{page_id}/canvas")
async def save_page_canvas(page_id: str, payload: dict):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    updates = {}
    if "viewport" in payload:
        updates["viewport"] = payload.get("viewport")
    if "canvas_data" in payload:
        updates["canvas_data"] = payload.get("canvas_data") or {}
    elif any(key in payload for key in ("elements", "appState", "files")):
        updates["canvas_data"] = {
            "elements": payload.get("elements") or [],
            "appState": payload.get("appState") or {},
            "files": payload.get("files") or {},
        }

    if not updates:
        raise HTTPException(status_code=400, detail="viewport or canvas_data required")

    await db.update_page(page_id, **updates)
    return {"status": "saved"}


@router.post("/pages/{page_id}/layout")
async def trigger_page_layout(page_id: str):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    from app.services.cartographer import cartographer
    result = await cartographer.compute_full_layout(page_id)
    return result
