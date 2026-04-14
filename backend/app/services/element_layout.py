# === FILE: backend/app/services/element_layout.py ===
"""
Element Layout Engine — CSS-like layout for absolute-positioned canvas.

Provides:
- Text measurement for ALL elements (not just note cards)
- Flow containers (vertical/horizontal stacking)
- Auto-reflow when content changes
- Bounding box computation for everything on canvas
"""

from __future__ import annotations
import math
import logging
from typing import Optional
from dataclasses import dataclass, field

from app.services.text_layout import layout_single_text, layout_texts
from app.services.excalidraw_scene import get_font_string
from app.models.canvas_ops import Rect

logger = logging.getLogger("mnemos.layout")


# ── Measured Element ──

@dataclass
class MeasuredElement:
    """An element with known pixel bounds."""
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
        return Rect(
            x=self.x - padding,
            y=self.y - padding,
            w=self.width + padding * 2,
            h=self.height + padding * 2,
        )


# ── Text Measurement ──

def measure_text(
    text: str,
    font_size: int = 16,
    font_family: int = 1,
    max_width: float = 600,
    max_lines: int = 100,
) -> dict:
    """
    Measure text and return {wrapped_text, width, height}.
    Uses text_measure.mjs for pixel-accurate measurement.
    """
    if not text or not text.strip():
        return {"wrapped_text": "", "width": 20, "height": font_size * 1.25 + 4}

    font = get_font_string(font_size, font_family)
    line_height = font_size * 1.25
    result = layout_single_text(text, font, max_width, max_lines, line_height)

    # Ensure minimum dimensions
    result["width"] = max(result.get("width", 20), 20)
    result["height"] = max(result.get("height", line_height + 4), line_height + 4)

    return result


def measure_text_batch(requests: list[dict]) -> list[dict]:
    """
    Batch measure multiple texts. Each request:
    {text, font_size?, font_family?, max_width?, max_lines?}
    """
    layout_requests = []
    for req in requests:
        font_size = req.get("font_size", 16)
        font_family = req.get("font_family", 1)
        max_width = req.get("max_width", 600)
        max_lines = req.get("max_lines", 100)
        line_height = font_size * 1.25

        layout_requests.append({
            "text": req.get("text", ""),
            "font": get_font_string(font_size, font_family),
            "maxWidth": max_width,
            "maxLines": max_lines,
            "lineHeight": line_height,
        })

    return layout_texts(layout_requests)


# ── Measure Any Canvas Element ──

def measure_element(element: dict) -> MeasuredElement:
    """
    Take any canvas element and compute its actual bounds.
    Works for: text, rectangles, notes, stickies, composed text, etc.
    """
    el_type = element.get("type") or element.get("element_type") or "unknown"
    el_id = element.get("id", "")
    x = float(element.get("x") or element.get("position_x") or 0)
    y = float(element.get("y") or element.get("position_y") or 0)
    content = element.get("text") or element.get("content") or ""

    # If width/height are already set and non-zero, trust them
    existing_w = element.get("width")
    existing_h = element.get("height")
    if existing_w and existing_h and float(existing_w) > 10 and float(existing_h) > 10:
        return MeasuredElement(
            id=el_id, x=x, y=y,
            width=float(existing_w), height=float(existing_h),
            element_type=el_type, content=content,
        )

    # For text elements, measure the content
    if el_type == "text" and content:
        font_size = element.get("fontSize", 16)
        font_family = element.get("fontFamily", 1)
        # Estimate max_width from context or use default
        max_width = float(element.get("maxWidth") or 600)

        measurement = measure_text(
            content,
            font_size=font_size,
            font_family=font_family,
            max_width=max_width,
        )
        return MeasuredElement(
            id=el_id, x=x, y=y,
            width=measurement["width"],
            height=measurement["height"],
            element_type=el_type,
            content=measurement.get("wrapped_text", content),
        )

    # For rectangles, use stored or default dimensions
    if el_type == "rectangle":
        w = float(existing_w or 200)
        h = float(existing_h or 100)
        return MeasuredElement(
            id=el_id, x=x, y=y, width=w, height=h,
            element_type=el_type, content=content,
        )

    # Default: estimate from content length
    if content:
        # Rough estimate: 7.5px per character, 20px per line
        lines = content.split("\n")
        max_line_len = max(len(line) for line in lines) if lines else 10
        est_width = min(max(max_line_len * 7.5, 60), 600)
        est_height = max(len(lines) * 20 + 10, 30)
        return MeasuredElement(
            id=el_id, x=x, y=y,
            width=est_width, height=est_height,
            element_type=el_type, content=content,
        )

    # Fallback
    return MeasuredElement(
        id=el_id, x=x, y=y,
        width=float(existing_w or 100),
        height=float(existing_h or 50),
        element_type=el_type, content=content,
    )


