# === FILE: backend/app/agents/canvas_architect.py ===
"""
Canvas architect — full layout recomputation.
Now delegates to spatial_planner for placement logic.
Only invoked on explicit user request ("reorganize entire page").
"""

import numpy as np
import logging
from langgraph.graph import StateGraph, END
from app.agents.state import CanvasArchitectState
from app.db.supabase import db
from app.services.spatial_planner import spatial_planner
from app.llm import router as llm

logger = logging.getLogger("mnemos.canvas_architect")


async def load_notes_node(state: CanvasArchitectState) -> dict:
    notes = await db.get_notes_with_embeddings(state["page_id"])
    all_notes = await db.get_notes_for_page(state["page_id"])

    if not all_notes:
        return {"notes": [], "status": "done"}
    return {"notes": all_notes, "status": "computing"}


async def compute_layout_node(state: CanvasArchitectState) -> dict:
    """Compute full layout using spatial planner."""
    page_id = state["page_id"]
    notes = state["notes"]

    if not notes:
        return {"positions": [], "status": "saving"}

    positions = await spatial_planner.compute_full_layout(page_id)
    return {"positions": positions, "status": "saving"}


async def save_and_cluster_node(state: CanvasArchitectState) -> dict:
    """Save positions and create/update clusters."""
    page_id = state["page_id"]
    positions = state.get("positions", [])

    if not positions:
        return {"status": "done"}

    # Save positions to DB
    for p in positions:
        await db.update_note(p["note_id"], canvas_x=p["x"], canvas_y=p["y"])

    # Resolve overlaps
    moves = await spatial_planner.resolve_overlaps(page_id)
    for m in moves:
        await db.update_note(m["note_id"], canvas_x=m["x"], canvas_y=m["y"])

    # Re-cluster based on new positions
    await db.delete_clusters_for_page(page_id)

    notes_with_emb = await db.get_notes_with_embeddings(page_id)
    if len(notes_with_emb) >= 3:
        clusters = spatial_planner._cluster_by_embedding(notes_with_emb)
        clusters_out = []

        for i, cluster_notes in enumerate(clusters):
            if len(cluster_notes) < 2:
                continue

            xs = [float(n.get("canvas_x", 0)) for n in cluster_notes if n.get("canvas_x") is not None]
            ys = [float(n.get("canvas_y", 0)) for n in cluster_notes if n.get("canvas_y") is not None]
            center_x = np.mean(xs) if xs else 400.0
            center_y = np.mean(ys) if ys else 400.0

            notes_info = "\n".join(
                f"- {n.get('title', 'Untitled')} (tags: {', '.join(n.get('tags') or [])})"
                for n in cluster_notes[:8]
            )
            try:
                naming = await llm.name_cluster(notes_info)
                cluster_label = naming.get("label", f"Cluster {i}")
                cluster_desc = naming.get("description", "")
                cluster_color = naming.get("color_hint", "#6366f1")
            except Exception:
                cluster_label = f"Cluster {i}"
                cluster_desc = ""
                cluster_color = "#6366f1"

            cluster = await db.insert_cluster(
                page_id=page_id,
                label=cluster_label,
                description=cluster_desc,
                color=cluster_color,
                center_x=float(center_x),
                center_y=float(center_y),
            )

            for n in cluster_notes:
                await db.update_note(n["id"], cluster_id=cluster["id"])

            clusters_out.append({
                "label": cluster_label,
                "color": cluster_color,
                "center_x": float(center_x),
                "center_y": float(center_y),
                "note_count": len(cluster_notes),
            })

    # Sync Excalidraw scene
    try:
        from app.services.excalidraw_scene import sync_page_notes_to_canvas
        await sync_page_notes_to_canvas(page_id)
    except Exception as e:
        logger.error(f"Excalidraw sync failed: {e}")

    return {"status": "done"}


def route_after_load(state: CanvasArchitectState) -> str:
    if not state.get("notes"):
        return END
    return "compute_layout"


def build_canvas_architect_graph():
    graph = StateGraph(CanvasArchitectState)

    graph.add_node("load_notes", load_notes_node)
    graph.add_node("compute_layout", compute_layout_node)
    graph.add_node("save_and_cluster", save_and_cluster_node)

    graph.set_entry_point("load_notes")
    graph.add_conditional_edges("load_notes", route_after_load, {
        "compute_layout": "compute_layout",
        END: END,
    })
    graph.add_edge("compute_layout", "save_and_cluster")
    graph.add_edge("save_and_cluster", END)

    return graph.compile()


canvas_architect_graph = build_canvas_architect_graph()