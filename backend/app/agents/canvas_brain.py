# === FILE: backend/app/agents/canvas_brain.py ===
"""
Canvas Brain — the central orchestrator agent.
Classifies intent, plans placement, routes to executors.
"""

from __future__ import annotations
import logging
from typing import Optional

from langgraph.graph import StateGraph, END
from app.agents.state import CanvasBrainState
from app.services.intent_classifier import classify_intent, extract_topic
from app.services.canvas_state import canvas_state
from app.services.canvas_text_search import find_canvas_text_matches, build_canvas_text_context
from app.services import embeddings
from app.services.spatial_planner import spatial_planner
from app.models.canvas_ops import (
    CanvasOp, OpType, Intent, Viewport, Placement, make_element_id,
)
from app.db.supabase import db
from app.llm import router as llm

logger = logging.getLogger("mnemos.canvas_brain")


# ── Nodes ──

async def classify_node(state: CanvasBrainState) -> dict:
    """Classify user intent from message."""
    intent, topic, meta = classify_intent(state["user_message"])

    # Load canvas snapshot for spatial awareness
    snapshot = None
    try:
        snapshot = await canvas_state.get_canvas_snapshot(state["page_id"])
    except Exception as e:
        logger.warning(f"Canvas snapshot failed: {e}")

    return {
        "intent": intent.value,
        "target_topic": topic or extract_topic(state["user_message"]),
        "sub_intent": meta.get("sub_intent", ""),
        "intent_metadata": meta,
        "canvas_snapshot": snapshot,
        "status": "routing",
    }

async def compose_node(state: CanvasBrainState) -> dict:
    """Generate content and place on canvas with MEASURED bounds."""
    topic = state["target_topic"] or state["user_message"]
    page_id = state["page_id"]
    user_id = state.get("user_id")

    try:
        from app.services.composition import compose_content
        content = await compose_content(topic, page_id=page_id, user_id=user_id)

        # MEASURE the text first to know its actual size
        from app.services.element_layout import measure_text
        measurement = measure_text(
            content,
            font_size=16,
            font_family=1,
            max_width=400,
        )

        actual_width = measurement["width"]
        actual_height = measurement["height"]
        wrapped_text = measurement["wrapped_text"]

        # Plan placement with REAL measured dimensions
        viewport = Viewport(**state["viewport"]) if state.get("viewport") else None
        placement = await spatial_planner.find_placement(
            page_id=page_id,
            viewport=viewport,
            near_topic=topic,
            size=(actual_width + 24, actual_height + 24),  # with padding
            strategy="auto",
        )

        element_id = make_element_id("compose")

        # Save to canvas with measured dimensions
        from app.services.excalidraw_scene import add_measured_text_to_canvas
        await add_measured_text_to_canvas(
            page_id, content,
            x=placement.x, y=placement.y,
            max_width=400,
            element_id=element_id,
        )

        ops = [
            CanvasOp(
                op=OpType.CREATE_TEXT,
                element_id=element_id,
                x=placement.x,
                y=placement.y,
                width=actual_width,
                height=actual_height,
                text=wrapped_text,
                style="compose",
                message=f"Composed content about '{topic}'",
            ).model_dump(),
        ]

        return {
            "operations": ops,
            "chat_response": f"I've written about **{topic}** and placed it on your canvas.",
            "status": "done",
        }

    except Exception as e:
        logger.error(f"Compose failed: {e}")
        return {
            "errors": state.get("errors", []) + [f"compose: {e}"],
            "chat_response": f"Error composing about {topic}: {str(e)[:100]}",
            "status": "done",
        }


