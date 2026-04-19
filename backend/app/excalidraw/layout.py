"""
Diagram layout engine.
Takes topology (nodes + edges) → produces positioned elements.
Fits within sheet width constraint.
"""

from __future__ import annotations
import math
from typing import Optional

from app.excalidraw.text_measure import measure_text
from app.excalidraw.factory import ElementFactory
from app.config import settings


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
    
    Tries progressively tighter layouts until it fits within max_width.
    """
    max_w = max_width or (settings.sheet_width - settings.sheet_margin * 2)
    nodes = topology.get("elements", [])
    connections = topology.get("connections", [])
    layout_type = topology.get("layout_type", "flow")

    if not nodes:
        return [], {"x": base_x, "y": base_y, "width": 0, "height": 0}

    # Measure all node labels
    measured = []
    for node in nodes:
        label = node.get("label", "")
        node_max_w = float(node.get("width", 200))
        m = measure_text(label, font_size=14, font_family=1, max_width=node_max_w - 20, max_lines=3)
        w = max(float(node.get("width", 200)), m["width"] + 24)
        h = max(float(node.get("height", 60)), m["height"] + 20)
        measured.append({
            "id": node["id"],
            "label": label,
            "style": node.get("style", "default"),
            "width": w,
            "height": h,
        })

    # Try layouts with increasing compactness
    for attempt_cfg in _layout_attempts(layout_type, max_w, measured):
        positions = attempt_cfg["fn"](measured, attempt_cfg["spacing"])
        total_w = max(p["x"] + p["width"] for p in positions) - min(p["x"] for p in positions)

        if total_w <= max_w or attempt_cfg.get("last"):
            break

    # If still too wide, scale down
    if total_w > max_w:
        scale = max_w / total_w
        for p in positions:
            p["x"] *= scale
            p["y"] *= scale
            p["width"] *= scale
            p["height"] *= scale

    # Shift to base_x, base_y
    min_x = min(p["x"] for p in positions)
    min_y = min(p["y"] for p in positions)
    for p in positions:
        p["x"] += base_x - min_x
        p["y"] += base_y - min_y

    # Build Excalidraw elements
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

    # Arrows
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

        # Find actual node elements for binding
        from_rect = next((e for e in all_elements if e.get("id") == f"{conn['from']}-rect"), None)
        to_rect = next((e for e in all_elements if e.get("id") == f"{conn['to']}-rect"), None)
        if from_rect and to_rect:
            factory.bind_arrow(arrow_el, start_el=from_rect, end_el=to_rect)

        if conn.get("label"):
            mid_x = (sx + ex) / 2
            mid_y = (sy + ey) / 2
            label_el = factory.text(
                conn["label"], mid_x - 30, mid_y - 10,
                font_size=11, font_family=1, max_width=120,
                color=factory._colors["muted"],
                group_ids=[group_id],
                custom_data={"type": "diagram-edge-label", "diagramId": diagram_id},
            )
            all_elements.append(label_el)

        all_elements.append(arrow_el)

    # Bounding box
    all_xs = [p["x"] for p in positions]
    all_ys = [p["y"] for p in positions]
    all_rs = [p["x"] + p["width"] for p in positions]
    all_bs = [p["y"] + p["height"] for p in positions]
    bbox = {
        "x": min(all_xs),
        "y": min(all_ys),
        "width": max(all_rs) - min(all_xs),
        "height": max(all_bs) - min(all_ys),
    }

    return all_elements, bbox


# ── Layout algorithms ──

def _layout_attempts(layout_type: str, max_w: float, nodes: list) -> list[dict]:
    """Generate progressively tighter layout configurations."""
    fn_map = {
        "flow": _layout_flow,
        "mindmap": _layout_mindmap,
        "list": _layout_list,
        "comparison": _layout_comparison,
        "timeline": _layout_timeline,
    }
    primary_fn = fn_map.get(layout_type, _layout_flow)
    fallback_fn = _layout_flow if layout_type != "flow" else _layout_grid

    return [
        {"fn": primary_fn, "spacing": 80},
        {"fn": primary_fn, "spacing": 50},
        {"fn": fallback_fn, "spacing": 40},
        {"fn": _layout_grid, "spacing": 30, "last": True},
    ]


def _layout_flow(nodes: list[dict], spacing: float) -> list[dict]:
    max_w = max(n["width"] for n in nodes) if nodes else 200
    cursor_y = 0.0
    result = []
    for n in nodes:
        result.append({**n, "x": (max_w - n["width"]) / 2, "y": cursor_y})
        cursor_y += n["height"] + spacing
    return result


def _layout_mindmap(nodes: list[dict], spacing: float) -> list[dict]:
    if not nodes:
        return []
    result = []
    center = nodes[0]
    cx, cy = 300.0, 300.0
    result.append({**center, "x": cx - center["width"] / 2, "y": cy - center["height"] / 2})

    if len(nodes) > 1:
        branches = nodes[1:]
        radius = 200 + spacing
        for i, n in enumerate(branches):
            angle = (i / len(branches)) * 2 * math.pi - math.pi / 2
            nx = cx + radius * math.cos(angle) - n["width"] / 2
            ny = cy + radius * math.sin(angle) - n["height"] / 2
            result.append({**n, "x": nx, "y": ny})
    return result


def _layout_list(nodes: list[dict], spacing: float) -> list[dict]:
    cursor_y = 0.0
    result = []
    for n in nodes:
        result.append({**n, "x": 0.0, "y": cursor_y})
        cursor_y += n["height"] + spacing * 0.4
    return result


def _layout_comparison(nodes: list[dict], spacing: float) -> list[dict]:
    result = []
    for i, n in enumerate(nodes):
        col = i % 2
        row = i // 2
        result.append({**n, "x": col * (n["width"] + spacing), "y": row * (n["height"] + spacing)})
    return result


def _layout_timeline(nodes: list[dict], spacing: float) -> list[dict]:
    cursor_x = 0.0
    result = []
    for n in nodes:
        result.append({**n, "x": cursor_x, "y": 0.0})
        cursor_x += n["width"] + spacing
    return result


def _layout_grid(nodes: list[dict], spacing: float) -> list[dict]:
    cols = max(1, int(math.ceil(math.sqrt(len(nodes)))))
    result = []
    for i, n in enumerate(nodes):
        col = i % cols
        row = i // cols
        result.append({**n, "x": col * (n["width"] + spacing), "y": row * (n["height"] + spacing)})
    return result


def _best_arrow_points(from_p: dict, to_p: dict) -> tuple[float, float, float, float]:
    """Compute best connection points between two positioned nodes."""
    fcx = from_p["x"] + from_p["width"] / 2
    fcy = from_p["y"] + from_p["height"] / 2
    tcx = to_p["x"] + to_p["width"] / 2
    tcy = to_p["y"] + to_p["height"] / 2

    dx = tcx - fcx
    dy = tcy - fcy

    # Determine primary direction
    if abs(dy) > abs(dx):
        # Vertical connection
        if dy > 0:
            return fcx, from_p["y"] + from_p["height"], tcx, to_p["y"]
        else:
            return fcx, from_p["y"], tcx, to_p["y"] + to_p["height"]
    else:
        # Horizontal connection
        if dx > 0:
            return from_p["x"] + from_p["width"], fcy, to_p["x"], tcy
        else:
            return from_p["x"], fcy, to_p["x"] + to_p["width"], tcy