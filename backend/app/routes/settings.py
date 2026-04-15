# === FILE: backend/app/routes/settings.py ===

from fastapi import APIRouter, Depends
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/settings")
async def get_settings(user_id: str = Depends(get_optional_user_id)):
    if not user_id:
        return _defaults()
    try:
        result = await db.get_settings(user_id)
        return result or _defaults()
    except Exception:
        return _defaults()


@router.put("/settings")
async def update_settings(payload: dict, user_id: str = Depends(get_optional_user_id)):
    if not user_id:
        return {"status": "saved"}
    allowed = {"theme", "model", "groq_model", "similarity_threshold",
               "embedding_dimensions", "auto_layout", "auto_connect"}
    updates = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if updates:
        await db.upsert_settings(user_id, **updates)
    return {"status": "saved"}


def _defaults():
    return {
        "theme": "dark", "model": "gemini-2.5-flash",
        "groq_model": "llama-3.3-70b-versatile",
        "similarity_threshold": 0.65,
        "embedding_dimensions": 768,
        "auto_layout": True, "auto_connect": True,
    }