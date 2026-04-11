from fastapi import APIRouter, HTTPException
from typing import Optional
from app.models.schemas import NoteUpdate
from app.db.supabase import db

router = APIRouter()


@router.get("/notes")
async def list_notes(
    page: int = 1,
    limit: int = 20,
    tag: Optional[str] = None,
):
    return await db.list_notes(page=page, limit=limit, tag=tag)


@router.get("/notes/{note_id}")
async def get_note(note_id: str):
    note = await db.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NoteUpdate):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    note = await db.update_note(note_id, **updates)
    return note


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    await db.delete_note(note_id)
    return {"status": "deleted"}


@router.get("/tags")
async def get_all_tags():
    tags = await db.get_all_tags()
    return {"tags": tags}