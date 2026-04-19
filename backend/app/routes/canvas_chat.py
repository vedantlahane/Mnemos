"""Canvas-aware chat — AI can modify the scene in response to user messages."""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.schemas import CanvasChatRequest
from app.db.supabase import db
from app.excalidraw.scene import normalize_scene
from app.excalidraw import scene_manager
from app.services import embeddings, operations as ops_svc
from app.services.placement import find_placement
from app.services.composition import stream_compose, compose_content
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id
from app.config import settings
import json
import asyncio
import logging

logger = logging.getLogger("mnemos.canvas_chat")

router = APIRouter()

CANVAS_SYSTEM = """You are Mnemos canvas assistant. You can:
1. Answer questions using the user's notes
2. Add diagrams to the canvas
3. Write composed content on the canvas
4. Explain connections between notes

Analyze the user's message and respond with JSON:
{
    "intent": "answer|diagram|compose|explain|modify",
    "response": "text response to show user",
    "canvas_action": null or {
        "type": "add_diagram|add_text|add_sticky|set_background",
        "params": { ... action-specific params ... }
    }
}

For diagrams, params should include "topic".
For compose, params should include "topic".
For sticky, params should include "content" and optionally "color".
For set_background, params should include "color".
If no canvas action needed, set canvas_action to null."""


@router.post("/pages/{page_id}/canvas-chat")
async def canvas_chat(page_id: str, payload: CanvasChatRequest,
                      user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Get scene context
    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])
    scene_analysis = scene_manager.analyze(scene)

    # Get note context
    context = ""
    try:
        query_emb = await embeddings.generate_query(payload.message)
        relevant = await db.vector_search_in_page(
            query_emb, page_id, limit=5, threshold=0.5,
        )
        if relevant:
            context = "\n".join(
                f"[{n.get('title', 'Untitled')}]: {n.get('summary', '')[:200]}"
                for n in relevant
            )
    except Exception:
        pass

    system = CANVAS_SYSTEM + f"""

Canvas state:
- Theme: {scene_analysis['theme']}
- Elements: {scene_analysis['element_count']}
- Layout: {scene_analysis['layout_pattern']}
- Density: {scene_analysis['density']}

Page notes context:
{context or 'No notes on this page yet.'}"""

    messages = payload.history + [{"role": "user", "content": payload.message}]

    try:
        from app.llm.google_provider import google_structured_call
        response_text = await google_structured_call(system, payload.message)
    except Exception:
        response_text = await llm.chat(system, messages, user_id=user_id)

    # Parse response
    try:
        response_data = json.loads(response_text) if isinstance(response_text, str) else response_text
    except json.JSONDecodeError:
        response_data = {"intent": "answer", "response": response_text, "canvas_action": None}

    text_response = response_data.get("response", response_text)
    canvas_action = response_data.get("canvas_action")
    action_result = None

    # Execute canvas action
    if canvas_action and isinstance(canvas_action, dict):
        action_type = canvas_action.get("type", "")
        params = canvas_action.get("params", {})

        try:
            if action_type == "add_diagram":
                topic = params.get("topic", payload.message)
                topology = await llm.generate_diagram(topic, user_id=user_id)
                placement = await find_placement(
                    page_id, scene, strategy="auto",
                    viewport=payload.viewport,
                )
                scene, bbox = scene_manager.add_diagram(
                    scene, topology, placement.x, placement.y,
                )
                new_version = stored["version"] + 1
                await db.save_scene(page_id, scene, new_version)
                await ops_svc.log_and_notify(
                    page_id, new_version, "add_diagram", actor="ai",
                    payload={"topic": topic, "bbox": bbox},
                )
                action_result = {"type": "diagram_added", "bbox": bbox}

            elif action_type == "add_text":
                topic = params.get("topic", payload.message)
                content = await compose_content(topic, page_id, user_id)
                placement = await find_placement(
                    page_id, scene, strategy="auto",
                    viewport=payload.viewport,
                )
                scene, measurement, el_id = scene_manager.add_text(
                    scene, content, placement.x, placement.y,
                    font_size=14, max_width=500,
                )
                new_version = stored["version"] + 1
                await db.save_scene(page_id, scene, new_version)
                await ops_svc.log_and_notify(
                    page_id, new_version, "add_elements", actor="ai",
                    element_ids=[el_id],
                    payload={"topic": topic},
                )
                action_result = {"type": "text_added", "element_id": el_id}

            elif action_type == "add_sticky":
                content = params.get("content", "")
                color = params.get("color", "#fef08a")
                placement = await find_placement(
                    page_id, scene, strategy="auto",
                    viewport=payload.viewport,
                    size=(180, 160),
                )
                scene, group_id = scene_manager.add_sticky(
                    scene, content, placement.x, placement.y, bg_color=color,
                )
                new_version = stored["version"] + 1
                await db.save_scene(page_id, scene, new_version)
                await ops_svc.log_and_notify(
                    page_id, new_version, "add_elements", actor="ai",
                    payload={"type": "sticky"},
                )
                action_result = {"type": "sticky_added", "group_id": group_id}

            elif action_type == "set_background":
                color = params.get("color", "#0e0e1a")
                scene = scene_manager.set_background(scene, color)
                new_version = stored["version"] + 1
                await db.save_scene(page_id, scene, new_version)
                await ops_svc.log_and_notify(
                    page_id, new_version, "set_background", actor="ai",
                    payload={"color": color},
                )
                action_result = {"type": "background_changed", "color": color}

        except Exception as e:
            logger.error(f"Canvas action failed: {e}")
            action_result = {"type": "error", "detail": str(e)}

    return {
        "response": text_response,
        "intent": response_data.get("intent", "answer"),
        "canvas_action": action_result,
    }


@router.post("/pages/{page_id}/canvas-chat/stream")
async def canvas_chat_stream(page_id: str, payload: CanvasChatRequest,
                             user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    async def generate():
        yield f"data: {json.dumps({'type': 'thinking', 'content': 'Analyzing your request...'})}\n\n"

        # Get non-stream response for action detection
        try:
            result = await canvas_chat(page_id, payload, user_id)
            # Stream the text response
            text = result.get("response", "")
            chunk_size = 80
            for i in range(0, len(text), chunk_size):
                yield f"data: {json.dumps({'type': 'chunk', 'content': text[i:i+chunk_size]})}\n\n"
                await asyncio.sleep(settings.stream_chunk_delay)

            yield f"data: {json.dumps({'type': 'action', 'canvas_action': result.get('canvas_action')})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'intent': result.get('intent')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")