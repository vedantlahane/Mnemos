from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from app.models.schemas import CaptureRequest, ContextRequest
from app.db.supabase import db
from app.services.processor import processor
from app.services import embeddings
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.capture")
router = APIRouter()

MIN_TEXT_LENGTH = 3
MAX_TEXT_LENGTH = 50_000

CONTEXT_CONFIG = {
    "similarity_threshold": 0.70,
    "max_results": 3,
    "min_text_length": 100,
    "excluded_domains": [
        "google.com", "google.com/search", "mail.google.com",
        "github.com/search", "localhost", "chrome://",
    ],
}

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

    metadata = {}
    if payload.custom_command:
        metadata["custom_command"] = payload.custom_command

    note = await db.insert_note(
        raw_text=text,
        source_url=payload.source_url,
        source_title=payload.source_title,
        capture_type=payload.capture_type,
        processing_status="pending",
        user_id=user_id,
        metadata=metadata
    )

    background_tasks.add_task(
        processor.process_note,
        note_id=note["id"],
        raw_text=text,
        page_hint=payload.page_hint,
        viewport=payload.viewport,
    )

    return {"status": "saved", "note_id": note["id"]}

@router.post("/context")
async def check_context(payload: ContextRequest):
    for domain in CONTEXT_CONFIG["excluded_domains"]:
        if domain in payload.url:
            return {"related_notes": []}
    if len(payload.text) < CONTEXT_CONFIG["min_text_length"]:
        return {"related_notes": []}

    try:
        page_embedding = await embeddings.generate_query(payload.text[:1000])
        related = await db.vector_search(
            embedding=page_embedding, 
            limit=CONTEXT_CONFIG["max_results"],
            threshold=CONTEXT_CONFIG["similarity_threshold"],
        )

        enriched = []
        for note in related:
            page_name = None
            page_id = note.get("page_id")
            if not page_id:
                try:
                    full_note = await db.get_note(note["id"])
                    page_id = full_note.get("page_id") if full_note else None
                except Exception:
                    pass
            if page_id:
                try:
                    page = await db.get_page(page_id)
                    if page:
                        page_name = page["name"]
                except Exception:
                    pass
            enriched.append({**note, "page_id": page_id, "page_name": page_name})

        return {"related_notes": enriched}
    except Exception as e:
        logger.error(f"Context check failed: {e}")
        return {"related_notes": []}
