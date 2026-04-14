# === FILE: backend/app/services/canvas_state.py ===
"""
Canvas state manager — single source of truth reconciliation.
Excalidraw scene JSON is authoritative for positions.
DB canvas_x/canvas_y are derived caches for queries.
"""

from __future__ import annotations
import logging
from typing import Optional

from app.db.supabase import db
from app.models.canvas_ops import Rect, Viewport

logger = logging.getLogger("mnemos.canvas_state")


class CanvasStateManager:
    """Manages canvas state, ensures consistency between scene and DB."""

    async def sync_scene_to_db(self, page_id: str, scene: dict) -> int:
        """
        Pull positions from Excalidraw scene → update notes table.
        Scene is the authority. Returns count of notes updated.
        """
        elements = scene.get("elements") or []
        updated = 0

        for el in elements:
            cd = el.get("customData") or {}
            if cd.get("type") != "note-frame":
                continue
            note_id = cd.get("noteId")
            if not note_id:
                continue

            x = el.get("x")
            y = el.get("y")
            if x is None or y is None:
                continue

            # note-frame has 12px outer offset
            note_x = float(x) + 12.0
            note_y = float(y) + 12.0

            try:
                await db.update_note(note_id, canvas_x=note_x, canvas_y=note_y)
                updated += 1
            except Exception as e:
                logger.debug(f"Failed to sync position for {note_id}: {e}")

        return updated

    async def get_canvas_snapshot(self, page_id: str) -> dict:
        """
        Return a lightweight summary of what's on the canvas.
        Used by agents to understand spatial context without loading full scene.
        """
        notes = await db.get_notes_for_page(page_id)
        clusters = await db.list_clusters(page_id=page_id)
        elements = await db.list_elements(page_id)

        note_summaries = []
        for n in notes:
            note_summaries.append({
                "id": n["id"],
                "title": n.get("title") or "Untitled",
                "tags": n.get("tags") or [],
                "x": n.get("canvas_x"),
                "y": n.get("canvas_y"),
                "cluster_id": n.get("cluster_id"),
            })

        cluster_summaries = []
        for c in clusters:
            member_count = sum(1 for n in notes if n.get("cluster_id") == c["id"])
            cluster_summaries.append({
                "id": c["id"],
                "label": c["label"],
                "color": c.get("color"),
                "center_x": c.get("center_x"),
                "center_y": c.get("center_y"),
                "member_count": member_count,
            })

        # Compute bounds
        positioned = [n for n in notes if n.get("canvas_x") is not None]
        if positioned:
            min_x = min(float(n["canvas_x"]) for n in positioned)
            min_y = min(float(n["canvas_y"]) for n in positioned)
            max_x = max(float(n["canvas_x"]) + 360 for n in positioned)
            max_y = max(float(n["canvas_y"]) + 240 for n in positioned)
            bounds = {"min_x": min_x, "min_y": min_y, "max_x": max_x, "max_y": max_y}
        else:
            bounds = {"min_x": 0, "min_y": 0, "max_x": 1920, "max_y": 1080}

        return {
            "note_count": len(notes),
            "element_count": len(elements),
            "cluster_count": len(clusters),
            "notes": note_summaries,
            "clusters": cluster_summaries,
            "bounds": bounds,
        }

    async def find_notes_at_region(
        self, page_id: str, region: Rect
    ) -> list[dict]:
        """Find notes that overlap with a given region."""
        notes = await db.get_notes_for_page(page_id)
        result = []
        for n in notes:
            cx = n.get("canvas_x")
            cy = n.get("canvas_y")
            if cx is None or cy is None:
                continue
            note_rect = Rect(x=float(cx), y=float(cy), w=360, h=240)
            if region.overlaps(note_rect):
                result.append(n)
        return result

    async def find_topic_region(
        self, page_id: str, topic: str
    ) -> Optional[Rect]:
        """Find the bounding region of notes related to a topic."""
        notes = await db.get_notes_for_page(page_id)
        topic_lower = topic.lower()
        matching = []
        for n in notes:
            title = (n.get("title") or "").lower()
            tags = [t.lower() for t in (n.get("tags") or [])]
            summary = (n.get("summary") or "").lower()
            if (
                topic_lower in title
                or topic_lower in summary
                or any(topic_lower in t for t in tags)
            ):
                if n.get("canvas_x") is not None:
                    matching.append(n)

        if not matching:
            return None

        min_x = min(float(n["canvas_x"]) for n in matching)
        min_y = min(float(n["canvas_y"]) for n in matching)
        max_x = max(float(n["canvas_x"]) + 360 for n in matching)
        max_y = max(float(n["canvas_y"]) + 240 for n in matching)

        return Rect(x=min_x, y=min_y, w=max_x - min_x, h=max_y - min_y)


canvas_state = CanvasStateManager()