async def diagram_node(state: CanvasBrainState) -> dict:
    """Generate diagram with MEASURED text labels."""
    topic = state["target_topic"] or state["user_message"]
    page_id = state["page_id"]
    user_id = state.get("user_id")

    context = ""
    try:
        notes = await db.get_notes_for_page(page_id, user_id=user_id)
        context = "\n".join(
            f"Note: {n.get('title', 'Untitled')} — {n.get('summary', '')[:200]}"
            for n in notes[:8]
        )
    except Exception:
        pass

    try:
        selected_model = None
        try:
            user_settings = await db.get_settings(user_id=user_id)
            if isinstance(user_settings, dict):
                m = user_settings.get("model")
                if isinstance(m, str) and m.strip():
                    selected_model = m.strip()
        except Exception:
            pass

        from app.services.canvas_gen import generate_diagram, fallback_diagram
        topology = await generate_diagram(topic, context, model=selected_model)
    except Exception as e:
        logger.warning(f"Diagram generation failed: {e}")
        from app.services.canvas_gen import fallback_diagram
        topology = fallback_diagram(topic)

    # Measure and layout the diagram elements to know total size
    from app.services.element_layout import layout_diagram_topology
    positioned, arrows = layout_diagram_topology(topology, 0, 0)

    # Calculate diagram bounding box
    if positioned:
        diagram_width = max(p.right for p in positioned) - min(p.x for p in positioned) + 40
        diagram_height = max(p.bottom for p in positioned) - min(p.y for p in positioned) + 40
    else:
        diagram_width, diagram_height = 600, 400

    # Place with real measured bounds
    viewport = Viewport(**state["viewport"]) if state.get("viewport") else None
    placement = await spatial_planner.find_placement(
        page_id=page_id,
        viewport=viewport,
        near_topic=topic,
        size=(diagram_width, diagram_height),
        strategy="auto",
    )

    # Save to canvas with measured layout
    from app.services.excalidraw_scene import add_diagram_to_canvas
    await add_diagram_to_canvas(page_id, topology, placement.x, placement.y)

    ops = [
        CanvasOp(
            op=OpType.CREATE_DIAGRAM,
            x=placement.x,
            y=placement.y,
            width=diagram_width,
            height=diagram_height,
            topology=topology,
            message=f"Diagram: {topology.get('title', topic)}",
        ).model_dump(),
    ]

    return {
        "operations": ops,
        "chat_response": f"I've generated a {topology.get('layout_type', 'flow')} diagram about **{topic}** ({len(positioned)} elements).",
        "status": "done",
    }


async def command_node(state: CanvasBrainState) -> dict:
    """Execute canvas commands (background, theme, etc.)."""
    sub_intent = state.get("sub_intent", "")
    meta = state.get("intent_metadata", {})

    ops = []
    message = ""

    if sub_intent == "set_background":
        color = meta.get("color", "#0e0e1a")
        ops.append(CanvasOp(op=OpType.SET_BACKGROUND, color=color).model_dump())

        # Auto-adjust theme
        from app.services.excalidraw_scene import _luminance
        theme = "dark" if _luminance(color) < 0.4 else "light"
        ops.append(CanvasOp(op=OpType.SET_THEME, theme=theme).model_dump())

        # Persist
        page = await db.get_page(state["page_id"])
        if page:
            canvas_data = page.get("canvas_data") or {}
            app_state = canvas_data.get("appState") or {}
            app_state["viewBackgroundColor"] = color
            app_state["theme"] = theme
            canvas_data["appState"] = app_state
            await db.update_page(state["page_id"], canvas_data=canvas_data)

        message = f"Background changed to {color} ({theme} theme)"

    elif sub_intent == "set_theme":
        theme = meta.get("theme", "dark")
        bg = "#0e0e1a" if theme == "dark" else "#ffffff"
        ops.append(CanvasOp(op=OpType.SET_THEME, theme=theme).model_dump())
        ops.append(CanvasOp(op=OpType.SET_BACKGROUND, color=bg).model_dump())

        page = await db.get_page(state["page_id"])
        if page:
            canvas_data = page.get("canvas_data") or {}
            app_state = canvas_data.get("appState") or {}
            app_state["theme"] = theme
            app_state["viewBackgroundColor"] = bg
            canvas_data["appState"] = app_state
            await db.update_page(state["page_id"], canvas_data=canvas_data)

        message = f"Switched to {theme} theme"

    elif sub_intent == "zoom":
        zoom_text = state["user_message"].lower()
        if "in" in zoom_text:
            ops.append(CanvasOp(op=OpType.ZOOM_TO, zoom=1.5).model_dump())
        elif "out" in zoom_text:
            ops.append(CanvasOp(op=OpType.ZOOM_TO, zoom=0.7).model_dump())
        else:
            ops.append(CanvasOp(op=OpType.ZOOM_TO, zoom=1.0).model_dump())
        message = "Zoom adjusted"

    else:
        message = f"Command '{sub_intent}' is not yet supported."

    return {
        "operations": ops,
        "chat_response": message,
        "status": "done",
    }


