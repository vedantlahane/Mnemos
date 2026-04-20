# === FILE: backend/app/services/placement.py ===

"""
Smart spatial placement engine.

Thinks like a human arranging a notebook page:
- Content flows top-to-bottom in a fixed-width column
- Related items cluster near each other
- Diagrams get breathing room
- Stickies go to the side margin
- Gaps between logical sections
- Never overlaps anything
"""

from __future__ import annotations
from app.core.config import settings

CW = settings.card_w
CH = settings.card_h
GAP = settings.card_gap
MARGIN = settings.sheet_margin
COL_W = settings.sheet_width - MARGIN * 2
COL_LEFT = MARGIN
START_Y = 60.0

# Spacing constants for human-like layout
SECTION_GAP = 100      # gap between different content types
RELATED_GAP = 30       # tighter gap for related items
DIAGRAM_PAD_TOP = 40   # extra breathing room above diagrams
DIAGRAM_PAD_BOTTOM = 40
STICKY_OFFSET_X = 20   # stickies offset slightly right


def _measure_object_height(obj: dict) -> float:
    """Get real height of a canvas object by measuring content."""
    kind = obj.get("kind")
    stored_h = float(obj.get("h") or 100)

    if kind == "text":
        content = obj.get("content") or ""
        if content.strip():
            from app.canvas.text_measure import measure_text
            w = float(obj.get("w") or COL_W)
            m = measure_text(content, font_size=16, font_family=1,
                             max_width=min(w, COL_W), max_lines=200)
            return max(m["height"] + 20, stored_h)

    return stored_h


def _center_x(item_w: float) -> float:
    """Center an item horizontally in the column."""
    if item_w >= COL_W:
        return float(COL_LEFT)
    return float(COL_LEFT + (COL_W - item_w) / 2)


def _clamp_x(x: float, item_w: float) -> float:
    return max(float(COL_LEFT), min(x, float(COL_LEFT + COL_W - item_w)))


# ══════════════════════════════════════
# Spatial index — knows where everything is
# ══════════════════════════════════════

class SpatialIndex:
    """Tracks all occupied rectangles on the canvas."""

    def __init__(self):
        self.rects: list[dict] = []

    def add(self, x: float, y: float, w: float, h: float,
            id: str = "", source: str = "", kind: str = ""):
        self.rects.append({
            "x": x, "y": y, "w": w, "h": h,
            "id": id, "source": source, "kind": kind,
        })

    def load_placements(self, placements: list[dict]):
        for p in (placements or []):
            self.add(
                float(p.get("x", 0)), float(p.get("y", 0)),
                float(p.get("w", CW)), float(p.get("h", CH)),
                id=p.get("item_id", ""), source="item",
            )

    def load_objects(self, objects: list[dict]):
        for obj in (objects or []):
            if obj.get("x") is not None and obj.get("y") is not None:
                real_h = _measure_object_height(obj)
                self.add(
                    float(obj["x"]), float(obj["y"]),
                    float(obj.get("w", 200)), real_h,
                    id=str(obj.get("id", "")), source="object",
                    kind=obj.get("kind", ""),
                )

    def load_user_elements(self, elements: list[dict]):
        for el in (elements or []):
            if el.get("isDeleted"):
                continue
            w = el.get("width", 0)
            h = el.get("height", 0)
            if w > 0 and h > 0:
                self.add(
                    float(el.get("x", 0)), float(el.get("y", 0)),
                    float(w), float(h),
                    source="user",
                )

    def overlaps(self, x: float, y: float, w: float, h: float,
                 padding: float = 8) -> bool:
        for r in self.rects:
            if (x < r["x"] + r["w"] + padding and
                x + w + padding > r["x"] and
                y < r["y"] + r["h"] + padding and
                y + h + padding > r["y"]):
                return True
        return False

    def bottom(self) -> float:
        if not self.rects:
            return START_Y
        return max(r["y"] + r["h"] for r in self.rects)

    def find_rect(self, id: str) -> dict | None:
        for r in self.rects:
            if r["id"] == id:
                return r
        return None

    def find_gap(self, width: float, height: float,
                 min_y: float = START_Y) -> dict | None:
        """Find a vertical gap big enough for the item."""
        sorted_rects = sorted(self.rects, key=lambda r: r["y"])
        x = _center_x(width)
        prev_bottom = min_y

        for rect in sorted_rects:
            if rect["y"] < min_y:
                prev_bottom = max(prev_bottom, rect["y"] + rect["h"])
                continue

            gap_top = prev_bottom + GAP
            available = rect["y"] - gap_top

            if available >= height + GAP:
                if not self.overlaps(x, gap_top, width, height):
                    return {"x": x, "y": gap_top}

            prev_bottom = max(prev_bottom, rect["y"] + rect["h"])

        return None

    def items_near(self, y: float, radius: float = 200) -> list[dict]:
        """Find items near a vertical position."""
        return [
            r for r in self.rects
            if abs(r["y"] - y) < radius and r["source"] == "item"
        ]


