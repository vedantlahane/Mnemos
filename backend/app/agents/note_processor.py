# === FILE: backend/app/agents/note_processor.py ===
"""
Note processing pipeline — updated for new schema.
Extract → Embed → Find Related → Route → Connect → Place on Scene → Finalize
"""

from langgraph.graph import StateGraph, END
from app.agents.state import NoteProcessorState
from app.db.supabase import db
from app.services import embeddings
from app.services.spatial_planner import spatial_planner
from app.llm import router as llm
from app.models.canvas_ops import Viewport
import logging

logger = logging.getLogger("mnemos.note_processor")


def _clean(v): return " ".join(str(v or "").split()).strip()
def _clean_list(v, n=12): return [_clean(x) for x in (v if isinstance(v, list) else []) if _clean(x)][:n]


async def extract_node(state: NoteProcessorState) -> dict:
    try:
        processed = await llm.process_capture(state["raw_text"])
        return {
            "title": _clean(processed.title) or state["raw_text"][:60],
            "summary": _clean(processed.summary) or state["raw_text"][:280],
            "tags": _clean_list(processed.tags),
            "tasks": _clean_list(processed.tasks),
            "entities": _clean_list(processed.entities),
            "content_type": getattr(processed, "content_type", "note"),
            "status": "embedding",
        }
    except Exception as e:
        return {
            "title": state["raw_text"][:60], "summary": state["raw_text"][:280],
            "tags": [], "tasks": [], "entities": [], "content_type": "note",
            "errors": state.get("errors", []) + [f"extract: {e}"],
            "status": "embedding",
        }


async def save_extraction_node(state: NoteProcessorState) -> dict:
    await db.update_note(state["note_id"],
        title=state.get("title"), summary=state.get("summary"),
        tags=state.get("tags", []), tasks=state.get("tasks", []),
        entities=state.get("entities", []), processing_status="processing",
    )
    return {}


async def embed_node(state: NoteProcessorState) -> dict:
    try:
        emb = await embeddings.generate(state["raw_text"])
        await db.upsert_embedding(state["note_id"], emb)
        return {"embedding": emb, "status": "finding_related"}
    except Exception as e:
        return {"embedding": None, "errors": state.get("errors", []) + [f"embed: {e}"], "status": "routing"}


async def find_related_node(state: NoteProcessorState) -> dict:
    emb = state.get("embedding")
    if not emb:
        return {"related_notes": [], "status": "routing"}
    try:
        related = await db.vector_search(emb, limit=5, threshold=0.7)
        related = [r for r in related if r["id"] != state["note_id"]]
        return {"related_notes": related, "status": "routing"}
    except Exception as e:
        return {"related_notes": [], "errors": state.get("errors", []) + [f"related: {e}"], "status": "routing"}


async def route_node(state: NoteProcessorState) -> dict:
    try:
        from app.services.page_router import route_note
        routing = await route_note(
            text=state["raw_text"], title=state.get("title"),
            tags=state.get("tags", []),
            page_hint=state.get("page_hint"),
        )
        page_id = routing["page_id"]
        await db.update_note(state["note_id"], page_id=page_id)
        return {"page_id": page_id, "page_name": routing["page_name"], "status": "connecting"}
    except Exception as e:
        try:
            uncat = await db.get_page_by_name("Uncategorized")
            if uncat:
                await db.update_note(state["note_id"], page_id=uncat["id"])
                return {"page_id": uncat["id"], "page_name": "Uncategorized",
                        "errors": state.get("errors", []) + [f"route: {e}"], "status": "connecting"}
        except Exception:
            pass
        return {"page_id": None, "errors": state.get("errors", []) + [f"route: {e}"], "status": "connecting"}


async def connect_edges_node(state: NoteProcessorState) -> dict:
    related = state.get("related_notes", [])
    if not related:
        return {"status": "placing"}
    errors = []
    for rel in related[:3]:
        try:
            classification = await llm.classify_edge(
                title_a=state.get("title") or "Untitled", content_a=state["raw_text"],
                title_b=rel.get("title", "Untitled"), content_b=rel.get("raw_text", ""),
            )
            await db.insert_edge_if_not_exists(
                source_id=state["note_id"], target_id=rel["id"],
                edge_type=classification.edge_type, label=classification.label,
                strength=classification.confidence, created_by="processor",
            )
        except Exception:
            await db.insert_edge_if_not_exists(
                source_id=state["note_id"], target_id=rel["id"],
                edge_type="related", strength=rel.get("similarity", 0.0),
                created_by="processor",
            )
    return {"status": "placing"}


async def place_on_scene_node(state: NoteProcessorState) -> dict:
    """Place note on canvas scene — scene is the authority."""
    page_id = state.get("page_id")
    if not page_id:
        return {"status": "finalizing"}

    note = await db.get_note(state["note_id"])
    if not note:
        return {"status": "finalizing"}

    try:
        # Get visual context for smarter placement
        visual_ctx = None
        try:
            ctx_data = await db.get_visual_context(page_id)
            if ctx_data:
                from app.models.visual import VisualContext
                visual_ctx = VisualContext(page_id=page_id, **{
                    k: v for k, v in ctx_data.items()
                    if k in VisualContext.model_fields and k != "page_id"
                })
        except Exception:
            pass

        viewport = None
        if state.get("viewport"):
            try:
                viewport = Viewport(**state["viewport"])
            except Exception:
                pass

        placement = await spatial_planner.find_placement(
            page_id=page_id, note=note, viewport=viewport,
            near_topic=state.get("title"), strategy="auto",
            visual_context=visual_ctx,
        )

        # Write to scene (single authority)
        from app.services.scene_manager import scene_manager
        await scene_manager.upsert_note_card(page_id, note, placement.x, placement.y)

        return {"status": "finalizing"}
    except Exception as e:
        logger.error(f"Place on scene failed: {e}")
        return {"errors": state.get("errors", []) + [f"place: {e}"], "status": "finalizing"}


async def finalize_node(state: NoteProcessorState) -> dict:
    await db.update_note(state["note_id"], processing_status="done")
    errors = state.get("errors", [])
    if errors:
        logger.warning(f"Note {state['note_id'][:8]} done with {len(errors)} warnings")
    return {"status": "done"}


def _should_find_related(state: NoteProcessorState) -> str:
    return "find_related" if state.get("embedding") else "route"


def build_note_processor_graph():
    graph = StateGraph(NoteProcessorState)
    graph.add_node("extract", extract_node)
    graph.add_node("save_extraction", save_extraction_node)
    graph.add_node("embed", embed_node)
    graph.add_node("find_related", find_related_node)
    graph.add_node("route", route_node)
    graph.add_node("connect_edges", connect_edges_node)
    graph.add_node("place_on_scene", place_on_scene_node)
    graph.add_node("finalize", finalize_node)

    graph.set_entry_point("extract")
    graph.add_edge("extract", "save_extraction")
    graph.add_edge("save_extraction", "embed")
    graph.add_conditional_edges("embed", _should_find_related, {"find_related": "find_related", "route": "route"})
    graph.add_edge("find_related", "route")
    graph.add_edge("route", "connect_edges")
    graph.add_edge("connect_edges", "place_on_scene")
    graph.add_edge("place_on_scene", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


note_processor_graph = build_note_processor_graph()