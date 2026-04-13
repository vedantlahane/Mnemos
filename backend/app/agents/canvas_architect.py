"""
LangGraph agent: computes full canvas layout with UMAP, HDBSCAN, NetworkX.
"""

import numpy as np
from langgraph.graph import StateGraph, END
from app.agents.state import CanvasArchitectState
from app.db.supabase import db
from app.llm import router as llm
from app.config import settings


async def load_notes_node(state: CanvasArchitectState) -> dict:
    notes = await db.get_notes_with_embeddings(state["page_id"])
    if not notes:
        return {"notes": [], "status": "done"}
    return {"notes": notes, "status": "reducing"}


async def reduce_dimensions_node(state: CanvasArchitectState) -> dict:
    notes = state["notes"]
    if len(notes) < 3:
        return {"status": "grid_fallback"}

    embeddings_matrix = np.array([n["embedding"] for n in notes])

    try:
        import umap
        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=min(15, len(notes) - 1),
            min_dist=0.1,
            metric="cosine",
            random_state=42,
        )
        coords_2d = reducer.fit_transform(embeddings_matrix)
    except Exception as e:
        print(f"UMAP failed: {e}, using PCA")
        centered = embeddings_matrix - embeddings_matrix.mean(axis=0)
        try:
            _, _, Vt = np.linalg.svd(centered, full_matrices=False)
            coords_2d = centered @ Vt[:2].T
        except Exception:
            coords_2d = np.random.uniform(0, 1, size=(len(notes), 2))

    # Normalize to canvas bounds
    w, h, margin = settings.canvas_width, settings.canvas_height, 100
    for axis, size in [(0, w), (1, h)]:
        rng = coords_2d[:, axis].max() - coords_2d[:, axis].min()
        if rng > 0:
            coords_2d[:, axis] = margin + (coords_2d[:, axis] - coords_2d[:, axis].min()) / rng * (size - 2 * margin)
        else:
            coords_2d[:, axis] = size / 2

    return {
        "embeddings_matrix": embeddings_matrix.tolist(),
        "coords_2d": coords_2d.tolist(),
        "status": "clustering",
    }


async def cluster_node(state: CanvasArchitectState) -> dict:
    notes = state["notes"]
    embeddings_matrix = np.array(state["embeddings_matrix"])
    cluster_labels = np.full(len(notes), -1)

    try:
        import hdbscan
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=max(3, len(notes) // 5),
            metric="euclidean",
        )
        cluster_labels = clusterer.fit_predict(embeddings_matrix)
    except Exception as e:
        print(f"Clustering failed: {e}")

    return {"cluster_labels": cluster_labels.tolist(), "status": "centrality"}


