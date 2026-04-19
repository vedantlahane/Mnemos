import asyncio
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from app.models.schemas import CaptureRequest, ContextRequest
from app.db.supabase import db
from app.services.capture import process_note
from app.services import cache as cache_svc
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.post("/capture")
async def capture(payload: CaptureRequest, background: BackgroundTasks,
                  user_id: str = Depends(get_optional_user_id)):
    note = await db.insert_note(
        raw_text=payload.text,
        source_url=payload.source_url,
        source_title=payload.source_title,
        capture_type=payload.capture_type,
        user_id=user_id,
        processing_status="pending",
    )

    background.add_task(
        process_note,
        note_id=note["id"],
        raw_text=payload.text,
        page_hint=payload.page_hint,
        viewport=payload.viewport,
    )

    await cache_svc.invalidate_overview()
    return {
        "note_id": note["id"],
        "status": "processing",
        "message": "Note captured and processing started",
    }


@router.post("/capture/batch")
async def capture_batch(payloads: list[CaptureRequest], background: BackgroundTasks,
                        user_id: str = Depends(get_optional_user_id)):
    results = []
    for payload in payloads[:20]:  # Max 20 at once
        note = await db.insert_note(
            raw_text=payload.text,
            source_url=payload.source_url,
            source_title=payload.source_title,
            capture_type=payload.capture_type,
            user_id=user_id,
            processing_status="pending",
        )
        background.add_task(
            process_note,
            note_id=note["id"],
            raw_text=payload.text,
            page_hint=payload.page_hint,
            viewport=payload.viewport,
        )
        results.append({"note_id": note["id"], "status": "processing"})

    await cache_svc.invalidate_overview()
    return {"captured": results, "count": len(results)}


@router.post("/capture/context")
async def capture_with_context(payload: ContextRequest, background: BackgroundTasks,
                               user_id: str = Depends(get_optional_user_id)):
    note = await db.insert_note(
        raw_text=payload.text,
        source_url=payload.url,
        capture_type="extension",
        user_id=user_id,
        processing_status="pending",
    )

    background.add_task(
        process_note,
        note_id=note["id"],
        raw_text=payload.text,
    )

    await cache_svc.invalidate_overview()
    return {"note_id": note["id"], "status": "processing"}


@router.get("/capture/status/{note_id}")
async def capture_status(note_id: str, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return {
        "note_id": note["id"],
        "status": note.get("processing_status", "unknown"),
        "title": note.get("title"),
        "page_id": note.get("page_id"),
    }


@router.post("/capture/retry/{note_id}")
async def retry_capture(note_id: str, background: BackgroundTasks,
                        user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.get("processing_status") not in ("failed", "pending"):
        raise HTTPException(status_code=400, detail="Note is not in a retryable state")

    await db.update_note(note_id, processing_status="pending")
    background.add_task(
        process_note,
        note_id=note["id"],
        raw_text=note["raw_text"],
    )
    return {"note_id": note_id, "status": "retrying"}