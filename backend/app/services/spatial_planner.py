# === FILE: backend/app/services/spatial_planner.py ===
"""
Algorithmic spatial placement for the infinite canvas.
No LLM calls — pure geometry + semantic proximity.
"""

from __future__ import annotations
import math
import logging
from typing import Optional
import numpy as np

from app.models.canvas_ops import Rect, Viewport, Placement
from app.config import settings
from app.db.supabase import db

logger = logging.getLogger("mnemos.spatial")

CW = settings.default_card_width
CH = settings.default_card_height
SX = settings.card_spacing_x
SY = settings.card_spacing_y
GAP = settings.min_element_gap


class SpatialPlanner:
    """Deterministic, algorithmic canvas placement engine."""

    # ── Public API ──

    async def find_placement(
        self,
        page_id: str,
        note: Optional[dict] = None,
        size: tuple[float, float] = (CW, CH),
        viewport: Optional[Viewport] = None,
        near_topic: Optional[str] = None,
        strategy: str = "auto",
    ) -> Placement:
        occupied = await self._get_occupied(page_id)

        if strategy == "auto":
            strategy = self._pick_strategy(note, viewport, near_topic, occupied)

        if strategy == "cluster" and note:
            result = await self._place_near_cluster(page_id, note, size, occupied)
            if result:
                return result

        if strategy == "related" and note:
            result = await self._place_near_related(page_id, note, size, occupied)
            if result:
                return result

        if viewport:
            result = self._place_in_viewport(viewport, size, occupied)
            if result:
                return result

        return self._place_sequential(size, occupied)

    async def compute_cluster_layout(
        self, page_id: str, note_ids: list[str], anchor: tuple[float, float] | None = None
    ) -> list[dict]:
        """Tight grid layout for a set of notes."""
        if not note_ids:
            return []
        notes = []
        for nid in note_ids:
            n = await db.get_note(nid)
            if n:
                notes.append(n)
        if not notes:
            return []

        if anchor is None:
            xs = [n.get("canvas_x", 0) for n in notes if n.get("canvas_x") is not None]
            ys = [n.get("canvas_y", 0) for n in notes if n.get("canvas_y") is not None]
            if xs and ys:
                anchor = (float(np.mean(xs)), float(np.mean(ys)))
            else:
                anchor = (400.0, 400.0)

        cols = max(1, int(math.ceil(math.sqrt(len(notes)))))
        positions = []
        for i, note in enumerate(notes):
            col = i % cols
            row = i // cols
            x = anchor[0] + col * SX
            y = anchor[1] + row * SY
            positions.append({
                "note_id": note["id"],
                "x": x,
                "y": y,
            })
        return positions

    async def compute_full_layout(self, page_id: str) -> list[dict]:
        """
        Full page layout using embedding proximity.
        Groups similar notes together, arranges clusters in a grid-of-grids.
        Falls back to simple grid if <3 notes or no embeddings.
        """
        notes = await db.get_notes_with_embeddings(page_id)
        all_notes = await db.get_notes_for_page(page_id)

        # Notes without embeddings get grid fallback
        embedded_ids = {n["id"] for n in notes}
        unembedded = [n for n in all_notes if n["id"] not in embedded_ids]

        if len(notes) < 3:
            return self._grid_layout(all_notes)

        # Cluster by embedding similarity
        clusters = self._cluster_by_embedding(notes)

        positions = []
        cluster_anchor_x = 100.0
        cluster_anchor_y = 100.0
        max_row_height = 0.0
        clusters_per_row = max(1, int(math.ceil(math.sqrt(len(clusters)))))

        for ci, cluster_notes in enumerate(clusters):
            cols = max(1, int(math.ceil(math.sqrt(len(cluster_notes)))))
            for ni, note in enumerate(cluster_notes):
                col = ni % cols
                row = ni // cols
                x = cluster_anchor_x + col * SX
                y = cluster_anchor_y + row * SY
                positions.append({"note_id": note["id"], "x": x, "y": y})
                max_row_height = max(max_row_height, (row + 1) * SY)

            cluster_width = min(len(cluster_notes), cols) * SX
            cluster_anchor_x += cluster_width + settings.cluster_padding * 2

            if (ci + 1) % clusters_per_row == 0:
                cluster_anchor_x = 100.0
                cluster_anchor_y += max_row_height + settings.cluster_padding * 2
                max_row_height = 0.0

        # Append unembedded notes at the end
        if unembedded:
            if positions:
                last_y = max(p["y"] for p in positions) + SY + settings.cluster_padding
            else:
                last_y = 100.0
            for i, note in enumerate(unembedded):
                col = i % 3
                row = i // 3
                positions.append({
                    "note_id": note["id"],
                    "x": 100.0 + col * SX,
                    "y": last_y + row * SY,
                })

        return positions

    def get_occupied_regions(self, notes: list[dict], elements: list[dict] = None) -> list[Rect]:
        """Build rectangles from notes and canvas elements using REAL measured bounds."""
        from app.services.element_layout import measure_element

        rects: list[Rect] = []

        for n in notes:
            cx = n.get("canvas_x")
            cy = n.get("canvas_y")
            if cx is not None and cy is not None:
                # Use stored dimensions if available, otherwise default card size
                w = float(n.get("canvas_width") or CW)
                h = float(n.get("canvas_height") or CH)
                rects.append(Rect(x=float(cx), y=float(cy), w=w, h=h))

        for el in (elements or []):
            has_position = any(
                el.get(key) is not None for key in ("x", "y", "position_x", "position_y")
            )
            if not has_position:
                continue
            measured = measure_element(el)
            rects.append(Rect(
                x=measured.x,
                y=measured.y,
                w=measured.width,
                h=measured.height,
            ))

        return rects

    # ── Private ──

    async def _get_occupied(self, page_id: str) -> list[Rect]:
        notes = await db.get_notes_for_page(page_id)
        db_elements = await db.list_elements(page_id)

        page = await db.get_page(page_id)
        scene_elements = []
        if page and isinstance(page.get("canvas_data"), dict):
            scene_elements = page["canvas_data"].get("elements") or []

        return self.get_occupied_regions(notes, [*db_elements, *scene_elements])

    def _pick_strategy(
        self,
        note: dict | None,
        viewport: Viewport | None,
        near_topic: str | None,
        occupied: list[Rect],
    ) -> str:
        if near_topic:
            return "cluster"
        if note and note.get("embedding"):
            return "related"
        if viewport:
            return "viewport"
        return "sequential"

    async def _place_near_cluster(
        self, page_id: str, note: dict, size: tuple[float, float], occupied: list[Rect]
    ) -> Placement | None:
        """Find the cluster this note belongs to and place at its edge."""
        if not note.get("embedding"):
            return None

        note_emb = np.array(note["embedding"])
        note_norm = np.linalg.norm(note_emb)
        if note_norm == 0:
            return None

        clusters = await db.list_clusters(page_id=page_id)
        if not clusters:
            return None

        # Find best cluster by checking member notes
        best_cluster = None
        best_sim = -1.0

        for cluster in clusters:
            cluster_notes = await db.list_notes(page=1, limit=50, page_id=page_id)
            members = [n for n in cluster_notes.get("notes", []) if n.get("cluster_id") == cluster["id"] and n.get("embedding")]
            if not members:
                continue
            for m in members:
                m_emb = np.array(m["embedding"])
                m_norm = np.linalg.norm(m_emb)
                if m_norm == 0:
                    continue
                sim = float(np.dot(note_emb, m_emb) / (note_norm * m_norm))
                if sim > best_sim:
                    best_sim = sim
                    best_cluster = cluster

        if not best_cluster or best_sim < settings.similarity_threshold:
            return None

        # Get cluster bounds
        cluster_notes_result = await db.list_notes(page=1, limit=100, page_id=page_id)
        cluster_members = [
            n for n in cluster_notes_result.get("notes", [])
            if n.get("cluster_id") == best_cluster["id"]
            and n.get("canvas_x") is not None
        ]
        if not cluster_members:
            cx = best_cluster.get("center_x", 400)
            cy = best_cluster.get("center_y", 400)
            spot = self._find_free_spot(cx, cy, size, occupied)
            return Placement(x=spot[0], y=spot[1], cluster_id=best_cluster["id"], strategy="cluster", reason=f"New member of '{best_cluster['label']}'")

        cluster_rect = self._bounding_rect(cluster_members)
        spot = self._place_at_rect_edge(cluster_rect, size, occupied)
        return Placement(
            x=spot[0], y=spot[1],
            cluster_id=best_cluster["id"],
            strategy="cluster",
            reason=f"Placed at edge of '{best_cluster['label']}' cluster",
        )

    async def _place_near_related(
        self, page_id: str, note: dict, size: tuple[float, float], occupied: list[Rect]
    ) -> Placement | None:
        """Place near the most similar existing note."""
        if not note.get("embedding"):
            return None

        existing = await db.get_notes_with_embeddings(page_id)
        existing = [n for n in existing if n["id"] != note.get("id") and n.get("canvas_x") is not None]
        if not existing:
            return None

        note_emb = np.array(note["embedding"])
        note_norm = np.linalg.norm(note_emb)
        if note_norm == 0:
            return None

        best_sim = -1.0
        best_note = None
        for ex in existing:
            ex_emb = np.array(ex["embedding"])
            ex_norm = np.linalg.norm(ex_emb)
            if ex_norm == 0:
                continue
            sim = float(np.dot(note_emb, ex_emb) / (note_norm * ex_norm))
            if sim > best_sim:
                best_sim = sim
                best_note = ex

        if not best_note:
            return None

        base_x = float(best_note["canvas_x"])
        base_y = float(best_note["canvas_y"])
        spot = self._find_free_spot(base_x + SX, base_y, size, occupied)

        return Placement(
            x=spot[0], y=spot[1],
            cluster_id=best_note.get("cluster_id"),
            strategy="related",
            reason=f"Near '{best_note.get('title', 'Untitled')}' ({best_sim:.0%} similar)",
        )

    def _place_in_viewport(
        self, viewport: Viewport, size: tuple[float, float], occupied: list[Rect]
    ) -> Placement | None:
        """Find free space within the user's current view."""
        vx = viewport.x / viewport.zoom
        vy = viewport.y / viewport.zoom
        vw = viewport.width / viewport.zoom
        vh = viewport.height / viewport.zoom

        # Scan grid within viewport
        for dx_pct in [0.5, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]:
            for dy_pct in [0.4, 0.3, 0.6, 0.2, 0.7, 0.1, 0.8]:
                cx = vx + vw * dx_pct
                cy = vy + vh * dy_pct
                candidate = Rect(x=cx, y=cy, w=size[0], h=size[1])
                if not any(candidate.overlaps(occ, gap=GAP) for occ in occupied):
                    return Placement(
                        x=cx, y=cy,
                        strategy="viewport",
                        reason="Placed in visible area",
                    )

        # Viewport full — place just outside right edge
        return Placement(
            x=vx + vw + GAP,
            y=vy + vh * 0.3,
            strategy="viewport_overflow",
            reason="Viewport full, placed to the right",
        )

    def _place_sequential(self, size: tuple[float, float], occupied: list[Rect]) -> Placement:
        """Place in next available grid slot after all existing elements."""
        if not occupied:
            return Placement(x=100.0, y=100.0, strategy="sequential", reason="First element on canvas")

        # Find bottom-right extent
        max_y = max(r.bottom for r in occupied)
        max_x = max(r.right for r in occupied)

        # Try below last row, aligned left
        candidates = [
            (100.0, max_y + GAP),
            (max_x + GAP, 100.0),
        ]
        for cx, cy in candidates:
            candidate = Rect(x=cx, y=cy, w=size[0], h=size[1])
            if not any(candidate.overlaps(occ, gap=GAP) for occ in occupied):
                return Placement(x=cx, y=cy, strategy="sequential", reason="Next available slot")

        return Placement(x=100.0, y=max_y + GAP, strategy="sequential", reason="Appended below")

    def _find_free_spot(
        self, start_x: float, start_y: float,
        size: tuple[float, float], occupied: list[Rect],
        max_attempts: int = 36,
    ) -> tuple[float, float]:
        """Spiral outward from start position until free spot found."""
        for ring in range(max_attempts):
            distance = GAP + ring * (GAP + size[0] * 0.5)
            steps = max(6, ring * 6)
            for step in range(steps):
                angle = (2 * math.pi * step) / steps
                cx = start_x + distance * math.cos(angle)
                cy = start_y + distance * math.sin(angle)
                candidate = Rect(x=cx, y=cy, w=size[0], h=size[1])
                if not any(candidate.overlaps(occ, gap=GAP) for occ in occupied):
                    return (cx, cy)
        return (start_x + SX, start_y)

    def _place_at_rect_edge(
        self, bounds: Rect, size: tuple[float, float], occupied: list[Rect]
    ) -> tuple[float, float]:
        """Place at the edge of a bounding rectangle (right, bottom, left, top)."""
        candidates = [
            (bounds.right + GAP, bounds.center_y - size[1] / 2),
            (bounds.center_x - size[0] / 2, bounds.bottom + GAP),
            (bounds.x - size[0] - GAP, bounds.center_y - size[1] / 2),
            (bounds.center_x - size[0] / 2, bounds.y - size[1] - GAP),
        ]
        for cx, cy in candidates:
            candidate = Rect(x=cx, y=cy, w=size[0], h=size[1])
            if not any(candidate.overlaps(occ, gap=GAP) for occ in occupied):
                return (cx, cy)
        return self._find_free_spot(bounds.right + GAP, bounds.center_y, size, occupied)

    def _bounding_rect(self, notes: list[dict]) -> Rect:
        xs = [float(n["canvas_x"]) for n in notes]
        ys = [float(n["canvas_y"]) for n in notes]
        rights = [float(n["canvas_x"]) + float(n.get("canvas_width") or CW) for n in notes]
        bottoms = [float(n["canvas_y"]) + float(n.get("canvas_height") or CH) for n in notes]
        min_x = min(xs)
        min_y = min(ys)
        max_x = max(rights)
        max_y = max(bottoms)
        return Rect(x=min_x, y=min_y, w=max_x - min_x, h=max_y - min_y)

    def _grid_layout(self, notes: list[dict]) -> list[dict]:
        positions = []
        for i, note in enumerate(notes):
            col = i % 3
            row = i // 3
            positions.append({
                "note_id": note["id"],
                "x": 100.0 + col * SX,
                "y": 100.0 + row * SY,
            })
        return positions

    def _cluster_by_embedding(self, notes: list[dict], threshold: float = 0.72) -> list[list[dict]]:
        """Simple greedy clustering by cosine similarity."""
        if not notes:
            return []

        assigned = [False] * len(notes)
        clusters: list[list[dict]] = []
        embeddings = []
        norms = []
        for n in notes:
            emb = np.array(n["embedding"])
            embeddings.append(emb)
            norms.append(np.linalg.norm(emb))

        for i in range(len(notes)):
            if assigned[i] or norms[i] == 0:
                continue
            cluster = [notes[i]]
            assigned[i] = True
            for j in range(i + 1, len(notes)):
                if assigned[j] or norms[j] == 0:
                    continue
                sim = float(np.dot(embeddings[i], embeddings[j]) / (norms[i] * norms[j]))
                if sim >= threshold:
                    cluster.append(notes[j])
                    assigned[j] = True
            clusters.append(cluster)

        # Add any unassigned
        for i, note in enumerate(notes):
            if not assigned[i]:
                clusters.append([note])

        return clusters

    async def resolve_overlaps(self, page_id: str) -> list[dict]:
        """Push overlapping elements apart. Returns list of moves."""
        notes = await db.get_notes_for_page(page_id)
        positioned = [n for n in notes if n.get("canvas_x") is not None and n.get("canvas_y") is not None]
        if len(positioned) < 2:
            return []

        coords = np.array([[float(n["canvas_x"]), float(n["canvas_y"])] for n in positioned])
        moves = []

        for iteration in range(50):
            moved = False
            for i in range(len(coords)):
                for j in range(i + 1, len(coords)):
                    dx = coords[j, 0] - coords[i, 0]
                    dy = coords[j, 1] - coords[i, 1]
                    dist = math.sqrt(dx * dx + dy * dy)
                    if dist < GAP and dist > 0:
                        push = (GAP - dist) / 2.0
                        nx = dx / dist
                        ny = dy / dist
                        coords[i, 0] -= nx * push
                        coords[i, 1] -= ny * push
                        coords[j, 0] += nx * push
                        coords[j, 1] += ny * push
                        moved = True
            if not moved:
                break

        for i, note in enumerate(positioned):
            old_x = float(note["canvas_x"])
            old_y = float(note["canvas_y"])
            new_x = float(coords[i, 0])
            new_y = float(coords[i, 1])
            if abs(new_x - old_x) > 1 or abs(new_y - old_y) > 1:
                moves.append({
                    "note_id": note["id"],
                    "x": new_x,
                    "y": new_y,
                    "old_x": old_x,
                    "old_y": old_y,
                })

        return moves


spatial_planner = SpatialPlanner()