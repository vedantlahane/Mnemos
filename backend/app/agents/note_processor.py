"""
LangGraph agent: processes a captured note through extraction → embedding →
routing → edge classification → canvas placement.
"""

from langgraph.graph import StateGraph, END
from app.agents.state import NoteProcessorState
from app.db.supabase import db
from app.services import embeddings
from app.llm import router as llm
from app.services.page_router import route_note
import hashlib


def _clean_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()


def _clean_str_list(values: object, max_items: int = 12) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for v in values:
        if isinstance(v, str):
            s = _clean_text(v)
            if s:
                out.append(s)
    seen = set()
    deduped = []
    for item in out:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped[:max_items]


def _fallback_title(raw_text: str) -> str:
    base = _clean_text(raw_text)
    if not base:
        return "Untitled"
    return base[:60] + ("..." if len(base) > 60 else "")


def _fallback_summary(raw_text: str) -> str:
    base = _clean_text(raw_text)
    if not base:
        return "No summary available."
    return base[:280] + ("..." if len(base) > 280 else "")


def _deterministic_canvas_position(note_id: str, note_count: int) -> tuple[float, float]:
    digest = hashlib.md5(note_id.encode("utf-8")).hexdigest()
    salt = int(digest[:8], 16)
    slot = (note_count + salt) % 48
    col = slot % 8
    row = slot // 8
    return float(100 + col * 380), float(100 + row * 300)


async def extract_node(state: NoteProcessorState) -> dict:
    """LLM extraction: title, summary, tags, tasks, entities."""
    try:
        processed = await llm.process_capture(state["raw_text"])
        title = _clean_text(processed.title) or _fallback_title(state["raw_text"])
        summary = _clean_text(processed.summary) or _fallback_summary(state["raw_text"])
        return {
            "title": title,
            "summary": summary,
            "tags": _clean_str_list(processed.tags),
            "tasks": _clean_str_list(processed.tasks),
            "entities": _clean_str_list(processed.entities),
            "status": "embedding",
        }
    except Exception as e:
        return {
            "title": _fallback_title(state["raw_text"]),
            "summary": _fallback_summary(state["raw_text"]),
            "tags": [],
            "tasks": [],
            "entities": [],
            "errors": state.get("errors", []) + [f"extract: {e}"],
            "status": "embedding",
        }


async def save_extraction_node(state: NoteProcessorState) -> dict:
    """Persist extraction results to DB."""
    await db.update_note(
        state["note_id"],
        title=state.get("title"),
        summary=state.get("summary"),
        tags=state.get("tags", []),
        tasks=state.get("tasks", []),
        entities=state.get("entities", []),
        processing_status="processing",
    )
    return {}


async def embed_node(state: NoteProcessorState) -> dict:
    """Generate embedding for the note."""
    try:
        emb = await embeddings.generate(state["raw_text"])
        await db.update_note(state["note_id"], embedding=emb)
        return {"embedding": emb, "status": "finding_related"}
    except Exception as e:
        return {
            "embedding": None,
            "errors": state.get("errors", []) + [f"embed: {e}"],
            "status": "routing",
        }


async def find_related_node(state: NoteProcessorState) -> dict:
    """Find semantically related notes."""
    emb = state.get("embedding")
    if not emb:
        return {"related_notes": [], "status": "routing"}
    try:
        related = await db.vector_search(emb, limit=5, threshold=0.7)
        related = [r for r in related if r["id"] != state["note_id"]]
        related_ids = [r["id"] for r in related]
        await db.update_note(state["note_id"], related_note_ids=related_ids)
        return {"related_notes": related, "status": "routing"}
    except Exception as e:
        return {
            "related_notes": [],
            "errors": state.get("errors", []) + [f"related: {e}"],
            "status": "routing",
        }


async def route_node(state: NoteProcessorState) -> dict:
    """Route note to the appropriate page."""
    try:
        note_data = await db.get_note(state["note_id"])
        source_url = note_data.get("source_url") if note_data else None

        routing = await route_note(
            text=state["raw_text"],
            title=state.get("title"),
            tags=state.get("tags", []),
            source_url=source_url,
            page_hint=state.get("page_hint"),
        )
        page_id = routing["page_id"]
        await db.update_note(state["note_id"], page_id=page_id)
        print(f"Routed {state['note_id']} → {routing['page_name']} ({routing['confidence']:.0%})")
        return {
            "page_id": page_id,
            "page_name": routing["page_name"],
            "status": "connecting",
        }
    except Exception as e:
        try:
            uncat = await db.get_page_by_name("Uncategorized")
            page_id = uncat["id"] if uncat else None
            if page_id:
                await db.update_note(state["note_id"], page_id=page_id)
        except Exception:
            page_id = None
        return {
            "page_id": page_id,
            "page_name": "Uncategorized" if page_id else None,
            "errors": state.get("errors", []) + [f"route: {e}"],
            "status": "connecting",
        }


