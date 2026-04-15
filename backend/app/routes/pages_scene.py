from fastapi import APIRouter, HTTPException, Depends
from app.db.supabase import db
from app.services.scene_manager import scene_manager
from app.auth.dependencies import get_optional_user_id

router = APIRouter()

@router.get("/pages/{page_id}/scene")
async def get_page_scene(page_id: str, mode: str = "canvas", user_id: str | None = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return await scene_manager.get_scene(page_id, mode)

@router.put("/pages/{page_id}/scene")
async def save_page_scene(page_id: str, payload: dict, mode: str = "canvas", user_id: str | None = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await scene_manager.save_scene(page_id, payload, mode)
    return {"status": "saved"}
