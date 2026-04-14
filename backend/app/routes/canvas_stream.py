# === FILE: backend/app/routes/canvas_stream.py ===
"""
SSE streaming endpoint for canvas brain operations.
This is the primary interface for canvas-aware chat.
"""

from __future__ import annotations
import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.models.canvas_ops import CanvasStreamRequest, CanvasOp, OpType, Viewport
from app.agents.canvas_brain import canvas_brain_graph
from app.services.composition import stream_compose
from app.services.spatial_planner import spatial_planner
from app.services.element_layout import measure_text
from app.services.excalidraw_scene import add_measured_text_to_canvas
from app.services.intent_classifier import classify_intent
from app.models.canvas_ops import Intent, make_element_id
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

logger = logging.getLogger("mnemos.canvas_stream")

router = APIRouter()


def _sse_line(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _safe_measure_text(text: str, max_width: int = 400) -> dict:
    """Measure text with a resilient fallback for streaming updates."""
    try:
        return measure_text(
            text,
            font_size=16,
            font_family=1,
            max_width=max_width,
        )
    except Exception as e:
        logger.warning(f"Text measurement failed during stream: {e}")
        lines = (text or "").splitlines() or [""]
        max_line_len = max((len(line) for line in lines), default=1)
        est_width = min(max(20, max_line_len * 8), max_width)
        est_height = max(24, len(lines) * 24)
        return {
            "wrapped_text": text or "",
            "width": float(est_width),
            "height": float(est_height),
        }


@router.post("/canvas/{page_id}/stream")
async def canvas_stream(
    page_id: str,
    payload: CanvasStreamRequest,
    user_id: str = Depends(get_optional_user_id),
):
    """SSE endpoint: canvas brain processes user message and streams operations."""

    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        async def error_stream():
            yield _sse_line("error", {"message": "Page not found"})
            yield _sse_line("done", {})
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    # Classify intent
    intent, topic, meta = classify_intent(payload.message)

    # For compose intent, use streaming composition
    if intent == Intent.COMPOSE:
        return StreamingResponse(
            _stream_compose(
                page_id=page_id,
                topic=topic or payload.message,
                user_id=user_id,
                viewport=payload.viewport,
            ),
            media_type="text/event-stream",
        )

    # For all other intents, use canvas brain graph
    async def brain_stream():
        try:
            # Emit intent classification
            yield _sse_line("intent", {
                "intent": intent.value,
                "topic": topic,
                "metadata": meta,
            })

            initial_state = {
                "user_message": payload.message,
                "page_id": page_id,
                "user_id": user_id,
                "viewport": payload.viewport.model_dump() if payload.viewport else None,
                "canvas_snapshot": None,
                "history": payload.history,
                "selected_element_ids": payload.selected_element_ids,
                "intent": intent.value,
                "sub_intent": meta.get("sub_intent", ""),
                "target_topic": topic,
                "intent_metadata": meta,
                "operations": [],
                "chat_response": None,
                "sources": [],
                "follow_ups": [],
                "errors": [],
                "status": "starting",
            }

            result = await canvas_brain_graph.ainvoke(initial_state)

            # Emit operations
            for op in (result.get("operations") or []):
                yield _sse_line("canvas_op", op)

            # Emit chat response
            if result.get("chat_response"):
                yield _sse_line("chat", {"content": result["chat_response"]})

            # Emit sources
            if result.get("sources"):
                yield _sse_line("sources", {"sources": result["sources"]})

            # Emit follow-ups
            if result.get("follow_ups"):
                yield _sse_line("follow_ups", {"follow_ups": result["follow_ups"]})

            # Emit errors
            for err in (result.get("errors") or []):
                yield _sse_line("error", {"message": err})

        except Exception as e:
            logger.error(f"Canvas brain error: {e}")
            yield _sse_line("error", {"message": str(e)[:200]})
            yield _sse_line("chat", {"content": f"Sorry, I encountered an error: {str(e)[:100]}"})

        yield _sse_line("done", {})

    return StreamingResponse(brain_stream(), media_type="text/event-stream")


async def _stream_compose(
    page_id: str,
    topic: str,
    user_id: str | None,
    viewport: Viewport | None,
) -> AsyncIterator[str]:
    """Stream composed content with measured width/height updates."""

    yield _sse_line("intent", {"intent": "compose", "topic": topic})

    element_id = make_element_id("compose")
    max_width = 400

    # Initial estimate to improve initial placement before text arrives.
    initial_measurement = _safe_measure_text(topic, max_width=max_width)

    # Plan placement
    try:
        placement = await spatial_planner.find_placement(
            page_id=page_id,
            viewport=viewport,
            near_topic=topic,
            size=(initial_measurement["width"] + 24, initial_measurement["height"] + 24),
            strategy="auto",
        )
        x, y = placement.x, placement.y
    except Exception:
        x, y = 200.0, 200.0

    # Start stream
    yield _sse_line("canvas_op", CanvasOp(
        op=OpType.STREAM_START,
        element_id=element_id,
        x=x, y=y,
        width=initial_measurement["width"],
        height=initial_measurement["height"],
        style="compose",
        message=f"Writing about {topic}…",
    ).model_dump())

    # Stream content
    full_text = ""
    latest_measurement = initial_measurement
    last_measured_length = 0
    try:
        async for chunk in stream_compose(topic, page_id=page_id, user_id=user_id):
            if not chunk:
                continue

            full_text += chunk

            should_measure = (
                len(full_text) <= 120
                or "\n" in chunk
                or len(full_text) - last_measured_length >= 120
            )

            if should_measure:
                latest_measurement = _safe_measure_text(full_text, max_width=max_width)
                last_measured_length = len(full_text)

            yield _sse_line("canvas_op", CanvasOp(
                op=OpType.STREAM_CHUNK,
                element_id=element_id,
                text=chunk,
                width=latest_measurement["width"],
                height=latest_measurement["height"],
            ).model_dump())
    except Exception as e:
        logger.error(f"Stream compose error: {e}")
        yield _sse_line("error", {"message": f"Composition error: {str(e)[:100]}"})

    if full_text and len(full_text) != last_measured_length:
        latest_measurement = _safe_measure_text(full_text, max_width=max_width)

    # Finalize
    yield _sse_line("canvas_op", CanvasOp(
        op=OpType.STREAM_END,
        element_id=element_id,
        text=full_text,
        width=latest_measurement["width"],
        height=latest_measurement["height"],
    ).model_dump())

    # Save with measured dimensions (uses text_measure.mjs through layout service).
    if full_text.strip():
        try:
            await add_measured_text_to_canvas(
                page_id=page_id,
                text=full_text,
                x=x,
                y=y,
                max_width=max_width,
                element_id=element_id,
            )
        except Exception as e:
            logger.error(f"Failed to save composed text: {e}")

    yield _sse_line("chat", {
        "content": f"I've written about **{topic}** and placed it on your canvas.",
    })
    yield _sse_line("done", {})