def measure_scene_elements(elements: list[dict]) -> list[MeasuredElement]:
    """Measure all elements in a scene."""
    # Batch measure all text elements for efficiency
    text_elements = []
    text_indices = []
    non_text_results = {}

    for i, el in enumerate(elements):
        el_type = el.get("type") or el.get("element_type") or ""
        if el_type == "text" and (el.get("text") or el.get("content")):
            text_elements.append({
                "text": el.get("text") or el.get("content") or "",
                "font_size": el.get("fontSize", 16),
                "font_family": el.get("fontFamily", 1),
                "max_width": el.get("maxWidth") or 600,
                "max_lines": 100,
            })
            text_indices.append(i)
        else:
            non_text_results[i] = measure_element(el)

    # Batch measure texts
    if text_elements:
        text_measurements = measure_text_batch(text_elements)
    else:
        text_measurements = []

    # Combine results
    results = []
    text_idx = 0
    for i, el in enumerate(elements):
        if i in non_text_results:
            results.append(non_text_results[i])
        elif text_idx < len(text_measurements):
            m = text_measurements[text_idx]
            text_idx += 1
            results.append(MeasuredElement(
                id=el.get("id", ""),
                x=float(el.get("x") or el.get("position_x") or 0),
                y=float(el.get("y") or el.get("position_y") or 0),
                width=max(m.get("width", 100), 20),
                height=max(m.get("height", 30), 20),
                element_type="text",
                content=m.get("wrapped_text", el.get("text", "")),
            ))
        else:
            results.append(measure_element(el))

    return results


# ── Layout Containers ──

class FlowLayout:
    """
    Stack elements vertically or horizontally with gaps.
    Like CSS flexbox for canvas.
    """

    def __init__(
        self,
        direction: str = "vertical",  # "vertical" | "horizontal"
        gap: float = 16,
        padding: float = 12,
        align: str = "start",  # "start" | "center" | "end"
        max_width: float = 600,
    ):
        self.direction = direction
        self.gap = gap
        self.padding = padding
        self.align = align
        self.max_width = max_width

    def layout(
        self,
        items: list[MeasuredElement],
        start_x: float = 0,
        start_y: float = 0,
    ) -> tuple[list[MeasuredElement], MeasuredElement]:
        """
        Position items in flow. Returns (positioned_items, container_bounds).
        """
        if not items:
            return [], MeasuredElement(
                id="container", x=start_x, y=start_y,
                width=0, height=0, element_type="container",
            )

        positioned = []
        cursor_x = start_x + self.padding
        cursor_y = start_y + self.padding

        if self.direction == "vertical":
            max_item_width = 0
            for item in items:
                # Constrain width
                item_w = min(item.width, self.max_width - self.padding * 2)

                # Horizontal alignment
                if self.align == "center":
                    item_x = cursor_x + (self.max_width - self.padding * 2 - item_w) / 2
                elif self.align == "end":
                    item_x = cursor_x + (self.max_width - self.padding * 2 - item_w)
                else:
                    item_x = cursor_x

                positioned.append(MeasuredElement(
                    id=item.id, x=item_x, y=cursor_y,
                    width=item_w, height=item.height,
                    element_type=item.element_type,
                    content=item.content,
                    metadata=item.metadata,
                ))

                cursor_y += item.height + self.gap
                max_item_width = max(max_item_width, item_w)

            total_height = cursor_y - start_y - self.gap + self.padding
            total_width = max_item_width + self.padding * 2

        else:  # horizontal
            max_item_height = 0
            for item in items:
                # Vertical alignment
                if self.align == "center":
                    item_y = cursor_y  # will adjust after knowing max height
                elif self.align == "end":
                    item_y = cursor_y
                else:
                    item_y = cursor_y

                positioned.append(MeasuredElement(
                    id=item.id, x=cursor_x, y=item_y,
                    width=item.width, height=item.height,
                    element_type=item.element_type,
                    content=item.content,
                    metadata=item.metadata,
                ))

                cursor_x += item.width + self.gap
                max_item_height = max(max_item_height, item.height)

            # Second pass: vertical alignment
            if self.align == "center":
                for p in positioned:
                    p.y = start_y + self.padding + (max_item_height - p.height) / 2
            elif self.align == "end":
                for p in positioned:
                    p.y = start_y + self.padding + max_item_height - p.height

            total_width = cursor_x - start_x - self.gap + self.padding
            total_height = max_item_height + self.padding * 2

        container = MeasuredElement(
            id="container", x=start_x, y=start_y,
            width=total_width, height=total_height,
            element_type="container",
            children=positioned,
        )

        return positioned, container


