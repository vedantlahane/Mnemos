from fastapi import APIRouter, HTTPException, Depends
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    model: Optional[str] = None
    groq_model: Optional[str] = None
    similarity_threshold: Optional[float] = None
    auto_layout: Optional[bool] = None
    auto_connect: Optional[bool] = None


@router.get("/settings")
async def get_settings(user_id: str = Depends(get_optional_user_id)):
    if not user_id:
        return {
            "theme": "dark",
            "model": "gemini-2.5-flash",
            "groq_model": "llama-3.3-70b-versatile",
            "similarity_threshold": 0.65,
            "auto_layout": True,
            "auto_connect": True,
        }
    s = await db.get_settings(user_id)
    if not s:
        s = await db.upsert_settings(user_id)
    return s


@router.put("/settings")
async def update_settings(payload: SettingsUpdate,
                          user_id: str = Depends(get_optional_user_id)):
    if not user_id:
        return {"status": "auth_disabled", "message": "Settings saved locally only"}
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate model names
    if "model" in updates:
        valid_models = [
            "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash",
            "gemini-1.5-flash", "gemini-1.5-pro",
            "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
            "mixtral-8x7b-32768", "gemma2-9b-it",
            "qwen-qwq-32b", "deepseek-r1-distill-llama-70b",
        ]
        if updates["model"] not in valid_models:
            raise HTTPException(status_code=400, detail=f"Invalid model. Choose from: {', '.join(valid_models)}")

    if "similarity_threshold" in updates:
        t = updates["similarity_threshold"]
        if not (0.0 <= t <= 1.0):
            raise HTTPException(status_code=400, detail="Threshold must be between 0.0 and 1.0")

    result = await db.upsert_settings(user_id, **updates)
    return result


@router.get("/settings/models")
async def list_available_models():
    return {
        "primary": [
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google", "tier": "fast"},
            {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google", "tier": "premium"},
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "provider": "google", "tier": "fast"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "provider": "google", "tier": "fast"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "provider": "google", "tier": "premium"},
        ],
        "secondary": [
            {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "provider": "groq", "tier": "fast"},
            {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "provider": "groq", "tier": "instant"},
            {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "provider": "groq", "tier": "fast"},
            {"id": "gemma2-9b-it", "name": "Gemma 2 9B", "provider": "groq", "tier": "fast"},
            {"id": "qwen-qwq-32b", "name": "Qwen QwQ 32B", "provider": "groq", "tier": "reasoning"},
            {"id": "deepseek-r1-distill-llama-70b", "name": "DeepSeek R1 70B", "provider": "groq", "tier": "reasoning"},
        ],
    }