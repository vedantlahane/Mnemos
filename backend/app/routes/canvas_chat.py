# === FILE: backend/app/routes/canvas_chat.py ===
"""Canvas SSE chat — streaming AI operations on a specific page."""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.canvas_ops import CanvasStreamRequest, CanvasOp, OpType, Viewport
from app.models.visual import VisualContext
from app.db.supabase import db
from app.services.scene_manager import scene_manager
from app.services.visual_analyzer import visual_analyzer
from app.services.intent_classifier import classify_intent, extract_topic, Intent
from app.services.composition import stream_compose, compose_content
from app.services.spatial_planner import spatial_planner
from app.services.element_layout import measure_text
from app.services import cache as cache_svc
from app.auth.dependencies import get_optional_user_id
from app.config import settings
import asyncio
import json
import time
import logging

logger = logging.getLogger("mnemos.routes.canvas_chat")
router = APIRouter()


async def _sse_event(op: CanvasOp) -> str:
    return f"data: {op.model_dump_json()}\n\n"


async def _load_visual_context(page_id: str) -> VisualContext | None:
    try:
        ctx_data = await db.get_visual_context(page_id)
        if ctx_data:
            return VisualContext(page_id=page_id, **{
                k: v for k, v in ctx_data.items()
                if k in VisualContext.model_fields and k != "page_id"
            })
    except Exception:
        pass
    return None


