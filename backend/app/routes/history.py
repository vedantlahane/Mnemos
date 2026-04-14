# === FILE: backend/app/routes/history.py ===

from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import ChatSave
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/history")
async def list_history(limit: int = 20, user_id: str = Depends(get_optional_user_id)):
    chats = await db.list_chats(limit=limit, user_id=user_id)
    return {"conversations": chats}


@router.get("/history/{chat_id}")
async def get_history(chat_id: str):
    chat = await db.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return chat


@router.post("/history")
async def save_history(payload: ChatSave, user_id: str = Depends(get_optional_user_id)):
    chat = await db.insert_chat(
        context_type=payload.context_type,
        context_id=payload.context_id,
        messages=payload.messages,
        title=payload.title,
        user_id=user_id,
    )
    return chat


@router.delete("/history/{chat_id}")
async def delete_history(chat_id: str):
    await db.delete_chat(chat_id)
    return {"status": "deleted"}