# ══════════════════════════════════════
# Smart placement — thinks like a human
# ══════════════════════════════════════

def find_placement(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
    user_elements: list[dict] | None = None,
    item_size: tuple[float, float] = (CW, CH),
    near_item_id: str | None = None,
) -> dict:
    """
    Find the best position for a new item.

    Strategy (like a human arranging a notebook):
    1. If related item exists, place just below it (clustering)
    2. Look for a gap between existing content (fill holes)
    3. Append at the bottom with appropriate spacing
    """
    idx = SpatialIndex()
    idx.load_placements(placements)
    idx.load_objects(objects)
    idx.load_user_elements(user_elements)

    w, h = item_size
    w = min(w, COL_W)
    x = _center_x(w)

    # Empty canvas → start at top
    if not idx.rects:
        return {"x": x, "y": START_Y}

    # Strategy 1: Place near related item
    if near_item_id:
        related = idx.find_rect(near_item_id)
        if related:
            candidate_y = related["y"] + related["h"] + RELATED_GAP
            if not idx.overlaps(x, candidate_y, w, h):
                return {"x": x, "y": candidate_y}

    # Strategy 2: Find a gap in existing content
    gap = idx.find_gap(w, h)
    if gap:
        return gap

    # Strategy 3: Append at bottom
    bottom = idx.bottom()
    return {"x": x, "y": bottom + GAP}


def find_placement_for_size(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
    user_elements: list[dict] | None = None,
    width: float = 360,
    height: float = 240,
    near_item_id: str | None = None,
) -> dict:
    """Find placement for a specific size (diagrams, text blocks)."""
    return find_placement(
        placements=placements,
        objects=objects,
        user_elements=user_elements,
        item_size=(min(width, COL_W), height),
        near_item_id=near_item_id,
    )


def find_diagram_placement(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
    user_elements: list[dict] | None = None,
    diagram_width: float = 400,
    diagram_height: float = 300,
) -> dict:
    """
    Diagrams always go BELOW all existing content with extra padding.
    Never placed in gaps — they need clear visual separation.
    """
    idx = SpatialIndex()
    idx.load_placements(placements)
    idx.load_objects(objects)
    idx.load_user_elements(user_elements)

    w = min(diagram_width, COL_W)
    x = _center_x(w)

    if not idx.rects:
        return {"x": x, "y": START_Y + 40}

    # Always below everything — diagrams are visual anchors
    bottom = idx.bottom()
    return {"x": x, "y": bottom + GAP + 40}


def sequential_layout(items: list[dict]) -> list[dict]:
    """Layout all items in a clean vertical flow."""
    placements = []
    y = START_Y
    x = _center_x(CW)
    for item in items:
        placements.append({
            "item_id": item["id"],
            "x": x, "y": y, "w": CW, "h": CH,
        })
        y += CH + GAP
    return placements


def organize_page(
    placements: list[dict] | None = None,
    objects: list[dict] | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Re-organize ALL content into a clean vertical flow.
    Like a human tidying their notebook:
    - Items in order
    - Diagrams get extra space
    - Text blocks flow naturally
    - Stickies grouped
    """
    y = START_Y
    updated_placements = []
    updated_objects = []

    # Gather all content, sorted by current y position
    all_content = []

    for p in (placements or []):
        all_content.append({
            "type": "placement",
            "data": p,
            "y": float(p.get("y", 0)),
            "h": float(p.get("h", CH)),
            "w": float(p.get("w", CW)),
            "kind": "item",
        })

    for obj in (objects or []):
        real_h = _measure_object_height(obj)
        all_content.append({
            "type": "object",
            "data": obj,
            "y": float(obj.get("y", 0)),
            "h": real_h,
            "w": float(obj.get("w", COL_W)),
            "kind": obj.get("kind", "unknown"),
        })

    all_content.sort(key=lambda c: c["y"])

    # Layout with human-like spacing
    prev_kind = None
    for content in all_content:
        w = min(content["w"], COL_W)
        h = content["h"]
        x = _center_x(w)

        # Add section gap when content type changes
        kind = content["kind"]
        if prev_kind and kind != prev_kind:
            y += SECTION_GAP - GAP  # extra gap between sections

        # Extra padding for diagrams
        if kind == "diagram":
            y += DIAGRAM_PAD_TOP

        if content["type"] == "placement":
            updated_placements.append({
                "item_id": content["data"]["item_id"],
                "x": x, "y": y, "w": w, "h": h,
            })
        else:
            updated_objects.append({
                "id": content["data"].get("id"),
                "x": x, "y": y, "w": w, "h": h,
            })

        y += h + GAP

        if kind == "diagram":
            y += DIAGRAM_PAD_BOTTOM

        prev_kind = kind

    return updated_placements, updated_objects


def get_column_bounds() -> dict:
    return {
        "left": COL_LEFT,
        "right": COL_LEFT + COL_W,
        "width": COL_W,
        "center_x": COL_LEFT + COL_W / 2,
    }