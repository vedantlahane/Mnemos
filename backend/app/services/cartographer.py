from app.agents.canvas_architect import canvas_architect_graph
from app.db.supabase import db
from app.llm import router as llm
from app.config import settings
import numpy as np
import random as _random


class Cartographer:

    async def compute_full_layout(self, page_id: str) -> dict:
        """Run the canvas architect LangGraph agent."""
        initial_state = {
            "page_id": page_id,
            "notes": [],
            "embeddings_matrix": None,
            "coords_2d": None,
            "cluster_labels": None,
            "cluster_map": {},
            "centrality_scores": {},
            "bridge_notes": [],
            "positions": [],
            "clusters": [],
            "edges": [],
            "errors": [],
            "status": "loading",
        }

        result = await canvas_architect_graph.ainvoke(initial_state)
        return await db.get_page_canvas(page_id)

    async def place_single_note(
        self, note_id: str, page_id: str
    ) -> dict | None:
        note = await db.get_note(note_id)
        if not note or not note.get("embedding"):
            return None

        existing = await db.get_notes_with_embeddings(page_id)
        existing = [n for n in existing if n["id"] != note_id]

        if not existing:
            return {
                "x": settings.canvas_width / 2,
                "y": settings.canvas_height / 2,
                "cluster_id": None,
            }

        # Try AI positioning
        try:
            existing_info = "\n".join(
                f"- {n.get('title', 'Untitled')} @ ({n.get('canvas_x', 0):.0f}, {n.get('canvas_y', 0):.0f}) tags: {', '.join(n.get('tags') or [])}"
                for n in existing[:20]
            )
            result = await llm.ai_position_note(
                title=note.get("title"),
                tags=note.get("tags") or [],
                summary=note.get("summary") or "",
                existing_notes=existing_info,
                width=settings.canvas_width,
                height=settings.canvas_height,
            )
            x = float(result.get("x", settings.canvas_width / 2))
            y = float(result.get("y", settings.canvas_height / 2))
            # Clamp to canvas bounds
            x = max(50, min(settings.canvas_width - 400, x))
            y = max(50, min(settings.canvas_height - 300, y))

            cluster_label = result.get("cluster")
            cluster_id = None
            if cluster_label:
                clusters = await db.list_clusters(page_id=page_id)
                for c in clusters:
                    if c["label"].lower() == cluster_label.lower():
                        cluster_id = c["id"]
                        break

            return {"x": x, "y": y, "cluster_id": cluster_id}

        except Exception as e:
            print(f"AI positioning failed, using embedding proximity: {e}")

        # Fallback: embedding similarity placement
        note_emb = np.array(note["embedding"])
        note_norm = np.linalg.norm(note_emb)
        if note_norm == 0:
            return {"x": settings.canvas_width / 2, "y": settings.canvas_height / 2, "cluster_id": None}

        best_sim, best_idx = -1.0, 0
        for i, ex in enumerate(existing):
            if ex.get("embedding"):
                ex_emb = np.array(ex["embedding"])
                ex_norm = np.linalg.norm(ex_emb)
                if ex_norm == 0:
                    continue
                sim = float(np.dot(note_emb, ex_emb) / (note_norm * ex_norm))
                if sim > best_sim:
                    best_sim = sim
                    best_idx = i

        nearest = existing[best_idx]
        base_x = nearest.get("canvas_x") or settings.canvas_width / 2
        base_y = nearest.get("canvas_y") or settings.canvas_height / 2
        angle = _random.uniform(0, 6.28)
        distance = _random.uniform(100, 200)
        x = max(50, min(settings.canvas_width - 50, base_x + distance * np.cos(angle)))
        y = max(50, min(settings.canvas_height - 50, base_y + distance * np.sin(angle)))
        cluster_id = nearest.get("cluster_id") if best_sim > 0.75 else None

        return {"x": float(x), "y": float(y), "cluster_id": cluster_id}


cartographer = Cartographer()