async def arrange_node(state: CanvasBrainState) -> dict:
    """Rearrange notes on canvas."""
    page_id = state["page_id"]
    topic = state["target_topic"]

    try:
        if topic:
            # Arrange only topic-related notes
            region = await canvas_state.find_topic_region(page_id, topic)
            if region:
                notes_in_region = await canvas_state.find_notes_at_region(page_id, region)
                note_ids = [n["id"] for n in notes_in_region]
                if note_ids:
                    positions = await spatial_planner.compute_cluster_layout(
                        page_id, note_ids, anchor=(region.center_x, region.center_y)
                    )
                    ops = []
                    for p in positions:
                        await db.update_note(p["note_id"], canvas_x=p["x"], canvas_y=p["y"])
                        ops.append(CanvasOp(
                            op=OpType.MOVE_ELEMENT,
                            note_id=p["note_id"],
                            x=p["x"], y=p["y"],
                        ).model_dump())

                    # Sync scene
                    from app.services.excalidraw_scene import sync_page_notes_to_canvas
                    await sync_page_notes_to_canvas(page_id)

                    return {
                        "operations": ops,
                        "chat_response": f"Rearranged {len(positions)} notes about **{topic}**.",
                        "status": "done",
                    }

        # Full page layout
        positions = await spatial_planner.compute_full_layout(page_id)
        ops = []
        for p in positions:
            await db.update_note(p["note_id"], canvas_x=p["x"], canvas_y=p["y"])
            ops.append(CanvasOp(
                op=OpType.MOVE_ELEMENT,
                note_id=p["note_id"],
                x=p["x"], y=p["y"],
            ).model_dump())

        from app.services.excalidraw_scene import sync_page_notes_to_canvas
        await sync_page_notes_to_canvas(page_id)

        # Resolve overlaps
        moves = await spatial_planner.resolve_overlaps(page_id)
        for m in moves:
            await db.update_note(m["note_id"], canvas_x=m["x"], canvas_y=m["y"])
            ops.append(CanvasOp(
                op=OpType.MOVE_ELEMENT,
                note_id=m["note_id"],
                x=m["x"], y=m["y"],
            ).model_dump())

        if moves:
            await sync_page_notes_to_canvas(page_id)

        return {
            "operations": ops,
            "chat_response": f"Reorganized {len(positions)} notes on the canvas.",
            "status": "done",
        }

    except Exception as e:
        logger.error(f"Arrange failed: {e}")
        return {
            "errors": state.get("errors", []) + [f"arrange: {e}"],
            "chat_response": f"Failed to rearrange: {str(e)[:100]}",
            "status": "done",
        }


async def search_node(state: CanvasBrainState) -> dict:
    """Search and highlight/navigate to results."""
    topic = state["target_topic"] or state["user_message"]
    page_id = state["page_id"]
    user_id = state.get("user_id")

    try:
        query_emb = await embeddings.generate_query(topic)
        results = await db.vector_search_in_page(query_emb, page_id, limit=5, threshold=0.55)
        if user_id:
            results = [r for r in results if r.get("user_id") == user_id]

        if not results:
            # Try text search
            notes_result = await db.list_notes(page=1, limit=200, page_id=page_id, user_id=user_id)
            topic_lower = topic.lower()
            results = [
                n for n in notes_result.get("notes", [])
                if topic_lower in (n.get("title") or "").lower()
                or topic_lower in (n.get("summary") or "").lower()
                or any(topic_lower in t.lower() for t in (n.get("tags") or []))
            ][:5]

        if not results:
            page = await db.get_page(page_id, user_id=user_id)
            canvas_matches = find_canvas_text_matches(topic, (page or {}).get("canvas_data") or {}, limit=5)
            if canvas_matches:
                ops = []
                first = canvas_matches[0]
                if first.get("x") is not None and first.get("y") is not None:
                    ops.append(CanvasOp(
                        op=OpType.PAN_TO,
                        x=float(first["x"]),
                        y=float(first["y"]),
                        message="Found matching canvas text",
                    ).model_dump())

                sources = [
                    {
                        "id": m["id"],
                        "title": m.get("snippet", "Canvas text"),
                        "similarity": m.get("score", 0.0),
                    }
                    for m in canvas_matches
                ]

                snippets = ", ".join(
                    f"\"{m.get('snippet', '')[:48]}\"" for m in canvas_matches[:3]
                )

                return {
                    "operations": ops,
                    "chat_response": f"Found {len(canvas_matches)} canvas text match(es) for {topic}: {snippets}",
                    "sources": sources,
                    "status": "done",
                }

            return {
                "operations": [],
                "chat_response": f"No notes found about **{topic}** on this page.",
                "sources": [],
                "status": "done",
            }

        # Pan to first result
        first = results[0]
        ops = []
        if first.get("canvas_x") is not None:
            ops.append(CanvasOp(
                op=OpType.PAN_TO,
                x=float(first["canvas_x"]),
                y=float(first["canvas_y"]),
                message=f"Found: {first.get('title', 'Untitled')}",
            ).model_dump())

        sources = [
            {"id": r["id"], "title": r.get("title", "Untitled"), "similarity": r.get("similarity", 0)}
            for r in results
        ]

        titles = ", ".join(f"**{r.get('title', 'Untitled')}**" for r in results[:3])
        return {
            "operations": ops,
            "chat_response": f"Found {len(results)} notes about {topic}: {titles}",
            "sources": sources,
            "status": "done",
        }

    except Exception as e:
        logger.error(f"Search failed: {e}")
        return {
            "errors": state.get("errors", []) + [f"search: {e}"],
            "chat_response": f"Search failed: {str(e)[:100]}",
            "status": "done",
        }


async def query_node(state: CanvasBrainState) -> dict:
    """RAG-powered Q&A with note citations."""
    question = state["user_message"]
    page_id = state["page_id"]
    user_id = state.get("user_id")

    try:
        query_emb = await embeddings.generate_query(question)

        # Scoped + global search
        relevant = await db.vector_search_in_page(query_emb, page_id, limit=5, threshold=0.55)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]

        if len(relevant) < 2:
            global_results = await db.vector_search(query_emb, limit=5, threshold=0.6)
            if user_id:
                global_results = [r for r in global_results if r.get("user_id") == user_id]
            seen = {r["id"] for r in relevant}
            for r in global_results:
                if r["id"] not in seen:
                    relevant.append(r)

        if not relevant:
            page = await db.get_page(page_id, user_id=user_id)
            canvas_matches = find_canvas_text_matches(question, (page or {}).get("canvas_data") or {}, limit=6)
            if canvas_matches:
                page_context = page.get("name") if page else None
                context = build_canvas_text_context(canvas_matches)
                answer = await llm.chat(
                    question=question,
                    context=context,
                    history=state.get("history", []),
                    page_context=page_context,
                    user_id=user_id,
                )

                follow_ups = []
                try:
                    follow_ups = await llm.generate_follow_ups(question, answer, user_id=user_id)
                except Exception:
                    pass

                sources = [
                    {
                        "id": m["id"],
                        "title": m.get("snippet", "Canvas text"),
                        "similarity": m.get("score", 0.0),
                    }
                    for m in canvas_matches
                ]

                ops = []
                first = canvas_matches[0]
                if first.get("x") is not None and first.get("y") is not None:
                    ops.append(CanvasOp(
                        op=OpType.PAN_TO,
                        x=float(first["x"]),
                        y=float(first["y"]),
                    ).model_dump())

                return {
                    "operations": ops,
                    "chat_response": answer,
                    "sources": sources,
                    "follow_ups": follow_ups,
                    "status": "done",
                }

            return {
                "chat_response": "I couldn't find any related notes. Try capturing some notes on this topic first, or ask me to write about it with 'write about [topic]'.",
                "sources": [],
                "follow_ups": [f"Write about {state.get('target_topic', 'this topic')}"],
                "status": "done",
            }

        # Graph expansion
        expanded_ids = {r["id"] for r in relevant}
        extra_notes = []
        for r in relevant[:3]:
            try:
                edges = await db.get_edges_for_note(r["id"])
                for edge in edges[:2]:
                    neighbor_id = edge["target_id"] if edge["source_id"] == r["id"] else edge["source_id"]
                    if neighbor_id not in expanded_ids:
                        neighbor = await db.get_note(neighbor_id, user_id=user_id)
                        if neighbor:
                            extra_notes.append(neighbor)
                            expanded_ids.add(neighbor_id)
            except Exception:
                pass

        # Build context
        context_parts = []
        for n in relevant:
            context_parts.append(
                f"Note: {n.get('title', 'Untitled')}\n"
                f"Summary: {n.get('summary', 'No summary')}\n"
                f"Content: {n.get('raw_text', '')[:1000]}\n"
                f"Tags: {', '.join(n.get('tags', []))}"
            )
        for n in extra_notes[:3]:
            context_parts.append(
                f"Related Note: {n.get('title', 'Untitled')}\n"
                f"Summary: {n.get('summary', 'No summary')}\n"
                f"Content: {n.get('raw_text', '')[:500]}"
            )
        context = "\n\n---\n\n".join(context_parts)

        # Get page name for context
        page_context = None
        try:
            page = await db.get_page(page_id, user_id=user_id)
            if page:
                page_context = page["name"]
        except Exception:
            pass

        # Chat
        answer = await llm.chat(
            question=question, context=context,
            history=state.get("history", []),
            page_context=page_context, user_id=user_id,
        )

        # Follow-ups
        follow_ups = []
        try:
            follow_ups = await llm.generate_follow_ups(question, answer, user_id=user_id)
        except Exception:
            pass

        sources = [
            {"id": n["id"], "title": n.get("title", "Untitled"), "similarity": n.get("similarity", 0.0)}
            for n in relevant
        ]

        return {
            "chat_response": answer,
            "sources": sources,
            "follow_ups": follow_ups,
            "status": "done",
        }

    except Exception as e:
        logger.error(f"Query failed: {e}")
        return {
            "errors": state.get("errors", []) + [f"query: {e}"],
            "chat_response": f"Sorry, I encountered an error while searching: {str(e)[:100]}",
            "status": "done",
        }