async def connect_edges_node(state: NoteProcessorState) -> dict:
    """Create edges to related notes with AI classification."""
    related = state.get("related_notes", [])
    if not related:
        return {"status": "placing"}

    edge_errors: list[str] = []
    for rel in related[:3]:
        try:
            already = await db.edge_exists(state["note_id"], rel["id"])
            if already:
                continue
            try:
                classification = await llm.classify_edge(
                    title_a=state.get("title") or "Untitled",
                    content_a=state["raw_text"],
                    title_b=rel.get("title", "Untitled"),
                    content_b=rel.get("raw_text", ""),
                )
                await db.insert_edge(
                    source_id=state["note_id"],
                    target_id=rel["id"],
                    edge_type=classification.edge_type,
                    label=classification.label,
                    strength=classification.confidence,
                    created_by="processor",
                )
            except Exception:
                await db.insert_edge(
                    source_id=state["note_id"],
                    target_id=rel["id"],
                    edge_type="related",
                    strength=rel.get("similarity", 0.0),
                    created_by="processor",
                )
        except Exception:
            edge_errors.append(f"edge:{state['note_id']}->{rel.get('id')}")
    if edge_errors:
        return {"errors": state.get("errors", []) + edge_errors, "status": "placing"}
    return {"status": "placing"}


async def place_on_canvas_node(state: NoteProcessorState) -> dict:
    """Position note on the page canvas."""
    page_id = state.get("page_id")
    if not page_id:
        return {"status": "finalizing"}

    try:
        from app.services.cartographer import cartographer
        placement = await cartographer.place_single_note(state["note_id"], page_id)
        if placement:
            await db.update_note(
                state["note_id"],
                canvas_x=placement["x"],
                canvas_y=placement["y"],
                cluster_id=placement.get("cluster_id"),
            )
            return {
                "canvas_x": placement["x"],
                "canvas_y": placement["y"],
                "cluster_id": placement.get("cluster_id"),
                "status": "syncing_canvas",
            }
    except Exception as e:
        notes_for_page = await db.get_notes_for_page(page_id)
        x, y = _deterministic_canvas_position(state["note_id"], len(notes_for_page))
        await db.update_note(state["note_id"], canvas_x=x, canvas_y=y)
        return {
            "canvas_x": x,
            "canvas_y": y,
            "errors": state.get("errors", []) + [f"place: {e}"],
            "status": "syncing_canvas",
        }
    notes_for_page = await db.get_notes_for_page(page_id)
    x, y = _deterministic_canvas_position(state["note_id"], len(notes_for_page))
    await db.update_note(state["note_id"], canvas_x=x, canvas_y=y)
    return {
        "canvas_x": x,
        "canvas_y": y,
        "errors": state.get("errors", []) + ["place:no-placement-from-cartographer"],
        "status": "syncing_canvas",
    }


async def sync_excalidraw_node(state: NoteProcessorState) -> dict:
    """Sync note card into the Excalidraw scene JSON."""
    page_id = state.get("page_id")
    if not page_id:
        return {"status": "finalizing"}

    try:
        from app.services.excalidraw_scene import sync_note_to_canvas
        note = await db.get_note(state["note_id"])
        if note:
            await sync_note_to_canvas(
                page_id, note,
                x=note.get("canvas_x"),
                y=note.get("canvas_y"),
            )
    except Exception as e:
        return {
            "errors": state.get("errors", []) + [f"excalidraw_sync: {e}"],
            "status": "finalizing",
        }
    return {"status": "finalizing"}


async def finalize_node(state: NoteProcessorState) -> dict:
    """Mark note as done, update page stats."""
    page_id = state.get("page_id")
    if page_id:
        try:
            await db.increment_page_note_count(page_id)
        except Exception:
            pass

    errors = state.get("errors", [])
    final_status = "done" if not errors else "done"  # still done even with partial errors
    await db.update_note(state["note_id"], processing_status=final_status)
    return {"status": final_status}


async def handle_failure_node(state: NoteProcessorState) -> dict:
    """Mark note as failed."""
    await db.update_note(state["note_id"], processing_status="failed")
    return {"status": "failed"}


def should_continue_after_embed(state: NoteProcessorState) -> str:
    if state.get("embedding"):
        return "find_related"
    return "route"


# Build the graph
def build_note_processor_graph():
    graph = StateGraph(NoteProcessorState)

    graph.add_node("extract", extract_node)
    graph.add_node("save_extraction", save_extraction_node)
    graph.add_node("embed", embed_node)
    graph.add_node("find_related", find_related_node)
    graph.add_node("route", route_node)
    graph.add_node("connect_edges", connect_edges_node)
    graph.add_node("place_on_canvas", place_on_canvas_node)
    graph.add_node("sync_excalidraw", sync_excalidraw_node)
    graph.add_node("finalize", finalize_node)

    graph.set_entry_point("extract")
    graph.add_edge("extract", "save_extraction")
    graph.add_edge("save_extraction", "embed")
    graph.add_conditional_edges("embed", should_continue_after_embed, {
        "find_related": "find_related",
        "route": "route",
    })
    graph.add_edge("find_related", "route")
    graph.add_edge("route", "connect_edges")
    graph.add_edge("connect_edges", "place_on_canvas")
    graph.add_edge("place_on_canvas", "sync_excalidraw")
    graph.add_edge("sync_excalidraw", "finalize")
    graph.add_edge("finalize", END)

    return graph.compile()


note_processor_graph = build_note_processor_graph()