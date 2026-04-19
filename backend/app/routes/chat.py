# === FILE: backend/app/routes/chat.py ===

"""
THE route. One endpoint. Chat drives everything.
Plus canvas sync and SSE.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from app.commands import router as cmd_router
from app.commands.handlers import handle
from app.auth.dependencies import get_optional_user_id
from app.db.repo import repo
from app.services.sync import handle_sync
from app.services.broadcaster import broadcaster
import asyncio
import json

router = APIRouter()


class ChatMessage(BaseModel):
    message: str
    workspace_id: Optional[str] = None
    history: list[dict] = []


class SyncPayload(BaseModel):
    base_version: int
    scene: Optional[dict] = None


# ═══════════════════════════════════════
# THE chat endpoint — one input, everything happens
# ═══════════════════════════════════════

@router.post("/chat")
async def chat(payload: ChatMessage,
               user_id: str = Depends(get_optional_user_id)):
    """
    Single chat endpoint. User types anything:
    - "show boards" → returns board list + ui_action
    - "remember Docker is great" → captures item
    - "draw diagram about ML" → creates diagram on canvas
    - "what is Docker?" → answers from knowledge base
    """
    # Build context for classifier
    context = {"owner_id": user_id}
    if payload.workspace_id:
        ws = await repo.get_workspace(payload.workspace_id, owner_id=user_id)
        if ws:
            context["workspace_id"] = ws["id"]
            context["workspace_name"] = ws["display_name"]

    # Classify intent
    classified = await cmd_router.classify(payload.message, context)

    # Handle it
    result = await handle(
        intent=classified["intent"],
        action=classified["action"],
        params=classified["params"],
        message=payload.message,
        owner_id=user_id,
        workspace_id=payload.workspace_id,
    )

    return {
        "text": result.text,
        "intent": result.intent,
        "ui_action": result.ui_action,
        "data": result.data,
        "canvas_update": result.canvas_update,
        "error": result.error,
    }


# ═══════════════════════════════════════
# Canvas sync — Excalidraw ↔ backend
# ═══════════════════════════════════════

@router.post("/workspaces/{workspace_id}/sync")
async def sync(workspace_id: str, payload: SyncPayload,
               user_id: str = Depends(get_optional_user_id)):
    ws = await repo.get_workspace(workspace_id, owner_id=user_id)
    if not ws:
        # === FILE: backend/app/routes/chat.py (continued) ===

        raise HTTPException(404, "Workspace not found")

    result = await handle_sync(
        workspace_id=workspace_id,
        base_version=payload.base_version,
        incoming_scene=payload.scene,
        owner_id=user_id,
    )
    return result


@router.get("/workspaces/{workspace_id}/scene")
async def get_scene(workspace_id: str,
                    user_id: str = Depends(get_optional_user_id)):
    """
    Get the full rendered scene for a workspace.
    This REBUILDS from source-of-truth tables every time.
    """
    from app.canvas import canvas_renderer

    ws = await repo.get_workspace(workspace_id, owner_id=user_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")

    stored = await repo.get_canvas(workspace_id)
    items = await repo.get_items_for_workspace(workspace_id, user_id)
    placements = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    user_drawn = canvas_renderer.extract_user_drawn(
        stored["scene"].get("elements", []),
    )

    scene = canvas_renderer.build_scene(
        items, placements, objects, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )

    return {
        "scene": scene,
        "version": stored["version"],
        "workspace_id": workspace_id,
    }


@router.get("/workspaces/{workspace_id}/version")
async def get_version(workspace_id: str):
    stored = await repo.get_canvas(workspace_id)
    return {"version": stored["version"], "workspace_id": workspace_id}


# ═══════════════════════════════════════
# SSE — real-time canvas updates
# ═══════════════════════════════════════

@router.get("/workspaces/{workspace_id}/events")
async def sse_events(workspace_id: str):
    """Server-Sent Events for real-time canvas updates."""
    queue = broadcaster.subscribe(workspace_id)

    async def stream():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'workspace_id': workspace_id})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield f": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(workspace_id, queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )