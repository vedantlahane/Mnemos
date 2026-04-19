from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.schemas import SyncRequest
from app.db.supabase import db
from app.services.sync import handle_sync
from app.services.broadcaster import broadcaster
from app.auth.dependencies import get_optional_user_id
import asyncio
import json

router = APIRouter()


@router.post("/pages/{page_id}/sync")
async def sync_scene(page_id: str, payload: SyncRequest,
                     user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    result = await handle_sync(
        page_id=page_id,
        base_version=payload.base_version,
        changes=payload.changes,
        full_scene=payload.full_scene,
    )
    return result


@router.get("/pages/{page_id}/sync/version")
async def get_sync_version(page_id: str):
    stored = await db.get_scene(page_id)
    return {"version": stored["version"]}


@router.get("/pages/{page_id}/sync/ops")
async def get_ops_since(page_id: str, after_version: int = 0):
    ops = await db.get_scene_ops_since(page_id, after_version)
    return {"ops": ops, "count": len(ops)}


@router.get("/pages/{page_id}/events")
async def sse_events(page_id: str):
    """Server-Sent Events stream for real-time scene updates."""
    queue = broadcaster.subscribe(page_id)

    async def event_stream():
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected', 'page_id': page_id})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive
                    yield f": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(page_id, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )