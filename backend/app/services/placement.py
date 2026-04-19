"""
Spatial placement — finds where to put new content on the canvas.
Pure geometry + semantic proximity. No LLM calls.
"""

from __future__ import annotations
import math
import json
import logging
from typing import Optional

import numpy as np

from app.db.supabase import db
from app.excalidraw.scene import get_occupied_rects, compute_bounds, detect_layout_pattern
from app.config import settings

logger = logging.getLogger("mnemos.placement")

CW = settings.card_width
CH = settings.card_height
GAP = settings.min_gap


class Placement:
    __slots__ = ("x", "y", "strategy", "reason")

    def __init__(self, x: float, y: float, strategy: str = "auto", reason: str = ""):
        self.x = x
        self.y = y
        self.strategy = strategy
        self.reason = reason


async def find_placement(
    page_id: str,
    scene: dict,
    *,
    note: dict = None,
    size: tuple[float, float] = (CW, CH),
    viewport: dict = None,
    near_topic: str = None,
    strategy: str = "auto",
) -> Placement:
    """Find best placement for new content on canvas."""
    occupied = get_occupied_rects(scene)

    if strategy == "auto":
        strategy = _pick_strategy(note, viewport, near_topic, occupied, scene)

    if strategy == "pattern" and occupied:
        result = _place_by_pattern(scene, size, occupied)
        if result:
            return result

    if strategy == "related" and note and note.get("id"):
        result = await _place_near_related(page_id, note, size, occupied)
        if result:
            return result

    if viewport:
        result = _place_in_viewport(viewport, size, occupied)
        if result:
            return result

    return _place_sequential(size, occupied)


def _pick_strategy(
    note: dict | None, viewport: dict | None,
    near_topic: str | None, occupied: list[dict],
    scene: dict,
) -> str:
    if not occupied:
        return "sequential"
    pattern = detect_layout_pattern(scene)
    if pattern != "freeform":
        return "pattern"
    if note and note.get("id"):
        return "related"
    if viewport:
        return "viewport"
    return "sequential"


def _place_by_pattern(scene: dict, size: tuple, occupied: list[dict]) -> Placement | None:
    pattern = detect_layout_pattern(scene)
    if not occupied:
        return None

    if pattern == "grid":
        last_x = max(r["x"] + r["width"] for r in occupied)
        last_y = max(r["y"] + r["height"] for r in occupied)
        candidate = {"x": last_x + GAP, "y": occupied[-1]["y"], "width": size[0], "height": size[1]}
        if not _overlaps_any(candidate, occupied):
            return Placement(candidate["x"], candidate["y"], "pattern_grid", "Continuing grid")
        bounds = compute_bounds(scene)
        return Placement(bounds["minX"], last_y + GAP, "pattern_grid", "New grid row")

    if pattern == "timeline":
        max_x = max(r["x"] + r["width"] for r in occupied)
        avg_y = sum(r["y"] + r["height"] / 2 for r in occupied) / len(occupied)
        return Placement(max_x + GAP, avg_y - size[1] / 2, "pattern_timeline", "Extended timeline")

    if pattern == "flow":
        max_y = max(r["y"] + r["height"] for r in occupied)
        avg_x = sum(r["x"] + r["width"] / 2 for r in occupied) / len(occupied)
        return Placement(avg_x - size[0] / 2, max_y + GAP, "pattern_flow", "Continued flow")

    return None


async def _place_near_related(
    page_id: str, note: dict, size: tuple, occupied: list[dict],
) -> Placement | None:
    emb = await db.get_embedding(note["id"])
    if not emb:
        return None
    if isinstance(emb, str):
        emb = json.loads(emb)

    notes_with_emb = await db.get_notes_with_embeddings(page_id)
    notes_with_emb = [n for n in notes_with_emb if n["id"] != note["id"]]
    if not notes_with_emb:
        return None

    note_emb = np.array(emb)
    note_norm = np.linalg.norm(note_emb)
    if note_norm == 0:
        return None

    best_sim = -1.0
    best_note = None
    for ex in notes_with_emb:
        ex_emb = ex["embedding"]
        if isinstance(ex_emb, str):
            ex_emb = json.loads(ex_emb)
        ex_arr = np.array(ex_emb)
        ex_norm = np.linalg.norm(ex_arr)
        if ex_norm == 0:
            continue
        sim = float(np.dot(note_emb, ex_arr) / (note_norm * ex_norm))
        if sim > best_sim:
            best_sim = sim
            best_note = ex

    if not best_note or best_note.get("canvas_x") is None:
        return None

    anchor_x = float(best_note["canvas_x"]) + CW + GAP
    anchor_y = float(best_note["canvas_y"])
    spot = _find_free_spot(anchor_x, anchor_y, size, occupied)
    return Placement(
        spot[0], spot[1], "related",
        f"Near '{best_note.get('title', 'Untitled')}' ({best_sim:.0%})",
    )


def _place_in_viewport(viewport: dict, size: tuple, occupied: list[dict]) -> Placement | None:
    vx = viewport.get("x", 0) / viewport.get("zoom", 1)
    vy = viewport.get("y", 0) / viewport.get("zoom", 1)
    vw = viewport.get("width", 1920) / viewport.get("zoom", 1)
    vh = viewport.get("height", 1080) / viewport.get("zoom", 1)

    for dx_pct in [0.5, 0.3, 0.7, 0.2, 0.8]:
        for dy_pct in [0.4, 0.3, 0.6, 0.2, 0.7]:
            cx = vx + vw * dx_pct
            cy = vy + vh * dy_pct
            candidate = {"x": cx, "y": cy, "width": size[0], "height": size[1]}
            if not _overlaps_any(candidate, occupied):
                return Placement(cx, cy, "viewport", "In visible area")

    return Placement(vx + vw + GAP, vy + vh * 0.3, "viewport_overflow", "Viewport full")


def _place_sequential(size: tuple, occupied: list[dict]) -> Placement:
    if not occupied:
        return Placement(100.0, 100.0, "sequential", "First element")
    max_y = max(r["y"] + r["height"] for r in occupied)
    return Placement(100.0, max_y + GAP, "sequential", "Appended below")


def _find_free_spot(
    sx: float, sy: float, size: tuple, occupied: list[dict],
    max_attempts: int = 36,
) -> tuple[float, float]:
    for ring in range(max_attempts):
        distance = GAP + ring * (GAP + size[0] * 0.5)
        steps = max(6, ring * 6)
        for step in range(steps):
            angle = (2 * math.pi * step) / steps
            cx = sx + distance * math.cos(angle)
            cy = sy + distance * math.sin(angle)
            candidate = {"x": cx, "y": cy, "width": size[0], "height": size[1]}
            if not _overlaps_any(candidate, occupied):
                return (cx, cy)
    return (sx + CW + GAP, sy)


def _overlaps_any(rect: dict, others: list[dict], gap: float = GAP) -> bool:
    for o in others:
        if not (
            rect["x"] + rect["width"] + gap <= o["x"]
            or o["x"] + o["width"] + gap <= rect["x"]
            or rect["y"] + rect["height"] + gap <= o["y"]
            or o["y"] + o["height"] + gap <= rect["y"]
        ):
            return True
    return False