# === FILE: backend/app/services/spatial_planner.py ===
"""
Spatial planner — pure geometry + semantic proximity.
No LLM calls. Uses visual context for smarter decisions.
"""

from __future__ import annotations
import math
import logging
import json
from typing import Optional
import numpy as np

from app.models.canvas_ops import Rect, Viewport, Placement
from app.models.visual import VisualContext, LayoutPattern
from app.config import settings
from app.db.supabase import db

logger = logging.getLogger("mnemos.spatial")

CW = settings.default_card_width
CH = settings.default_card_height
SX = settings.card_spacing_x
SY = settings.card_spacing_y
GAP = settings.min_element_gap


class SpatialPlanner:

    async def find_placement(
        self,
        page_id: str,
        note: Optional[dict] = None,
        size: tuple[float, float] = (CW, CH),
        viewport: Optional[Viewport] = None,
        near_topic: Optional[str] = None,
        strategy: str = "auto",
        visual_context: Optional[VisualContext] = None,
    ) -> Placement:
        occupied = await self._get_occupied(page_id)

        # Load visual context if not provided
        if not visual_context:
            try:
                ctx_data = await db.get_visual_context(page_id)
                if ctx_data:
                    visual_context = VisualContext(page_id=page_id, **{
                        k: v for k, v in ctx_data.items()
                        if k in VisualContext.model_fields and k != "page_id"
                    })
            except Exception:
                pass

        if strategy == "auto":
            strategy = self._pick_strategy(note, viewport, near_topic, occupied, visual_context)

        if strategy == "pattern_aware" and visual_context:
            result = self._place_by_pattern(visual_context, size, occupied)
            if result:
                return result

        if strategy == "region" and note:
            result = await self._place_near_region(page_id, note, size, occupied)
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

    async def compute_full_layout(self, page_id: str) -> list[dict]:
        notes = await db.get_notes_with_embeddings(page_id)
        # Parse any string embeddings
        for n in notes:
            if isinstance(n.get("embedding"), str):
                n["embedding"] = json.loads(n["embedding"])
                
        all_notes = await db.get_notes_for_page(page_id)
        embedded_ids = {n["id"] for n in notes}
        unembedded = [n for n in all_notes if n["id"] not in embedded_ids]

        if len(notes) < 3:
            return self._grid_layout(all_notes)

        clusters = self._cluster_by_embedding(notes)
        positions = []
        anchor_x = 100.0
        anchor_y = 100.0
        max_row_h = 0.0
        cols_per_row = max(1, int(math.ceil(math.sqrt(len(clusters)))))

        for ci, cluster_notes in enumerate(clusters):
            cols = max(1, int(math.ceil(math.sqrt(len(cluster_notes)))))
            for ni, note in enumerate(cluster_notes):
                col = ni % cols
                row = ni // cols
                positions.append({"note_id": note["id"], "x": anchor_x + col * SX, "y": anchor_y + row * SY})
                max_row_h = max(max_row_h, (row + 1) * SY)
            anchor_x += min(len(cluster_notes), cols) * SX + settings.cluster_padding * 2
            if (ci + 1) % cols_per_row == 0:
                anchor_x = 100.0
                anchor_y += max_row_h + settings.cluster_padding * 2
                max_row_h = 0.0

        if unembedded:
            last_y = max((p["y"] for p in positions), default=100.0) + SY + settings.cluster_padding
            for i, note in enumerate(unembedded):
                positions.append({"note_id": note["id"], "x": 100.0 + (i % 3) * SX, "y": last_y + (i // 3) * SY})

        return positions

    async def resolve_overlaps(self, page_id: str) -> list[dict]:
        registry = await db.get_element_registry(page_id)
        positioned = [e for e in registry if e.get("cached_x") is not None and e.get("cached_y") is not None]
        if len(positioned) < 2:
            return []

        coords = np.array([[float(e["cached_x"]), float(e["cached_y"])] for e in positioned])
        moves = []
        for _ in range(50):
            moved = False
            for i in range(len(coords)):
                for j in range(i + 1, len(coords)):
                    dx = coords[j, 0] - coords[i, 0]
                    dy = coords[j, 1] - coords[i, 1]
                    dist = math.sqrt(dx * dx + dy * dy)
                    if 0 < dist < GAP:
                        push = (GAP - dist) / 2.0
                        nx, ny = dx / dist, dy / dist
                        coords[i, 0] -= nx * push
                        coords[i, 1] -= ny * push
                        coords[j, 0] += nx * push
                        coords[j, 1] += ny * push
                        moved = True
            if not moved:
                break

        for i, entry in enumerate(positioned):
            old_x, old_y = float(entry["cached_x"]), float(entry["cached_y"])
            new_x, new_y = float(coords[i, 0]), float(coords[i, 1])
            if abs(new_x - old_x) > 1 or abs(new_y - old_y) > 1:
                moves.append({
                    "element_id": entry.get("element_id"),
                    "note_id": entry.get("note_id"),
                    "x": new_x, "y": new_y,
                })
        return moves

    # ── Private ──

    async def _get_occupied(self, page_id: str) -> list[Rect]:
        registry = await db.get_element_registry(page_id)
        rects = []
        for e in registry:
            if e.get("cached_x") is not None and e.get("cached_y") is not None:
                rects.append(Rect(
                    x=float(e["cached_x"]), y=float(e["cached_y"]),
                    w=float(e.get("cached_width") or CW), h=float(e.get("cached_height") or CH),
                ))
        return rects

    def _pick_strategy(
        self, note: dict | None, viewport: Viewport | None,
        near_topic: str | None, occupied: list[Rect],
        visual_context: VisualContext | None,
    ) -> str:
        if visual_context and visual_context.layout_pattern != LayoutPattern.FREEFORM:
            return "pattern_aware"
        if near_topic:
            return "region"
        if note and note.get("id"):
            return "related"
        if viewport:
            return "viewport"
        return "sequential"

    def _place_by_pattern(self, ctx: VisualContext, size: tuple[float, float], occupied: list[Rect]) -> Placement | None:
        """Place according to detected layout pattern."""
        if not occupied:
            return None

        bounds = ctx.bounds
        if ctx.layout_pattern == LayoutPattern.GRID:
            # Continue the grid: find next open slot in existing grid
            last_x = max(r.right for r in occupied)
            last_y = max(r.bottom for r in occupied)
            # Try continuing current row
            candidate = Rect(x=last_x + GAP, y=occupied[-1].y if occupied else 100, w=size[0], h=size[1])
            if not any(candidate.overlaps(o, gap=GAP) for o in occupied):
                return Placement(x=candidate.x, y=candidate.y, strategy="pattern_grid", reason="Continuing grid layout")
            # New row
            return Placement(x=bounds.get("minX", 100), y=last_y + GAP, strategy="pattern_grid", reason="New grid row")

        if ctx.layout_pattern == LayoutPattern.TIMELINE:
            # Add to right end of timeline
            max_x = max(r.right for r in occupied)
            avg_y = sum(r.center_y for r in occupied) / len(occupied)
            return Placement(x=max_x + GAP, y=avg_y - size[1] / 2, strategy="pattern_timeline", reason="Extended timeline")

        if ctx.layout_pattern == LayoutPattern.FLOW:
            # Add below
            max_y = max(r.bottom for r in occupied)
            avg_x = sum(r.center_x for r in occupied) / len(occupied)
            return Placement(x=avg_x - size[0] / 2, y=max_y + GAP, strategy="pattern_flow", reason="Continued flow")

        return None

    async def _place_near_region(self, page_id: str, note: dict, size: tuple[float, float], occupied: list[Rect]) -> Placement | None:
        embedding = await db.get_embedding(note["id"]) if note.get("id") else None
        if not embedding:
            return None

        if isinstance(embedding, str):
            import json
            embedding = json.loads(embedding)

        note_emb = np.array(embedding)
        note_norm = np.linalg.norm(note_emb)
        if note_norm == 0:
            return None

        regions = await db.list_regions(page_id)
        if not regions:
            return None

        best_region = None
        best_sim = -1.0
        for region in regions:
            members = await db.get_elements_in_region(region["id"])
            for m in members:
                if not m.get("note_id"):
                    continue
                m_emb = await db.get_embedding(m["note_id"])
                if not m_emb:
                    continue
                if isinstance(m_emb, str):
                    m_emb = json.loads(m_emb)
                m_arr = np.array(m_emb)
                m_norm = np.linalg.norm(m_arr)
                if m_norm == 0:
                    continue
                sim = float(np.dot(note_emb, m_arr) / (note_norm * m_norm))
                if sim > best_sim:
                    best_sim = sim
                    best_region = region

        if not best_region or best_sim < settings.similarity_threshold:
            return None

        members = await db.get_elements_in_region(best_region["id"])
        member_rects = [
            Rect(x=float(m["cached_x"]), y=float(m["cached_y"]),
                 w=float(m.get("cached_width") or CW), h=float(m.get("cached_height") or CH))
            for m in members if m.get("cached_x") is not None
        ]
        if not member_rects:
            return Placement(x=400, y=400, region_id=best_region["id"], strategy="region", reason=f"Region '{best_region.get('label')}'")

        bounds = self._bounding_rect_from_rects(member_rects)
        spot = self._place_at_rect_edge(bounds, size, occupied)
        return Placement(x=spot[0], y=spot[1], region_id=best_region["id"], strategy="region",
                         reason=f"At edge of '{best_region.get('label')}'")

    async def _place_near_related(self, page_id: str, note: dict, size: tuple[float, float], occupied: list[Rect]) -> Placement | None:
        embedding = await db.get_embedding(note["id"]) if note.get("id") else None
        if not embedding:
            return None
        if isinstance(embedding, str):
            embedding = json.loads(embedding)

        notes_with_emb = await db.get_notes_with_embeddings(page_id)
        notes_with_emb = [n for n in notes_with_emb if n["id"] != note.get("id")]
        if not notes_with_emb:
            return None

        note_emb = np.array(embedding)
        note_norm = np.linalg.norm(note_emb)
        if note_norm == 0:
            return None

        best_sim = -1.0
        best_note = None
        for ex in notes_with_emb:
            ex_emb = ex["embedding"]
            if isinstance(ex_emb, str):
                ex_emb = json.loads(ex_emb)
            ex_emb = np.array(ex_emb)
            ex_norm = np.linalg.norm(ex_emb)
            if ex_norm == 0:
                continue
            sim = float(np.dot(note_emb, ex_emb) / (note_norm * ex_norm))
            if sim > best_sim:
                best_sim = sim
                best_note = ex

        if not best_note:
            return None

        # Get position from registry
        pos = await db.get_note_position(page_id, best_note["id"])
        if not pos or pos.get("x") is None:
            return None

        spot = self._find_free_spot(float(pos["x"]) + SX, float(pos["y"]), size, occupied)
        return Placement(x=spot[0], y=spot[1], strategy="related",
                         reason=f"Near '{best_note.get('title', 'Untitled')}' ({best_sim:.0%})")

    def _place_in_viewport(self, viewport: Viewport, size: tuple[float, float], occupied: list[Rect]) -> Placement | None:
        vx = viewport.x / viewport.zoom
        vy = viewport.y / viewport.zoom
        vw = viewport.width / viewport.zoom
        vh = viewport.height / viewport.zoom
        for dx_pct in [0.5, 0.3, 0.7, 0.2, 0.8]:
            for dy_pct in [0.4, 0.3, 0.6, 0.2, 0.7]:
                cx = vx + vw * dx_pct
                cy = vy + vh * dy_pct
                candidate = Rect(x=cx, y=cy, w=size[0], h=size[1])
                if not any(candidate.overlaps(occ, gap=GAP) for occ in occupied):
                    return Placement(x=cx, y=cy, strategy="viewport", reason="In visible area")
        return Placement(x=vx + vw + GAP, y=vy + vh * 0.3, strategy="viewport_overflow", reason="Viewport full")

    def _place_sequential(self, size: tuple[float, float], occupied: list[Rect]) -> Placement:
        if not occupied:
            return Placement(x=100.0, y=100.0, strategy="sequential", reason="First element")
        max_y = max(r.bottom for r in occupied)
        return Placement(x=100.0, y=max_y + GAP, strategy="sequential", reason="Appended below")

    def _find_free_spot(self, sx: float, sy: float, size: tuple[float, float], occupied: list[Rect], max_attempts: int = 36) -> tuple[float, float]:
        for ring in range(max_attempts):
            distance = GAP + ring * (GAP + size[0] * 0.5)
            steps = max(6, ring * 6)
            for step in range(steps):
                angle = (2 * math.pi * step) / steps
                cx = sx + distance * math.cos(angle)
                cy = sy + distance * math.sin(angle)
                candidate = Rect(x=cx, y=cy, w=size[0], h=size[1])
                if not any(candidate.overlaps(occ, gap=GAP) for occ in occupied):
                    return (cx, cy)
        return (sx + SX, sy)

    def _place_at_rect_edge(self, bounds: Rect, size: tuple[float, float], occupied: list[Rect]) -> tuple[float, float]:
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

    def _bounding_rect_from_rects(self, rects: list[Rect]) -> Rect:
        min_x = min(r.x for r in rects)
        min_y = min(r.y for r in rects)
        max_x = max(r.right for r in rects)
        max_y = max(r.bottom for r in rects)
        return Rect(x=min_x, y=min_y, w=max_x - min_x, h=max_y - min_y)

    def _grid_layout(self, notes: list[dict]) -> list[dict]:
        return [
            {"note_id": n["id"], "x": 100.0 + (i % 3) * SX, "y": 100.0 + (i // 3) * SY}
            for i, n in enumerate(notes)
        ]

    def _cluster_by_embedding(self, notes: list[dict], threshold: float = 0.72) -> list[list[dict]]:
        if not notes:
            return []
        assigned = [False] * len(notes)
        clusters: list[list[dict]] = []
        embeddings = [np.array(n["embedding"]) for n in notes]
        norms = [np.linalg.norm(e) for e in embeddings]
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
        for i, note in enumerate(notes):
            if not assigned[i]:
                clusters.append([note])
        return clusters


spatial_planner = SpatialPlanner()