# === FILE: backend/app/routes/stats.py ===

from fastapi import APIRouter, HTTPException, Depends
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/stats")
async def get_global_stats(user_id: str = Depends(get_optional_user_id)):
    return await db.get_global_stats(user_id=user_id)


@router.get("/pages/{page_id}/stats")
async def get_page_stats(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return await db.get_page_stats(page_id)