async def capture_node(state: CanvasBrainState) -> dict:
    """Capture text as a new note from canvas chat."""
    text = state["target_topic"] or state["user_message"]
    page_id = state["page_id"]
    user_id = state.get("user_id")

    try:
        note = await db.insert_note(
            raw_text=text,
            page_id=page_id,
            capture_type="chat_capture",
            processing_status="pending",
            user_id=user_id,
        )

        # Process in background
        from app.services.processor import processor
        import asyncio
        asyncio.create_task(
            processor.process_note(
                note_id=note["id"],
                raw_text=text,
                viewport=state.get("viewport"),
            )
        )

        return {
            "chat_response": f"Captured note. It's being processed and will appear on the canvas shortly.",
            "operations": [],
            "status": "done",
        }
    except Exception as e:
        logger.error(f"Capture failed: {e}")
        return {
            "errors": state.get("errors", []) + [f"capture: {e}"],
            "chat_response": f"Failed to capture: {str(e)[:100]}",
            "status": "done",
        }


async def navigate_node(state: CanvasBrainState) -> dict:
    """Navigate to a page or location."""
    topic = state["target_topic"] or state["user_message"]

    # Try to find the page
    try:
        page = await db.get_page_by_name(topic, user_id=state.get("user_id"))
        if page:
            return {
                "chat_response": f"Opening page **{page['name']}**.",
                "operations": [CanvasOp(
                    op=OpType.INFO,
                    message=f"navigate_to_page:{page['id']}",
                    metadata={"page_id": page["id"], "page_name": page["name"]},
                ).model_dump()],
                "status": "done",
            }
    except Exception:
        pass

    # Try to find a note with that title
    try:
        notes = await db.get_notes_for_page(state["page_id"], user_id=state.get("user_id"))
        topic_lower = topic.lower()
        for n in notes:
            if topic_lower in (n.get("title") or "").lower():
                if n.get("canvas_x") is not None:
                    return {
                        "chat_response": f"Navigating to **{n.get('title')}**.",
                        "operations": [CanvasOp(
                            op=OpType.PAN_TO,
                            x=float(n["canvas_x"]),
                            y=float(n["canvas_y"]),
                        ).model_dump()],
                        "status": "done",
                    }
    except Exception:
        pass

    return {
        "chat_response": f"Couldn't find '{topic}'. Try a page name or note title.",
        "status": "done",
    }


# ── Router ──

def route_intent(state: CanvasBrainState) -> str:
    intent = state.get("intent", "query")
    mapping = {
        "compose": "compose",
        "command": "command",
        "diagram": "diagram",
        "arrange": "arrange",
        "search": "search",
        "query": "query",
        "capture": "capture",
        "navigate": "navigate",
    }
    return mapping.get(intent, "query")


# ── Build graph ──

def build_canvas_brain_graph():
    graph = StateGraph(CanvasBrainState)

    graph.add_node("classify", classify_node)
    graph.add_node("compose", compose_node)
    graph.add_node("command", command_node)
    graph.add_node("diagram", diagram_node)
    graph.add_node("arrange", arrange_node)
    graph.add_node("search", search_node)
    graph.add_node("query", query_node)
    graph.add_node("capture", capture_node)
    graph.add_node("navigate", navigate_node)

    graph.set_entry_point("classify")
    graph.add_conditional_edges("classify", route_intent, {
        "compose": "compose",
        "command": "command",
        "diagram": "diagram",
        "arrange": "arrange",
        "search": "search",
        "query": "query",
        "capture": "capture",
        "navigate": "navigate",
    })

    for node_name in ["compose", "command", "diagram", "arrange", "search", "query", "capture", "navigate"]:
        graph.add_edge(node_name, END)

    return graph.compile()


canvas_brain_graph = build_canvas_brain_graph()