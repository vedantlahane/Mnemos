# === FILE: backend/app/routes/notes.py ===

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from typing import Optional
from app.models.schemas import NoteUpdate, NoteMoveRequest
from app.db.supabase import db
from app.services.processor import processor
from app.services.spatial_planner import spatial_planner
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.notes")

router = APIRouter()


@router.get("/notes")
async def list_notes(
    page: int = 1, limit: int = 20, tag: Optional[str] = None,
    page_id: Optional[str] = None, user_id: str = Depends(get_optional_user_id),
):
    return await db.list_notes(page=page, limit=limit, tag=tag, page_id=page_id, user_id=user_id)


@router.get("/notes/{note_id}")
async def get_note(note_id: str, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NoteUpdate, user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    note = await db.update_note(note_id, user_id=user_id, **updates)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.get("page_id"):
        try:
            from app.services.excalidraw_scene import sync_note_to_canvas
            await sync_note_to_canvas(
                note["page_id"], note,
                x=note.get("canvas_x"), y=note.get("canvas_y"),
            )
        except Exception as e:
            logger.warning(f"Excalidraw sync failed after note update: {e}")
    return note


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.get("page_id"):
        try:
            from app.services.excalidraw_scene import remove_note_from_canvas
            await remove_note_from_canvas(note["page_id"], note_id)
        except Exception as e:
            logger.warning(f"Excalidraw removal failed: {e}")
        await db.decrement_page_note_count(note["page_id"], user_id=user_id)
    await db.delete_note(note_id, user_id=user_id)
    return {"status": "deleted"}


@router.get("/tags")
async def get_all_tags(user_id: str = Depends(get_optional_user_id)):
    tags = await db.get_all_tags_with_counts(user_id=user_id)
    return {"tags": tags}


@router.post("/notes/{note_id}/retry")
async def retry_processing(
    note_id: str, background_tasks: BackgroundTasks,
    user_id: str = Depends(get_optional_user_id),
):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note["processing_status"] not in ("failed", "pending"):
        raise HTTPException(status_code=400, detail=f"Status '{note['processing_status']}' not retryable")

    await db.update_note(note_id, user_id=user_id, processing_status="pending")
    background_tasks.add_task(processor.process_note, note_id=note_id, raw_text=note["raw_text"])
    return {"status": "retrying", "note_id": note_id}


@router.post("/notes/{note_id}/move")
async def move_note(note_id: str, payload: NoteMoveRequest, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    old_page_id = note.get("page_id")
    new_page_id = payload.page_id

    new_page = await db.get_page(new_page_id, user_id=user_id)
    if not new_page:
        raise HTTPException(status_code=404, detail="Target page not found")

    # Update note
    await db.update_note(note_id, user_id=user_id, page_id=new_page_id, cluster_id=None)

    # Remove from old canvas
    if old_page_id:
        try:
            from app.services.excalidraw_scene import remove_note_from_canvas
            await remove_note_from_canvas(old_page_id, note_id)
        except Exception as e:
            logger.warning(f"Excalidraw old-page removal failed: {e}")
        await db.decrement_page_note_count(old_page_id, user_id=user_id)

    await db.increment_page_note_count(new_page_id, user_id=user_id)

    # Place on new canvas
    try:
        moved_note = await db.get_note(note_id, user_id=user_id)
        placement = await spatial_planner.find_placement(
            page_id=new_page_id,
            note=moved_note,
            strategy="auto",
        )
        await db.update_note(
            note_id, user_id=user_id,
            canvas_x=placement.x, canvas_y=placement.y,
            cluster_id=placement.cluster_id,
        )
    except Exception as e:
        logger.warning(f"Re-placement after move failed: {e}")

    # Sync to new canvas
    try:
        from app.services.excalidraw_scene import sync_note_to_canvas
        moved_note = await db.get_note(note_id, user_id=user_id)
        if moved_note:
            await sync_note_to_canvas(
                new_page_id, moved_note,
                x=moved_note.get("canvas_x"), y=moved_note.get("canvas_y"),
            )
    except Exception as e:
        logger.warning(f"Excalidraw new-page sync failed: {e}")

    return {
        "status": "moved",
        "note_id": note_id,
        "page_id": new_page_id,
        "page_name": new_page["name"],
    }