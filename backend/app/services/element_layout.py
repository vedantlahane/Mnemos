# === FILE: backend/app/services/element_layout.py ===
"""
Element Layout Engine — text measurement and CSS-like layout.
"""

from __future__ import annotations
import math
import logging
from dataclasses import dataclass, field
from typing import Optional

from app.services.text_layout import layout_single_text, layout_texts
from app.services.scene_manager import get_font_string
from app.models.canvas_ops import Rect

logger = logging.getLogger("mnemos.layout")


@dataclass
class MeasuredElement:
    id: str
    x: float
    y: float
    width: float
    height: float
    element_type: str = "unknown"
    content: str = ""
    children: list["MeasuredElement"] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    def to_rect(self, padding: float = 0) -> Rect:
        return Rect(x=self.x - padding, y=self.y - padding, w=self.width + padding * 2, h=self.height + padding * 2)


def measure_text(text: str, font_size: int = 16, font_family: int = 1, max_width: float = 600, max_lines: int = 100) -> dict:
    if not text or not text.strip():
        return {"wrapped_text": "", "width": 20, "height": font_size * 1.25 + 4}
    font = get_font_string(font_size, font_family)
    line_height = font_size * 1.25
    result = layout_single_text(text, font, max_width, max_lines, line_height)
    result["width"] = max(result.get("width", 20), 20)
    result["height"] = max(result.get("height", line_height + 4), line_height + 4)
    return result


def measure_text_batch(requests: list[dict]) -> list[dict]:
    layout_requests = []
    for req in requests:
        fs = req.get("font_size", 16)
        ff = req.get("font_family", 1)
        mw = req.get("max_width", 600)
        ml = req.get("max_lines", 100)
        layout_requests.append({
            "text": req.get("text", ""), "font": get_font_string(fs, ff),
            "maxWidth": mw, "maxLines": ml, "lineHeight": fs * 1.25,
        })
    return layout_texts(layout_requests)


def layout_diagram_topology(topology: dict, base_x: float, base_y: float) -> tuple[list[MeasuredElement], list[dict]]:
    topo_elements = topology.get("elements", [])
    connections = topology.get("connections", [])
    if not topo_elements:
        return [], []

    measured = []
    for el in topo_elements:
        label = el.get("label", "")
        label_m = measure_text(label, font_size=16, font_family=1, max_width=float(el.get("width", 200)) - 24, max_lines=3)
        el_w = max(float(el.get("width", 200)), label_m["width"] + 24)
        el_h = max(float(el.get("height", 60)), label_m["height"] + 20)
        measured.append(MeasuredElement(
            id=el["id"], x=0, y=0, width=el_w, height=el_h,
            element_type=el.get("type", "box"), content=label_m["wrapped_text"],
            metadata={"style": el.get("style", "default"), "label_width": label_m["width"], "label_height": label_m["height"]},
        ))

    layout_type = topology.get("layout_type", "flow")
    layout_fn = {
        "flow": _layout_flow, "mindmap": _layout_mindmap, "list": _layout_list,
        "comparison": _layout_comparison, "timeline": _layout_timeline,
    }.get(layout_type, _layout_grid)
    positioned = layout_fn(measured, base_x, base_y)

    pos_map = {p.id: p for p in positioned}
    arrows = []
    for conn in connections:
        from_el = pos_map.get(conn.get("from"))
        to_el = pos_map.get(conn.get("to"))
        if from_el and to_el:
            arrows.append({
                "from_id": conn["from"], "to_id": conn["to"],
                "from_x": from_el.center_x, "from_y": from_el.bottom,
                "to_x": to_el.center_x, "to_y": to_el.y,
                "label": conn.get("label"), "style": conn.get("style", "solid"),
            })
    return positioned, arrows


def _layout_flow(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    gap = 80
    max_w = max(el.width for el in items) if items else 200
    cursor_y = by
    for item in items:
        item.x = bx + (max_w - item.width) / 2
        item.y = cursor_y
        cursor_y += item.height + gap
    return items


def _layout_mindmap(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    if not items:
        return []
    center = items[0]
    center.x = bx + 250 - center.width / 2
    center.y = by + 250 - center.height / 2
    if len(items) > 1:
        branches = items[1:]
        radius = 280
        for i, item in enumerate(branches):
            angle = (i / len(branches)) * 2 * math.pi - math.pi / 2
            item.x = bx + 250 + radius * math.cos(angle) - item.width / 2
            item.y = by + 250 + radius * math.sin(angle) - item.height / 2
    return items


def _layout_list(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    cursor_y = by
    for item in items:
        item.x = bx
        item.y = cursor_y
        cursor_y += item.height + 20
    return items


def _layout_comparison(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    for i, item in enumerate(items):
        col = i % 2
        row = i // 2
        item.x = bx + col * (item.width + 80)
        item.y = by + row * (item.height + 60)
    return items


def _layout_timeline(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    cursor_x = bx
    for item in items:
        item.x = cursor_x
        item.y = by
        cursor_x += item.width + 60
    return items


def _layout_grid(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    cols = max(1, int(math.ceil(math.sqrt(len(items)))))
    for i, item in enumerate(items):
        col = i % cols
        row = i // cols
        item.x = bx + col * (item.width + 60)
        item.y = by + row * (item.height + 60)
    return items