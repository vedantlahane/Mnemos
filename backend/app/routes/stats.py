from fastapi import APIRouter, HTTPException
from app.db.supabase import db

router = APIRouter()


@router.get("/stats")
async def get_global_stats():
    stats = await db.get_global_stats()
    return stats


@router.get("/pages/{page_id}/stats")
async def get_page_stats(page_id: str):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    stats = await db.get_page_stats(page_id)
    return stats