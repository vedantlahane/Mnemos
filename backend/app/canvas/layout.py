# === FILE: backend/app/canvas/layout.py ===

"""
Diagram layout engine.
Takes topology (nodes + edges) → produces positioned elements.
Fits within sheet width constraint.
"""

from __future__ import annotations
import math
from typing import Optional

from app.canvas.text_measure import measure_text
from app.canvas.factory import ElementFactory
from app.core.config import settings

# Minimum gap between arrow endpoint and node edge
ARROW_GAP = 12


def layout_diagram(
    topology: dict,
    base_x: float,
    base_y: float,
    factory: ElementFactory,
    max_width: float = None,
) -> tuple[list[dict], dict]:
    """
    Layout a diagram from LLM topology.
    Returns (elements, bounding_box).
    """
    max_w = max_width or (settings.sheet_width - settings.sheet_margin * 2)
    nodes = topology.get("elements", [])
    connections = topology.get("connections", [])
    layout_type = topology.get("layout_type", "flow")

    if not nodes:
        return [], {"x": base_x, "y": base_y, "width": 0, "height": 0}

    # ── Measure all node labels ──
    max_node_w = max_w * 0.85  # leave room for arrows/spacing

    measured = []
    for node in nodes:
        label = node.get("label", "")
        requested_w = min(float(node.get("width", 200)), max_node_w)
        m = measure_text(label, font_size=14, font_family=1,
                         max_width=requested_w - 24, max_lines=3)
        w = min(max(requested_w, m["width"] + 32), max_node_w)
        h = max(float(node.get("height", 60)), m["height"] + 24)
        measured.append({
            "id": node["id"],
            "label": label,
            "style": node.get("style", "default"),
            "width": w,
            "height": h,
        })

    # ── Force vertical flow for narrow columns ──
    if max_w < 500 and layout_type in ("timeline", "comparison", "mindmap"):
        layout_type = "flow"

    # ── Run layout ──
    positions = _run_layout(layout_type, measured, max_w)

    # ── Compute current total width ──
    if not positions:
        positions = _layout_flow(measured, 60, max_w)

    total_w = _total_width(positions)

    # ── Scale down if still too wide ──
    if total_w > max_w and total_w > 0:
        scale = max_w / total_w
        for p in positions:
            p["x"] *= scale
            p["y"] *= scale
            p["width"] *= scale
            p["height"] *= scale

    # ── Shift to base_x, base_y ──
    if positions:
        min_x = min(p["x"] for p in positions)
        min_y = min(p["y"] for p in positions)
        for p in positions:
            p["x"] += base_x - min_x
            p["y"] += base_y - min_y

    # ── Build Excalidraw elements ──
    diagram_id = f"diagram-{nodes[0]['id'][:8]}"
    group_id = f"diag-group-{diagram_id}"
    all_elements = []
    pos_map = {p["id"]: p for p in positions}

    for p in positions:
        node_els = factory.diagram_node(
            label=p["label"],
            x=p["x"], y=p["y"],
            width=p["width"], height=p["height"],
            node_id=p["id"],
            style=p["style"],
            group_id=group_id,
            diagram_id=diagram_id,
        )
        all_elements.extend(node_els)

    # ── Arrows with proper gap ──
    for conn in connections:
        from_p = pos_map.get(conn.get("from"))
        to_p = pos_map.get(conn.get("to"))
        if not from_p or not to_p:
            continue

        sx, sy, ex, ey = _best_arrow_points(from_p, to_p)
        style = conn.get("style", "solid")

        arrow_el = factory.arrow(
            sx, sy, ex, ey,
            id=f"arrow-{conn['from']}-{conn['to']}",
            stroke_color=factory._colors["arrow"],
            stroke_width=2,
            stroke_style=style,
            group_ids=[group_id],
            custom_data={"type": "diagram-arrow", "diagramId": diagram_id},
        )

        # Bind to node rects
        from_rect = next((e for e in all_elements
                          if e.get("id") == f"{conn['from']}-rect"), None)
        to_rect = next((e for e in all_elements
                        if e.get("id") == f"{conn['to']}-rect"), None)
        if from_rect and to_rect:
            factory.bind_arrow(arrow_el, start_el=from_rect, end_el=to_rect)

        all_elements.append(arrow_el)

        # Edge label — offset to side so it doesn't overlap the arrow
        if conn.get("label"):
            mid_x = (sx + ex) / 2 + 8
            mid_y = (sy + ey) / 2 - 14
            label_el = factory.text(
                conn["label"], mid_x, mid_y,
                font_size=11, font_family=1, max_width=120,
                color=factory._colors["muted"],
                group_ids=[group_id],
                custom_data={"type": "diagram-edge-label",
                             "diagramId": diagram_id},
            )
            all_elements.append(label_el)

    # ── Bounding box ──
    bbox = _compute_bbox(positions)
    return all_elements, bbox


# ══════════════════════════════════════════
# Layout runner
# ══════════════════════════════════════════

def _run_layout(layout_type: str, nodes: list[dict],
                max_w: float) -> list[dict]:
    """Try the requested layout, fall back to flow."""
    fn_map = {
        "flow": _layout_flow,
        "mindmap": _layout_mindmap,
        "list": _layout_list,
        "comparison": _layout_comparison,
        "timeline": _layout_timeline,
    }

    primary_fn = fn_map.get(layout_type, _layout_flow)

    # Try primary with normal spacing
    result = primary_fn(nodes, 70, max_w)
    if _total_width(result) <= max_w:
        return result

    # Try primary with tight spacing
    result = primary_fn(nodes, 40, max_w)
    if _total_width(result) <= max_w:
        return result

    # Fall back to flow (always fits in width)
    if primary_fn != _layout_flow:
        result = _layout_flow(nodes, 50, max_w)
        if _total_width(result) <= max_w:
            return result

    # Last resort: grid
    return _layout_grid(nodes, 30, max_w)


def _total_width(positions: list[dict]) -> float:
    if not positions:
        return 0
    return (max(p["x"] + p["width"] for p in positions)
            - min(p["x"] for p in positions))


def _compute_bbox(positions: list[dict]) -> dict:
    if not positions:
        return {"x": 0, "y": 0, "width": 0, "height": 0}
    min_x = min(p["x"] for p in positions)
    min_y = min(p["y"] for p in positions)
    max_x = max(p["x"] + p["width"] for p in positions)
    max_y = max(p["y"] + p["height"] for p in positions)
    return {
        "x": min_x, "y": min_y,
        "width": max_x - min_x, "height": max_y - min_y,
    }


# ══════════════════════════════════════════
# Layout algorithms
# ══════════════════════════════════════════

def _layout_flow(nodes: list[dict], spacing: float,
                 max_w: float = 800) -> list[dict]:
    """Vertical flow — nodes stacked top-to-bottom, centered."""
    if not nodes:
        return []

    result = []
    cursor_y = 0.0

    for n in nodes:
        # Center each node horizontally
        x = (max_w - n["width"]) / 2
        result.append({**n, "x": max(0, x), "y": cursor_y})
        cursor_y += n["height"] + spacing

    return result


def _layout_mindmap(nodes: list[dict], spacing: float,
                    max_w: float = 800) -> list[dict]:
    """Center node with branches radiating out."""
    if not nodes:
        return []

    result = []
    center = nodes[0]

    # Center node
    cx = max_w / 2
    cy = 200.0
    result.append({
        **center,
        "x": cx - center["width"] / 2,
        "y": cy - center["height"] / 2,
    })

    if len(nodes) > 1:
        branches = nodes[1:]
        # Radius scales with node count but stays within max_w
        radius = min(180 + spacing, (max_w - 200) / 2)
        for i, n in enumerate(branches):
            angle = (i / len(branches)) * 2 * math.pi - math.pi / 2
            nx = cx + radius * math.cos(angle) - n["width"] / 2
            ny = cy + radius * math.sin(angle) - n["height"] / 2
            # Clamp x to stay within bounds
            nx = max(0, min(nx, max_w - n["width"]))
            result.append({**n, "x": nx, "y": ny})

    return result


def _layout_list(nodes: list[dict], spacing: float,
                 max_w: float = 800) -> list[dict]:
    """Left-aligned vertical list with tighter spacing."""
    cursor_y = 0.0
    result = []
    indent = 20.0
    for n in nodes:
        result.append({**n, "x": indent, "y": cursor_y})
        cursor_y += n["height"] + spacing * 0.5
    return result