async def centrality_node(state: CanvasArchitectState) -> dict:
    notes = state["notes"]
    ids = [n["id"] for n in notes]
    centrality_scores = {}
    bridge_notes = []

    try:
        import networkx as nx
        edges = await db.get_edges_for_page(state["page_id"])
        G = nx.Graph()
        for nid in ids:
            G.add_node(nid)
        for e in edges:
            if e["source_id"] in ids and e["target_id"] in ids:
                G.add_edge(e["source_id"], e["target_id"])

        if G.number_of_edges() > 0:
            centrality_scores = nx.betweenness_centrality(G)
            sorted_c = sorted(centrality_scores.items(), key=lambda x: x[1], reverse=True)
            threshold = sorted_c[max(0, len(sorted_c) // 5)][1] if sorted_c else 0
            bridge_notes = [nid for nid, score in centrality_scores.items() if score >= threshold and score > 0]
    except Exception as e:
        print(f"Centrality failed: {e}")

    return {
        "centrality_scores": centrality_scores,
        "bridge_notes": bridge_notes,
        "status": "resolving",
    }


async def resolve_overlaps_node(state: CanvasArchitectState) -> dict:
    coords = np.array(state["coords_2d"])
    min_dist = 80

    for _ in range(50):
        moved = False
        for i in range(len(coords)):
            for j in range(i + 1, len(coords)):
                dx = coords[j, 0] - coords[i, 0]
                dy = coords[j, 1] - coords[i, 1]
                dist = np.sqrt(dx * dx + dy * dy)
                if dist < min_dist and dist > 0:
                    push = (min_dist - dist) / 2.0
                    nx_ = dx / dist
                    ny_ = dy / dist
                    coords[i, 0] -= nx_ * push
                    coords[i, 1] -= ny_ * push
                    coords[j, 0] += nx_ * push
                    coords[j, 1] += ny_ * push
                    moved = True
        if not moved:
            break

    return {"coords_2d": coords.tolist(), "status": "saving"}


async def save_layout_node(state: CanvasArchitectState) -> dict:
    notes = state["notes"]
    coords = np.array(state["coords_2d"])
    cluster_labels = state.get("cluster_labels", [])
    centrality_scores = state.get("centrality_scores", {})
    bridge_notes = state.get("bridge_notes", [])
    page_id = state["page_id"]

    # Clean up old clusters
    await db.delete_clusters_for_page(page_id)

    # Create new clusters
    unique_labels = set(int(x) for x in cluster_labels)
    unique_labels.discard(-1)
    cluster_map = {}
    clusters_out = []

    for label in unique_labels:
        indices = [i for i, cl in enumerate(cluster_labels) if int(cl) == label]
        center_x = float(np.mean(coords[indices, 0]))
        center_y = float(np.mean(coords[indices, 1]))

        cluster_notes_info = "\n".join(
            f"- {notes[i].get('title', 'Untitled')} (tags: {', '.join(notes[i].get('tags') or [])})"
            for i in indices[:8]
        )
        try:
            naming = await llm.name_cluster(cluster_notes_info)
            cluster_label = naming.get("label", f"Cluster {label}")
            cluster_desc = naming.get("description", "")
            cluster_color = naming.get("color_hint", "#6366f1")
        except Exception:
            cluster_label = f"Cluster {label}"
            cluster_desc = ""
            cluster_color = "#6366f1"

        cluster = await db.insert_cluster(
            page_id=page_id,
            label=cluster_label,
            description=cluster_desc,
            color=cluster_color,
            center_x=center_x,
            center_y=center_y,
        )
        cluster_map[label] = cluster["id"]
        clusters_out.append({
            "label": cluster_label,
            "color": cluster_color,
            "center_x": center_x,
            "center_y": center_y,
        })

    # Save note positions
    positions_out = []
    for i, note in enumerate(notes):
        cl_label = int(cluster_labels[i]) if i < len(cluster_labels) else -1
        cid = cluster_map.get(cl_label)
        c_score = centrality_scores.get(note["id"], 0.0)
        is_b = note["id"] in bridge_notes

        await db.update_note(
            note["id"],
            canvas_x=float(coords[i, 0]),
            canvas_y=float(coords[i, 1]),
            cluster_id=cid,
            centrality=c_score,
            is_bridge=is_b,
        )
        positions_out.append({
            "note_id": note["id"],
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
            "cluster": next((c["label"] for c in clusters_out if cluster_map.get(cl_label) == cid and cid), None),
        })

    # Sync Excalidraw scene
    try:
        from app.services.excalidraw_scene import sync_page_notes_to_canvas
        await sync_page_notes_to_canvas(page_id)
    except Exception as e:
        print(f"Excalidraw sync failed: {e}")

    return {
        "positions": positions_out,
        "clusters": clusters_out,
        "cluster_map": cluster_map,
        "status": "done",
    }


async def grid_fallback_node(state: CanvasArchitectState) -> dict:
    notes = state["notes"]
    page_id = state["page_id"]
    w, h = settings.canvas_width, settings.canvas_height

    positions = []
    for i, note in enumerate(notes):
        col = i % 3
        row = i // 3
        x = 100 + col * 420
        y = 100 + row * 350
        await db.update_note(note["id"], canvas_x=x, canvas_y=y)
        positions.append({"note_id": note["id"], "x": x, "y": y})

    try:
        from app.services.excalidraw_scene import sync_page_notes_to_canvas
        await sync_page_notes_to_canvas(page_id)
    except Exception as e:
        print(f"Grid fallback Excalidraw sync failed: {e}")

    return {"positions": positions, "clusters": [], "status": "done"}


def route_after_load(state: CanvasArchitectState) -> str:
    if not state.get("notes"):
        return END
    return "reduce_dimensions"


def route_after_reduce(state: CanvasArchitectState) -> str:
    if state.get("status") == "grid_fallback":
        return "grid_fallback"
    return "cluster"


def build_canvas_architect_graph():
    graph = StateGraph(CanvasArchitectState)

    graph.add_node("load_notes", load_notes_node)
    graph.add_node("reduce_dimensions", reduce_dimensions_node)
    graph.add_node("cluster", cluster_node)
    graph.add_node("centrality", centrality_node)
    graph.add_node("resolve_overlaps", resolve_overlaps_node)
    graph.add_node("save_layout", save_layout_node)
    graph.add_node("grid_fallback", grid_fallback_node)

    graph.set_entry_point("load_notes")
    graph.add_conditional_edges("load_notes", route_after_load, {
        "reduce_dimensions": "reduce_dimensions",
        END: END,
    })
    graph.add_conditional_edges("reduce_dimensions", route_after_reduce, {
        "cluster": "cluster",
        "grid_fallback": "grid_fallback",
    })
    graph.add_edge("cluster", "centrality")
    graph.add_edge("centrality", "resolve_overlaps")
    graph.add_edge("resolve_overlaps", "save_layout")
    graph.add_edge("save_layout", END)
    graph.add_edge("grid_fallback", END)

    return graph.compile()


canvas_architect_graph = build_canvas_architect_graph()