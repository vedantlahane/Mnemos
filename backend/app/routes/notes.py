from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Optional
from app.models.schemas import NoteUpdate, NoteMoveRequest
from app.db.supabase import db
from app.services.processor import processor

router = APIRouter()


@router.get("/notes")
async def list_notes(
    page: int = 1,
    limit: int = 20,
    tag: Optional[str] = None,
    page_id: Optional[str] = None,
):
    return await db.list_notes(page=page, limit=limit, tag=tag, page_id=page_id)


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
    note = await db.get_note(note_id)
    if note and note.get("page_id"):
        await db.decrement_page_note_count(note["page_id"])
    await db.delete_note(note_id)
    return {"status": "deleted"}


@router.get("/tags")
async def get_all_tags():
    tags = await db.get_all_tags_with_counts()
    return {"tags": tags}


@router.post("/notes/{note_id}/retry")
async def retry_processing(note_id: str, background_tasks: BackgroundTasks):
    note = await db.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note["processing_status"] not in ("failed", "pending"):
        raise HTTPException(
            status_code=400,
            detail=f"Note status is '{note['processing_status']}', not retryable",
        )

    await db.update_note(note_id, processing_status="pending")
    background_tasks.add_task(
        processor.process_note,
        note_id=note_id,
        raw_text=note["raw_text"],
    )
    return {"status": "retrying", "note_id": note_id}


@router.post("/notes/{note_id}/move")
async def move_note(note_id: str, payload: NoteMoveRequest):
    note = await db.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    old_page_id = note.get("page_id")
    new_page_id = payload.page_id

    # Verify new page exists
    new_page = await db.get_page(new_page_id)
    if not new_page:
        raise HTTPException(status_code=404, detail="Target page not found")

    # Update note
    await db.update_note(note_id, page_id=new_page_id, cluster_id=None)

    # Update page counts
    if old_page_id:
        await db.decrement_page_note_count(old_page_id)
    await db.increment_page_note_count(new_page_id)

    # Re-place on canvas
    try:
        from app.services.cartographer import cartographer
        placement = await cartographer.place_single_note(note_id, new_page_id)
        if placement:
            await db.update_note(
                note_id,
                canvas_x=placement["x"],
                canvas_y=placement["y"],
                cluster_id=placement.get("cluster_id"),
            )
    except Exception as e:
        print(f"Re-placement after move failed: {e}")

    return {
        "status": "moved",
        "note_id": note_id,
        "page_id": new_page_id,
        "page_name": new_page["name"],
    }