from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.models.schemas import CaptureRequest
from app.db.supabase import db
from app.services.processor import processor

router = APIRouter()

# Limits
MIN_TEXT_LENGTH = 3
MAX_TEXT_LENGTH = 50_000


@router.post("/capture")
async def capture_note(
    payload: CaptureRequest,
    background_tasks: BackgroundTasks,
):
    # Validate text
    text = payload.text.strip()
    if len(text) < MIN_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text too short (minimum {MIN_TEXT_LENGTH} characters)",
        )
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text too long (maximum {MAX_TEXT_LENGTH} characters)",
        )

    # Phase 1: Save immediately (< 500ms)
    note = await db.insert_note(
        raw_text=text,
        source_url=payload.source_url,
        page_title=payload.page_title,
        capture_type=payload.capture_type,
        processing_status="pending",
    )

    # Phase 2: Process in background
    background_tasks.add_task(
        processor.process_note,
        note_id=note["id"],
        raw_text=text,
    )

    return {"status": "saved", "note_id": note["id"]}