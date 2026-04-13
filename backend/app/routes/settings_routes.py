from fastapi import APIRouter, Depends
from typing import Optional
from pydantic import BaseModel
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()

DEFAULT_SETTINGS = {
    "theme": "glass",
    "model": "gemini-2.5-flash",
    "groq_model": "llama-3.3-70b-versatile",
    "similarity_threshold": 0.65,
    "embedding_dimensions": 768,
    "auto_layout": True,
    "auto_connect": True,
}


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    model: Optional[str] = None
    groq_model: Optional[str] = None
    similarity_threshold: Optional[float] = None
    embedding_dimensions: Optional[int] = None
    auto_layout: Optional[bool] = None
    auto_connect: Optional[bool] = None


@router.get("/settings")
async def get_settings(user_id: str = Depends(get_optional_user_id)):
    stored = await db.get_settings(user_id=user_id)
    if not stored:
        return DEFAULT_SETTINGS
    # Merge with defaults for any missing keys
    result = {**DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if v is not None and k in DEFAULT_SETTINGS}}
    return result


@router.put("/settings")
async def update_settings(payload: SettingsUpdate, user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return await get_settings(user_id)

    stored = await db.upsert_settings(user_id=user_id, **updates)
    result = {**DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if v is not None and k in DEFAULT_SETTINGS}}
    return result