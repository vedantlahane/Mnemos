# === FILE: backend/app/routes/pages.py ===

from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import PageCreate, PageUpdate
from app.db.supabase import db
from app.services import cache as cache_svc
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/pages")
async def list_pages(include_archived: bool = False, user_id: str = Depends(get_optional_user_id)):
    return {"pages": await db.list_pages(include_archived=include_archived, user_id=user_id)}


@router.post("/pages")
async def create_page(payload: PageCreate, user_id: str = Depends(get_optional_user_id)):
    existing = await db.get_page_by_name(payload.name, user_id=user_id)
    if existing:
        raise HTTPException(status_code=400, detail=f"Page '{payload.name}' already exists")
    return await db.insert_page(
        name=payload.name, description=payload.description,
        icon=payload.icon, color=payload.color,
        layout_mode=payload.layout_mode, user_id=user_id,
    )


@router.get("/pages/{page_id}")
async def get_page(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await cache_svc.get_page_cached(page_id, fetcher=lambda: db.get_page(page_id, user_id=user_id))
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/pages/{page_id}")
async def update_page(page_id: str, payload: PageUpdate, user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields")
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