from fastapi import APIRouter, BackgroundTasks
from app.models.schemas import CaptureRequest
from app.db.supabase import db
from app.services.processor import processor

router = APIRouter()


@router.post("/capture")
async def capture_note(
    payload: CaptureRequest,
    background_tasks: BackgroundTasks,
):
    note = await db.insert_note(
        raw_text=payload.text,
        source_url=payload.source_url,
        page_title=payload.page_title,
        capture_type=payload.capture_type,
        processing_status="pending",
    )

    background_tasks.add_task(
        processor.process_note,
        note_id=note["id"],
        raw_text=payload.text,
    )

    return {"status": "saved", "note_id": note["id"]}