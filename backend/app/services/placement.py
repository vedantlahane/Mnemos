# === FILE: backend/app/services/placement.py ===

"""
Column-constrained placement engine.

All content lives within a fixed-width vertical column — like a document.
The canvas is an infinite vertical scroll with a fixed horizontal boundary.

Coordinate system:
  x: [COLUMN_LEFT, COLUMN_LEFT + COLUMN_WIDTH]
  y: 0 → ∞ (vertical, grows downward)
"""

from __future__ import annotations
from app.core.config import settings

CW = settings.card_w
CH = settings.card_h
GAP = settings.card_gap
COLUMN_LEFT = settings.sheet_margin
COLUMN_WIDTH = settings.sheet_width - settings.sheet_margin * 2
START_Y = 80.0


def _measure_object_height(obj: dict) -> float:
    """
    Get the REAL height of a canvas object by measuring its content.
    Critical for text objects where stored h=300 is just a guess.
    """
    kind = obj.get("kind")
    stored_h = float(obj.get("h") or 100)

    if kind == "text":
        content = obj.get("content") or ""
        if content.strip():
            from app.canvas.text_measure import measure_text
            w = float(obj.get("w") or COLUMN_WIDTH)
            m = measure_text(
                content,
                font_size=16,
                font_family=1,
                max_width=min(w, COLUMN_WIDTH),
                max_lines=200,
            )
            # Use measured height, but never less than stored height
            # (stored height might include padding)
            return max(m["height"] + 20, stored_h)  # 20px padding

    if kind == "diagram":
        # Diagrams store their actual bbox, trust it
        return stored_h

    return stored_h


def _gather_rects(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
    user_elements: list[dict] | None = None,
) -> list[dict]:
    """Collect all occupied rectangles on the canvas."""
    rects: list[dict] = []

    for p in (placements or []):
        rects.append({
            "x": float(p.get("x", 0)),
            "y": float(p.get("y", 0)),
            "w": float(p.get("w", CW)),
            "h": float(p.get("h", CH)),
            "id": p.get("item_id"),
            "source": "placement",
        })

    for obj in (objects or []):
        if obj.get("x") is not None and obj.get("y") is not None:
            # Use MEASURED height for text objects — the stored value is unreliable
            real_h = _measure_object_height(obj)
            rects.append({
                "x": float(obj["x"]),
                "y": float(obj["y"]),
                "w": float(obj.get("w", 200)),
                "h": real_h,
                "id": str(obj.get("id", "")),
                "source": "object",
                "kind": obj.get("kind"),
            })

    for el in (user_elements or []):
        if el.get("isDeleted"):
            continue
        w = el.get("width", 0)
        h = el.get("height", 0)
        if w > 0 and h > 0:
            rects.append({
                "x": float(el.get("x", 0)),
                "y": float(el.get("y", 0)),
                "w": float(w),
                "h": float(h),
                "source": "user",
            })

    return rects


def _center_x(item_w: float) -> float:
    """Center an item horizontally within the column."""
    if item_w >= COLUMN_WIDTH:
        return float(COLUMN_LEFT)
    return float(COLUMN_LEFT + (COLUMN_WIDTH - item_w) / 2)


def _clamp_x(x: float, item_w: float) -> float:
    """Ensure item stays within column bounds."""
    left = float(COLUMN_LEFT)
    right = float(COLUMN_LEFT + COLUMN_WIDTH - item_w)
    return max(left, min(x, right))


def _overlaps(
    x: float, y: float, w: float, h: float,
    rects: list[dict], padding: float = 10,
) -> bool:
    """Check if a rectangle overlaps any existing rectangle."""
    for r in rects:
        if (x < r["x"] + r["w"] + padding and
            x + w + padding > r["x"] and
            y < r["y"] + r["h"] + padding and
            y + h + padding > r["y"]):
            return True
    return False


def _canvas_bottom(rects: list[dict]) -> float:
    """Get the Y coordinate of the bottom of all content."""
    if not rects:
        return START_Y
    return max(r["y"] + r["h"] for r in rects)