def _layout_comparison(nodes: list[dict], spacing: float,
                       max_w: float = 800) -> list[dict]:
    """Two-column layout for comparisons."""
    result = []
    col_w = (max_w - spacing) / 2

    for i, n in enumerate(nodes):
        col = i % 2
        row = i // 2
        # Clamp node width to column
        node_w = min(n["width"], col_w)
        x = col * (col_w + spacing) + (col_w - node_w) / 2
        y = row * (n["height"] + spacing)
        result.append({**n, "x": x, "y": y, "width": node_w})

    return result


def _layout_timeline(nodes: list[dict], spacing: float,
                     max_w: float = 800) -> list[dict]:
    """Horizontal timeline — falls back to flow if too many nodes."""
    # If too many nodes to fit horizontally, use flow
    total_w = sum(n["width"] for n in nodes) + spacing * (len(nodes) - 1)
    if total_w > max_w * 1.5:
        return _layout_flow(nodes, spacing, max_w)

    cursor_x = 0.0
    max_h = max(n["height"] for n in nodes) if nodes else 60
    result = []
    for n in nodes:
        result.append({**n, "x": cursor_x, "y": (max_h - n["height"]) / 2})
        cursor_x += n["width"] + spacing
    return result


def _layout_grid(nodes: list[dict], spacing: float,
                 max_w: float = 800) -> list[dict]:
    """Grid layout that respects max width."""
    if not nodes:
        return []

    # Compute how many columns fit
    avg_w = sum(n["width"] for n in nodes) / len(nodes) if nodes else 200
    cols = max(1, int(max_w / (avg_w + spacing)))

    result = []
    col_w = (max_w - spacing * (cols - 1)) / cols if cols > 1 else max_w
    row_heights = []
    current_row_h = 0.0

    for i, n in enumerate(nodes):
        col = i % cols
        row = i // cols

        if col == 0 and i > 0:
            row_heights.append(current_row_h)
            current_row_h = 0

        current_row_h = max(current_row_h, n["height"])

        x = col * (col_w + spacing) + (col_w - min(n["width"], col_w)) / 2
        y = sum(row_heights) + row * spacing

        result.append({**n, "x": x, "y": y, "width": min(n["width"], col_w)})

    return result


# ══════════════════════════════════════════
# Arrow connection points
# ══════════════════════════════════════════

def _best_arrow_points(from_p: dict, to_p: dict) -> tuple[float, float, float, float]:
    """
    Compute best connection points between two positioned nodes.
    Returns (start_x, start_y, end_x, end_y) — points ON the node edges with gap.
    """
    # Center of each node
    fcx = from_p["x"] + from_p["width"] / 2
    fcy = from_p["y"] + from_p["height"] / 2
    tcx = to_p["x"] + to_p["width"] / 2
    tcy = to_p["y"] + to_p["height"] / 2

    dx = tcx - fcx
    dy = tcy - fcy

    # Determine primary connection direction
    if abs(dy) > abs(dx):
        # ── Vertical connection ──
        if dy > 0:
            # from_p is above to_p → connect bottom-of-from to top-of-to
            sx = fcx
            sy = from_p["y"] + from_p["height"] + ARROW_GAP
            ex = tcx
            ey = to_p["y"] - ARROW_GAP
        else:
            # from_p is below to_p → connect top-of-from to bottom-of-to
            sx = fcx
            sy = from_p["y"] - ARROW_GAP
            ex = tcx
            ey = to_p["y"] + to_p["height"] + ARROW_GAP
    else:
        # ── Horizontal connection ──
        if dx > 0:
            # from_p is left of to_p → connect right-of-from to left-of-to
            sx = from_p["x"] + from_p["width"] + ARROW_GAP
            sy = fcy
            ex = to_p["x"] - ARROW_GAP
            ey = tcy
        else:
            # from_p is right of to_p → connect left-of-from to right-of-to
            sx = from_p["x"] - ARROW_GAP
            sy = fcy
            ex = to_p["x"] + to_p["width"] + ARROW_GAP
            ey = tcy

    return sx, sy, ex, ey