class WrapLayout:
    """
    Wrap elements into rows (like CSS flex-wrap).
    When a row is full, start a new one.
    """

    def __init__(
        self,
        max_width: float = 800,
        gap_x: float = 16,
        gap_y: float = 16,
        padding: float = 12,
    ):
        self.max_width = max_width
        self.gap_x = gap_x
        self.gap_y = gap_y
        self.padding = padding

    def layout(
        self,
        items: list[MeasuredElement],
        start_x: float = 0,
        start_y: float = 0,
    ) -> tuple[list[MeasuredElement], MeasuredElement]:
        if not items:
            return [], MeasuredElement(
                id="container", x=start_x, y=start_y,
                width=0, height=0, element_type="container",
            )

        positioned = []
        cursor_x = start_x + self.padding
        cursor_y = start_y + self.padding
        row_height = 0
        max_row_width = 0
        usable_width = self.max_width - self.padding * 2

        for item in items:
            # Would this item exceed the row width?
            if cursor_x - start_x - self.padding + item.width > usable_width and cursor_x > start_x + self.padding:
                # Wrap to next row
                cursor_y += row_height + self.gap_y
                cursor_x = start_x + self.padding
                row_height = 0

            positioned.append(MeasuredElement(
                id=item.id, x=cursor_x, y=cursor_y,
                width=item.width, height=item.height,
                element_type=item.element_type,
                content=item.content,
                metadata=item.metadata,
            ))

            cursor_x += item.width + self.gap_x
            row_height = max(row_height, item.height)
            max_row_width = max(max_row_width, cursor_x - start_x - self.gap_x)

        total_height = cursor_y + row_height + self.padding - start_y
        total_width = max(max_row_width + self.padding, 100)

        container = MeasuredElement(
            id="container", x=start_x, y=start_y,
            width=total_width, height=total_height,
            element_type="container",
            children=positioned,
        )

        return positioned, container


class GridLayout:
    """
    Fixed column grid layout.
    """

    def __init__(
        self,
        columns: int = 3,
        gap_x: float = 60,
        gap_y: float = 40,
        cell_width: float = 360,
        cell_height: Optional[float] = None,  # None = auto from content
        padding: float = 12,
    ):
        self.columns = columns
        self.gap_x = gap_x
        self.gap_y = gap_y
        self.cell_width = cell_width
        self.cell_height = cell_height
        self.padding = padding

    def layout(
        self,
        items: list[MeasuredElement],
        start_x: float = 0,
        start_y: float = 0,
    ) -> tuple[list[MeasuredElement], MeasuredElement]:
        if not items:
            return [], MeasuredElement(
                id="container", x=start_x, y=start_y,
                width=0, height=0, element_type="container",
            )

        positioned = []
        rows: list[list[MeasuredElement]] = [[]]

        # Distribute into grid
        for i, item in enumerate(items):
            col = i % self.columns
            row = i // self.columns
            while row >= len(rows):
                rows.append([])
            rows[row].append(item)

        # Position each cell
        cursor_y = start_y + self.padding
        for row_items in rows:
            row_height = 0
            for col, item in enumerate(row_items):
                x = start_x + self.padding + col * (self.cell_width + self.gap_x)
                y = cursor_y

                actual_h = self.cell_height if self.cell_height else item.height
                row_height = max(row_height, actual_h)

                positioned.append(MeasuredElement(
                    id=item.id, x=x, y=y,
                    width=min(item.width, self.cell_width),
                    height=actual_h,
                    element_type=item.element_type,
                    content=item.content,
                    metadata=item.metadata,
                ))

            cursor_y += row_height + self.gap_y

        total_width = self.padding * 2 + self.columns * self.cell_width + (self.columns - 1) * self.gap_x
        total_height = cursor_y - start_y - self.gap_y + self.padding

        container = MeasuredElement(
            id="container", x=start_x, y=start_y,
            width=total_width, height=total_height,
            element_type="container",
            children=positioned,
        )

        return positioned, container


# ── Composed Content Layout ──

def layout_composed_content(
    content: str,
    x: float,
    y: float,
    max_width: float = 400,
    font_size: int = 16,
    font_family: int = 1,
    title: str = None,
) -> list[MeasuredElement]:
    """
    Layout a composed text block with optional title.
    Measures text, wraps properly, returns positioned elements with real bounds.
    """
    elements = []

    if title:
        title_measurement = measure_text(
            title, font_size=font_size + 4, font_family=font_family,
            max_width=max_width, max_lines=2,
        )
        elements.append(MeasuredElement(
            id="title", x=x, y=y,
            width=title_measurement["width"],
            height=title_measurement["height"],
            element_type="text",
            content=title_measurement["wrapped_text"],
            metadata={"role": "title", "fontSize": font_size + 4},
        ))
        y += title_measurement["height"] + 12

    # Measure body text
    body_measurement = measure_text(
        content, font_size=font_size, font_family=font_family,
        max_width=max_width, max_lines=200,
    )
    elements.append(MeasuredElement(
        id="body", x=x, y=y,
        width=body_measurement["width"],
        height=body_measurement["height"],
        element_type="text",
        content=body_measurement["wrapped_text"],
        metadata={"role": "body", "fontSize": font_size},
    ))

    return elements


