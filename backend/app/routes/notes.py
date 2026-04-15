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
async def list_notes(page: int = 1, limit: int = 20, tag: Optional[str] = None,
                     page_id: Optional[str] = None, user_id: str = Depends(get_optional_user_id)):
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
        raise HTTPException(status_code=400, detail="No fields")
    note = await db.update_note(note_id, user_id=user_id, **updates)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    # Sync to scene
    if note.get("page_id"):
        try:
            from app.services.scene_manager import scene_manager
            pos = await db.get_note_position(note["page_id"], note_id)
            x = float(pos["x"]) if pos and pos.get("x") else 400
            y = float(pos["y"]) if pos and pos.get("y") else 400
            await scene_manager.upsert_note_card(note["page_id"], note, x, y)
        except Exception as e:
            logger.warning(f"Scene sync failed: {e}")
    return note


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.get("page_id"):
        try:
            from app.services.scene_manager import scene_manager
            await scene_manager.remove_note_card(note["page_id"], note_id)
        except Exception as e:
            logger.warning(f"Scene removal failed: {e}")
    await db.delete_note(note_id, user_id=user_id)
    return {"status": "deleted"}


@router.get("/tags")
async def get_tags(user_id: str = Depends(get_optional_user_id)):
    return {"tags": await db.get_all_tags_with_counts(user_id=user_id)}


@router.post("/notes/{note_id}/retry")
async def retry_processing(note_id: str, background_tasks: BackgroundTasks,
                           user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note["processing_status"] not in ("failed", "pending"):
        raise HTTPException(status_code=400, detail="Not retryable")
    await db.update_note(note_id, user_id=user_id, processing_status="pending")
    background_tasks.add_task(processor.process_note, note_id=note_id, raw_text=note["raw_text"])
    return {"status": "retrying"}

# === FILE: backend/app/routes/notes.py (CONTINUED) ===

@router.post("/notes/{note_id}/move")
async def move_note(note_id: str, payload: NoteMoveRequest, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    old_page_id = note.get("page_id")
    new_page_id = payload.page_id

    # Verify target page exists
    target_page = await db.get_page(new_page_id, user_id=user_id)
    if not target_page:
        raise HTTPException(status_code=404, detail="Target page not found")

    # Remove from old page's scene
    if old_page_id and old_page_id != new_page_id:
        try:
            from app.services.scene_manager import scene_manager
            await scene_manager.remove_note_card(old_page_id, note_id)
        except Exception as e:
            logger.warning(f"Remove from old scene failed: {e}")

    # Update note's page
    updated = await db.update_note(note_id, user_id=user_id, page_id=new_page_id)

    # Place on new page's scene
    try:
        from app.services.scene_manager import scene_manager
        from app.models.canvas_ops import Viewport

        placement = await spatial_planner.find_placement(
            page_id=new_page_id, note=updated or note, strategy="auto",
        )
        await scene_manager.upsert_note_card(new_page_id, updated or note, placement.x, placement.y)
    except Exception as e:
        logger.warning(f"Place on new scene failed: {e}")

    return {"status": "moved", "from_page": old_page_id, "to_page": new_page_id}