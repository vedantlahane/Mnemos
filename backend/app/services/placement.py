# === FILE: backend/app/services/placement.py ===

"""
Spatial placement.
Pure geometry — no DB calls, no LLM calls.
"""

from __future__ import annotations
from app.core.config import settings

CW = settings.card_w
CH = settings.card_h
GAP = settings.card_gap


def find_placement(
    existing_placements: list[dict],
    size: tuple[float, float] = (CW, CH),
) -> dict:
    """Find next available position given existing placements."""
    if not existing_placements:
        return {"x": 100.0, "y": 100.0}

    occupied = [
        {"x": p["x"], "y": p["y"],
         "w": p.get("w", size[0]), "h": p.get("h", size[1])}
        for p in existing_placements
    ]
    max_y = max(o["y"] + o["h"] for o in occupied)
    return {"x": 100.0, "y": max_y + GAP}


def sequential_layout(items: list[dict]) -> list[dict]:
    """Layout all items in a clean vertical flow. Returns placement dicts."""
    placements = []
    y = 100.0
    for item in items:
        placements.append({
            "item_id": item["id"],
            "x": 100.0, "y": y,
            "w": CW, "h": CH,
        })
        y += CH + GAP
    return placements