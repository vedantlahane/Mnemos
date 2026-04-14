# === FILE: backend/app/routes/capture.py ===

from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from app.models.schemas import CaptureRequest
from app.db.supabase import db
from app.services.processor import processor
from app.auth.dependencies import get_optional_user_id

router = APIRouter()

MIN_TEXT_LENGTH = 3
MAX_TEXT_LENGTH = 50_000


@router.post("/capture")
async def capture_note(
    payload: CaptureRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_optional_user_id),
):
    text = payload.text.strip()
    if len(text) < MIN_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text too short (min {MIN_TEXT_LENGTH} chars)")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text too long (max {MAX_TEXT_LENGTH} chars)")

    note = await db.insert_note(
        raw_text=text,
        source_url=payload.source_url,
        page_title=payload.page_title,
        capture_type=payload.capture_type,
        processing_status="pending",
        user_id=user_id,
    )

    background_tasks.add_task(
        processor.process_note,
        note_id=note["id"],
        raw_text=text,
        page_hint=payload.page_hint,
        viewport=payload.viewport,
    )

    return {"status": "saved", "note_id": note["id"]}