def layout_diagram_topology(
    topology: dict,
    base_x: float,
    base_y: float,
) -> tuple[list[MeasuredElement], list[dict]]:
    """
    Layout a diagram topology with measured text labels.
    Returns (positioned_elements, arrow_connections).
    """
    layout_type = topology.get("layout_type", "flow")
    topo_elements = topology.get("elements", [])
    connections = topology.get("connections", [])

    if not topo_elements:
        return [], []

    # First pass: measure all labels
    measured = []
    for el in topo_elements:
        label = el.get("label", "")
        label_measurement = measure_text(
            label, font_size=16, font_family=1,
            max_width=float(el.get("width", 200)) - 24,
            max_lines=3,
        )
        # Element dimensions are at least the specified size or the measured text + padding
        el_width = max(float(el.get("width", 200)), label_measurement["width"] + 24)
        el_height = max(float(el.get("height", 60)), label_measurement["height"] + 20)

        measured.append(MeasuredElement(
            id=el["id"],
            x=0, y=0,  # will be positioned
            width=el_width,
            height=el_height,
            element_type=el.get("type", "box"),
            content=label_measurement["wrapped_text"],
            metadata={
                "style": el.get("style", "default"),
                "label_width": label_measurement["width"],
                "label_height": label_measurement["height"],
            },
        ))

    # Second pass: layout based on type
    if layout_type == "flow":
        positioned = _layout_flow(measured, base_x, base_y)
    elif layout_type == "mindmap":
        positioned = _layout_mindmap(measured, base_x, base_y)
    elif layout_type == "list":
        positioned = _layout_list(measured, base_x, base_y)
    elif layout_type == "comparison":
        positioned = _layout_comparison(measured, base_x, base_y)
    elif layout_type == "timeline":
        positioned = _layout_timeline(measured, base_x, base_y)
    else:
        positioned = _layout_grid(measured, base_x, base_y)

    # Build arrow data with actual positions
    pos_map = {p.id: p for p in positioned}
    arrows = []
    for conn in connections:
        from_el = pos_map.get(conn.get("from"))
        to_el = pos_map.get(conn.get("to"))
        if from_el and to_el:
            arrows.append({
                "from_id": conn["from"],
                "to_id": conn["to"],
                "from_x": from_el.center_x,
                "from_y": from_el.bottom,
                "to_x": to_el.center_x,
                "to_y": to_el.y,
                "label": conn.get("label"),
                "style": conn.get("style", "solid"),
            })

    return positioned, arrows


# ── Layout algorithms ──

def _layout_flow(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    gap = 80
    # Center horizontally, stack vertically
    max_w = max(el.width for el in items) if items else 200
    cursor_y = by
    result = []
    for item in items:
        item.x = bx + (max_w - item.width) / 2
        item.y = cursor_y
        result.append(item)
        cursor_y += item.height + gap
    return result


def _layout_mindmap(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    if not items:
        return []

    # Center node
    center = items[0]
    center.x = bx + 250 - center.width / 2
    center.y = by + 250 - center.height / 2
    result = [center]

    if len(items) > 1:
        branches = items[1:]
        radius = 280
        for i, item in enumerate(branches):
            angle = (i / len(branches)) * 2 * math.pi - math.pi / 2
            item.x = bx + 250 + radius * math.cos(angle) - item.width / 2
            item.y = by + 250 + radius * math.sin(angle) - item.height / 2
            result.append(item)

    return result


def _layout_list(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    gap = 20
    cursor_y = by
    result = []
    for item in items:
        item.x = bx
        item.y = cursor_y
        result.append(item)
        cursor_y += item.height + gap
    return result


def _layout_comparison(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    gap_x = 80
    gap_y = 60
    result = []
    for i, item in enumerate(items):
        col = i % 2
        row = i // 2
        item.x = bx + col * (item.width + gap_x)
        item.y = by + row * (item.height + gap_y)
        result.append(item)
    return result


def _layout_timeline(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    gap = 60
    cursor_x = bx
    result = []
    for item in items:
        item.x = cursor_x
        item.y = by
        result.append(item)
        cursor_x += item.width + gap
    return result


def _layout_grid(items: list[MeasuredElement], bx: float, by: float) -> list[MeasuredElement]:
    cols = max(1, int(math.ceil(math.sqrt(len(items)))))
    gap_x = 60
    gap_y = 60
    result = []
    for i, item in enumerate(items):
        col = i % cols
        row = i // cols
        item.x = bx + col * (item.width + gap_x)
        item.y = by + row * (item.height + gap_y)
        result.append(item)
    return result