def find_placement(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
    user_elements: list[dict] | None = None,
    item_size: tuple[float, float] = (CW, CH),
    near_item_id: str | None = None,
) -> dict:
    """
    Find the best position for a new item within the content column.

    Strategy:
    1. If near_item_id given, try placing just below that item
    2. Try to find a gap between existing items (only if gap is real)
    3. Fall back to appending at the bottom (ALWAYS safe)
    """
    rects = _gather_rects(placements, objects, user_elements)
    item_w, item_h = item_size
    x = _center_x(item_w)

    if not rects:
        return {"x": x, "y": START_Y}

    # Strategy 1: Place near a related item
    if near_item_id:
        related = next((r for r in rects if r.get("id") == near_item_id), None)
        if related:
            candidate_y = related["y"] + related["h"] + GAP
            if not _overlaps(x, candidate_y, item_w, item_h, rects):
                return {"x": x, "y": candidate_y}

    # Strategy 2: Find a vertical gap (only real gaps, verified with overlap check)
    sorted_rects = sorted(rects, key=lambda r: r["y"])
    prev_bottom = START_Y

    for rect in sorted_rects:
        gap_top = prev_bottom + GAP
        gap_height = rect["y"] - gap_top

        if gap_height >= item_h + GAP:
            if not _overlaps(x, gap_top, item_w, item_h, rects):
                return {"x": x, "y": gap_top}

        prev_bottom = max(prev_bottom, rect["y"] + rect["h"])

    # Strategy 3: Append at the bottom — always safe, never overlaps
    bottom = _canvas_bottom(rects)
    return {"x": x, "y": bottom + GAP}


def find_placement_for_size(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
    user_elements: list[dict] | None = None,
    width: float = 360,
    height: float = 240,
    near_item_id: str | None = None,
) -> dict:
    """Same as find_placement but with explicit width/height."""
    return find_placement(
        placements=placements,
        objects=objects,
        user_elements=user_elements,
        item_size=(min(width, COLUMN_WIDTH), height),
        near_item_id=near_item_id,
    )


def sequential_layout(items: list[dict]) -> list[dict]:
    """Layout all items in a clean vertical flow within the column."""
    placements = []
    y = START_Y
    x = _center_x(CW)
    for item in items:
        placements.append({
            "item_id": item["id"],
            "x": x, "y": y,
            "w": CW, "h": CH,
        })
        y += CH + GAP
    return placements


def organize_page(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Re-organize ALL content on the page into a clean vertical flow.
    Returns (updated_placements, updated_objects) with new positions.
    
    Order: items first (by creation), then objects (by creation).
    Everything centered in the column.
    """
    y = START_Y
    updated_placements = []
    updated_objects = []

    # Sort all content by y position (preserve visual order)
    all_content = []

    for p in (placements or []):
        all_content.append({
            "type": "placement",
            "data": p,
            "y": float(p.get("y", 0)),
            "h": float(p.get("h", CH)),
            "w": float(p.get("w", CW)),
        })

    for obj in (objects or []):
        real_h = _measure_object_height(obj)
        all_content.append({
            "type": "object",
            "data": obj,
            "y": float(obj.get("y", 0)),
            "h": real_h,
            "w": float(obj.get("w", COLUMN_WIDTH)),
        })

    # Sort by current y position to maintain visual order
    all_content.sort(key=lambda c: c["y"])

    # Re-layout vertically
    for content in all_content:
        w = content["w"]
        h = content["h"]
        x = _center_x(min(w, COLUMN_WIDTH))

        if content["type"] == "placement":
            updated_placements.append({
                "item_id": content["data"]["item_id"],
                "x": x, "y": y,
                "w": w, "h": h,
            })
        else:
            updated_objects.append({
                "id": content["data"].get("id"),
                "x": x, "y": y,
                "w": w, "h": h,
            })

        y += h + GAP

    return updated_placements, updated_objects


def get_column_bounds() -> dict:
    """Return the content column boundaries."""
    return {
        "left": COLUMN_LEFT,
        "right": COLUMN_LEFT + COLUMN_WIDTH,
        "width": COLUMN_WIDTH,
        "center_x": COLUMN_LEFT + COLUMN_WIDTH / 2,
    }