@router.post("/pages/{page_id}/chat")
async def canvas_chat(page_id: str, payload: CanvasStreamRequest,
                      user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    async def stream():
        try:
            message = payload.message.strip()
            if not message:
                yield await _sse_event(CanvasOp(op=OpType.INFO, message="Empty message"))
                yield await _sse_event(CanvasOp(op=OpType.DONE))
                return

            viewport = Viewport(**payload.viewport.model_dump()) if payload.viewport else None
            visual_ctx = await _load_visual_context(page_id)
            intent, topic, meta = classify_intent(message)

            yield await _sse_event(CanvasOp(
                op=OpType.INFO,
                message=f"Intent: {intent.value}, Topic: {topic or message}",
                metadata={"intent": intent.value, "topic": topic},
            ))

            if intent == Intent.COMMAND:
                async for event in _handle_command(page_id, meta, visual_ctx):
                    yield event

            elif intent == Intent.COMPOSE:
                async for event in _handle_compose(page_id, topic or message, viewport, visual_ctx, user_id, meta):
                    yield event

            elif intent == Intent.DIAGRAM:
                async for event in _handle_diagram(page_id, topic or message, viewport, visual_ctx, user_id):
                    yield event

            elif intent == Intent.CAPTURE:
                async for event in _handle_capture(page_id, topic or message, viewport, visual_ctx, user_id):
                    yield event

            elif intent == Intent.ARRANGE:
                async for event in _handle_arrange(page_id, user_id):
                    yield event

            elif intent == Intent.SEARCH:
                async for event in _handle_search(page_id, topic or message, user_id):
                    yield event

            elif intent == Intent.NAVIGATE:
                async for event in _handle_navigate(topic or message, user_id):
                    yield event

            else:
                async for event in _handle_query(page_id, message, payload.history, user_id, visual_ctx):
                    yield event

            yield await _sse_event(CanvasOp(op=OpType.DONE))

        except Exception as e:
            logger.error(f"Canvas chat error: {e}", exc_info=True)
            yield await _sse_event(CanvasOp(op=OpType.ERROR, message=str(e)))
            yield await _sse_event(CanvasOp(op=OpType.DONE))

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Intent handlers ──

async def _handle_command(page_id: str, meta: dict, visual_ctx: VisualContext | None):
    sub = meta.get("sub_intent", "")
    if sub == "set_background":
        color = meta.get("color", "#0e0e1a")
        await scene_manager.set_background(page_id, color)
        yield await _sse_event(CanvasOp(op=OpType.SET_BACKGROUND, color=color,
                                        message=f"Background set to {color}"))
    elif sub == "set_theme":
        theme = meta.get("theme", "dark")
        color = "#0e0e1a" if theme == "dark" else "#ffffff"
        await scene_manager.set_background(page_id, color)
        yield await _sse_event(CanvasOp(op=OpType.SET_THEME, theme=theme,
                                        message=f"Switched to {theme} mode"))
    else:
        yield await _sse_event(CanvasOp(op=OpType.INFO, message=f"Unknown command: {sub}"))


async def _handle_compose(page_id: str, topic: str, viewport: Viewport | None,
                          visual_ctx: VisualContext | None, user_id: str | None,
                          meta: dict):
    # Find placement
    placement = await spatial_planner.find_placement(
        page_id=page_id, viewport=viewport,
        near_topic=topic, strategy="auto",
        visual_context=visual_ctx,
    )

    element_id = f"compose-{int(time.time() * 1000)}"

    # Check for literal text mode
    if meta.get("sub_intent") == "literal_text" or meta.get("mode") == "exact":
        literal = meta.get("literal_text", topic)
        saved, measurement = await scene_manager.add_text_block(
            page_id, literal, placement.x, placement.y,
            font_size=16, max_width=500, element_id=element_id,
        )
        yield await _sse_event(CanvasOp(
            op=OpType.CREATE_TEXT, element_id=element_id,
            x=placement.x, y=placement.y,
            width=measurement["width"], height=measurement["height"],
            text=literal, message="Text placed",
        ))
        return

    # Streaming compose
    yield await _sse_event(CanvasOp(
        op=OpType.STREAM_START, element_id=element_id,
        x=placement.x, y=placement.y,
        message=f"Writing about: {topic}",
    ))

    full_text = ""
    async for chunk in stream_compose(topic, page_id=page_id, user_id=user_id):
        full_text += chunk
        yield await _sse_event(CanvasOp(
            op=OpType.STREAM_CHUNK, element_id=element_id, text=chunk,
        ))
        await asyncio.sleep(settings.stream_chunk_delay)

    if full_text.strip():
        saved, measurement = await scene_manager.add_text_block(
            page_id, full_text.strip(), placement.x, placement.y,
            font_size=16, max_width=500, element_id=element_id,
        )
        yield await _sse_event(CanvasOp(
            op=OpType.STREAM_END, element_id=element_id,
            x=placement.x, y=placement.y,
            width=measurement["width"], height=measurement["height"],
            text=full_text.strip(), message="Composition complete",
        ))
    else:
        yield await _sse_event(CanvasOp(
            op=OpType.ERROR, message="No content generated",
        ))


async def _handle_diagram(page_id: str, topic: str, viewport: Viewport | None,
                          visual_ctx: VisualContext | None, user_id: str | None):
    from app.llm import router as llm

    yield await _sse_event(CanvasOp(op=OpType.INFO, message=f"Generating diagram: {topic}"))

    try:
        topology = await llm.generate_diagram(topic, user_id=user_id)
    except Exception as e:
        yield await _sse_event(CanvasOp(op=OpType.ERROR, message=f"Diagram generation failed: {e}"))
        return

    placement = await spatial_planner.find_placement(
        page_id=page_id, viewport=viewport,
        near_topic=topic, strategy="auto",
        visual_context=visual_ctx,
        size=(600, 400),
    )

    scene = await scene_manager.add_diagram(page_id, topology, placement.x, placement.y)

    yield await _sse_event(CanvasOp(
        op=OpType.CREATE_DIAGRAM,
        x=placement.x, y=placement.y,
        topology=topology, message="Diagram created",
    ))


async def _handle_capture(page_id: str, text: str, viewport: Viewport | None,
                          visual_ctx: VisualContext | None, user_id: str | None):
    from app.services.processor import processor

    note = await db.insert_note(
        raw_text=text, capture_type="canvas_chat",
        page_id=page_id, user_id=user_id,
        processing_status="pending",
    )

    yield await _sse_event(CanvasOp(
        op=OpType.INFO, note_id=note["id"],
        message=f"Captured note, processing...",
    ))

    # Process inline (not background) so we can place it
    await processor.process_note(
        note_id=note["id"], raw_text=text,
        viewport=viewport.model_dump() if viewport else None,
    )

    processed = await db.get_note(note["id"])
    if processed:
        yield await _sse_event(CanvasOp(
            op=OpType.CREATE_NOTE,
            note_id=note["id"],
            note=processed,
            message=f"Note placed: {processed.get('title', 'Untitled')}",
        ))


async def _handle_arrange(page_id: str, user_id: str | None):
    yield await _sse_event(CanvasOp(op=OpType.INFO, message="Reorganizing canvas..."))

    positions = await spatial_planner.compute_full_layout(page_id)

    for p in positions:
        note = await db.get_note(p["note_id"])
        if note:
            await scene_manager.upsert_note_card(page_id, note, p["x"], p["y"])

    moves = await spatial_planner.resolve_overlaps(page_id)
    if moves:
        scene = await scene_manager.get_scene(page_id)
        for m in moves:
            if m.get("note_id"):
                note = await db.get_note(m["note_id"])
                if note:
                    scene_manager._upsert_note_card_elements(scene, note, m["x"], m["y"])
        await scene_manager.save_scene(page_id, scene)

    yield await _sse_event(CanvasOp(
        op=OpType.ARRANGE_CLUSTER,
        message=f"Arranged {len(positions)} notes, resolved {len(moves)} overlaps",
        metadata={"positions": len(positions), "overlaps": len(moves)},
    ))


async def _handle_search(page_id: str, query: str, user_id: str | None):
    from app.services import embeddings

    try:
        emb = await embeddings.generate_query(query)
        results = await db.vector_search_in_page(emb, page_id, limit=5, threshold=0.5)
        if not results:
            results = await db.vector_search(emb, limit=5, threshold=0.55)

        if user_id:
            results = [r for r in results if r.get("user_id") == user_id]

        if results:
            msg = f"Found {len(results)} notes:\n" + "\n".join(
                f"• {r.get('title', 'Untitled')} ({r.get('similarity', 0):.0%})" for r in results
            )
            yield await _sse_event(CanvasOp(
                op=OpType.INFO, message=msg,
                metadata={"results": [{"id": r["id"], "title": r.get("title")} for r in results]},
            ))
        else:
            yield await _sse_event(CanvasOp(op=OpType.INFO, message=f"No notes found for '{query}'"))
    except Exception as e:
        yield await _sse_event(CanvasOp(op=OpType.ERROR, message=f"Search failed: {e}"))


async def _handle_navigate(target: str, user_id: str | None):
    page = await db.get_page_by_name(target, user_id=user_id)
    if page:
        yield await _sse_event(CanvasOp(
            op=OpType.INFO, message=f"Navigate to: {page['name']}",
            metadata={"navigate_to_page": page["id"], "page_name": page["name"]},
        ))
    else:
        yield await _sse_event(CanvasOp(op=OpType.INFO, message=f"Page '{target}' not found"))


async def _handle_query(page_id: str, message: str, history: list, user_id: str | None,
                        visual_ctx: VisualContext | None):
    from app.services import embeddings
    from app.llm import router as llm

    context_parts = []
    try:
        emb = await embeddings.generate_query(message)
        relevant = await db.vector_search_in_page(emb, page_id, limit=6, threshold=0.5)
        if len(relevant) < 2:
            extra = await db.vector_search(emb, limit=4, threshold=0.55)
            seen = {r["id"] for r in relevant}
            relevant.extend(r for r in extra if r["id"] not in seen)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]
        for note in relevant:
            context_parts.append(
                f"[{note.get('title', 'Untitled')}]: {note.get('summary') or note.get('raw_text', '')[:300]}"
            )
    except Exception:
        pass

    # Add visual context to system prompt
    visual_desc = ""
    if visual_ctx:
        visual_desc = f"\nCanvas state: {visual_ctx.theme} theme, {visual_ctx.layout_pattern.value} layout, {visual_ctx.density.value} density, {visual_ctx.element_count} elements."

    context = "\n\n".join(context_parts) if context_parts else "No relevant notes found."
    system = f"""You are Mnemos, a canvas knowledge assistant.{visual_desc}
Answer using the user's notes as primary source. Be concise and helpful."""

    messages = [{"role": "user", "content": f"Notes context:\n{context}\n\nQuestion: {message}"}]
    for h in history[-6:]:
        messages.insert(0, h)

    try:
        response = await llm.chat(system, messages, user_id=user_id)
    except Exception as e:
        response = f"Sorry, I couldn't generate a response: {e}"

    yield await _sse_event(CanvasOp(
        op=OpType.INFO, message=response,
        metadata={"type": "chat_response", "sources": [
            {"id": r["id"], "title": r.get("title")} for r in (relevant if 'relevant' in dir() else [])
        ]},
    ))