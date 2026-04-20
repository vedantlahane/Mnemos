# === FILE: backend/app/canvas/layout.py ===

"""
Diagram layout engine.
Takes topology → positioned Excalidraw elements.
Supports: tree, flow, mindmap, list, comparison, timeline.
Tree layout uses Reingold-Tilford-style subtree width computation.
"""

from __future__ import annotations
import math
from collections import defaultdict, deque

from app.canvas.text_measure import measure_text
from app.canvas.factory import ElementFactory
from app.core.config import settings

ARROW_GAP = 10
H_GAP = 80        # horizontal between siblings (was 60)
V_GAP = 90        # vertical between tree levels (was 80)
FLOW_GAP = 70     # vertical in flow layout (was 60)
MIN_NODE_W = 180   # minimum node width


def layout_diagram(
    topology: dict,
    base_x: float,
    base_y: float,
    factory: ElementFactory,
    max_width: float = None,
) -> tuple[list[dict], dict]:
    max_w = max_width or (settings.sheet_width - settings.sheet_margin * 2)
    nodes = topology.get("elements", [])
    connections = topology.get("connections", [])
    layout_type = topology.get("layout_type", "flow")

    if not nodes:
        return [], {"x": base_x, "y": base_y, "width": 0, "height": 0}

    measured = _measure_nodes(nodes, max_w)
    node_map = {n["id"]: n for n in measured}

    # Auto-detect tree if connections form one
    if layout_type in ("flow", "tree") and connections:
        root = _find_root(measured, connections)
        if root and _is_tree(measured, connections, root):
            layout_type = "tree"

    # Dispatch
    positions = _dispatch(layout_type, measured, connections, max_w)

    # Clamp width
    if positions:
        tw = max(p["x"] + p["width"] for p in positions) - min(p["x"] for p in positions)
        if tw > max_w and tw > 0:
            scale = max_w / tw
            mn = min(p["x"] for p in positions)
            for p in positions:
                p["x"] = (p["x"] - mn) * scale
                p["width"] *= scale

    # Translate to base position
    if positions:
        mn_x = min(p["x"] for p in positions)
        mn_y = min(p["y"] for p in positions)
        for p in positions:
            p["x"] += base_x - mn_x
            p["y"] += base_y - mn_y

    # Build Excalidraw elements
    diagram_id = f"diagram-{nodes[0]['id'][:8]}"
    group_id = f"grp-{diagram_id}"
    all_el = []
    pos_map = {p["id"]: p for p in positions}

    for p in positions:
        all_el.extend(factory.diagram_node(
            label=p["label"], x=p["x"], y=p["y"],
            width=p["width"], height=p["height"],
            node_id=p["id"], style=p["style"],
            group_id=group_id, diagram_id=diagram_id,
        ))

    # Arrows
    for conn in connections:
        src = pos_map.get(conn.get("from"))
        dst = pos_map.get(conn.get("to"))
        if not src or not dst:
            continue

        sx, sy, ex, ey = _edge_points(src, dst)
        arrow = factory.arrow(
            sx, sy, ex, ey,
            id=f"arrow-{conn['from']}-{conn['to']}",
            stroke_color=factory._colors["arrow"],
            stroke_width=2,
            stroke_style=conn.get("style", "solid"),
            group_ids=[group_id],
            custom_data={"type": "diagram-arrow", "diagramId": diagram_id},
        )
        # Bind to rects
        sr = next((e for e in all_el if e.get("id") == f"{conn['from']}-rect"), None)
        dr = next((e for e in all_el if e.get("id") == f"{conn['to']}-rect"), None)
        if sr and dr:
            factory.bind_arrow(arrow, start_el=sr, end_el=dr)
        all_el.append(arrow)

        # Edge label
        if conn.get("label"):
            mx, my = (sx + ex) / 2 + 10, (sy + ey) / 2 - 12
            all_el.append(factory.text(
                conn["label"], mx, my,
                font_size=11, font_family=1, max_width=120,
                color=factory._colors["muted"],
                group_ids=[group_id],
                custom_data={"type": "diagram-edge-label", "diagramId": diagram_id},
            ))

    bbox = _bbox(positions)
    return all_el, bbox


# ── Node measurement ──

def _measure_nodes(nodes: list[dict], max_w: float) -> list[dict]:
    # Cap each node at 45% of canvas width (was 40%)
    cap = max_w * 0.45
    out = []
    for n in nodes:
        label = n.get("label", "")
        requested = max(float(n.get("width", 240)), MIN_NODE_W)
        req = min(requested, cap)
        m = measure_text(label, 14, 1, req - 24, 3)
        # Ensure node is wide enough for the text + padding
        w = min(max(req, m["width"] + 40), cap)
        w = max(w, MIN_NODE_W)  # enforce minimum
        h = max(float(n.get("height", 64)), m["height"] + 24, 56)
        out.append({"id": n["id"], "label": label,
                     "style": n.get("style", "default"),
                     "width": w, "height": h})
    return out


# ── Graph helpers ──

def _find_root(nodes, connections):
    ids = {n["id"] for n in nodes}
    children_set = {c["to"] for c in connections}
    roots = ids - children_set
    if roots:
        for n in nodes:
            if n["id"] in roots:
                return n["id"]
        return roots.pop()
    return nodes[0]["id"] if nodes else None


def _is_tree(nodes, connections, root):
    parent_count = defaultdict(int)
    for c in connections:
        parent_count[c["to"]] += 1
        if parent_count[c["to"]] > 1:
            return False
    children = defaultdict(list)
    for c in connections:
        children[c["from"]].append(c["to"])
    visited = set()
    q = deque([root])
    while q:
        n = q.popleft()
        if n in visited:
            continue
        visited.add(n)
        q.extend(children[n])
    # More lenient: 50% reachability counts as tree (was 70%)
    return len(visited) >= len(nodes) * 0.5


# ── Dispatch ──

def _dispatch(lt, nodes, conns, max_w):
    # If connections exist and form a tree, force tree layout
    if lt in ("flow", "tree") and conns and len(nodes) > 2:
        root = _find_root(nodes, conns)
        if root:
            children = defaultdict(list)
            for c in conns:
                children[c["from"]].append(c["to"])
            # Check if any node has multiple children (branching)
            has_branching = any(len(ch) > 1 for ch in children.values())
            if has_branching:
                lt = "tree"

    fn = {"tree": _tree, "flow": _flow, "mindmap": _mindmap,
          "list": _list, "comparison": _comparison,
          "timeline": _timeline}.get(lt, _flow)
    return fn(nodes, conns, max_w)


# ── TREE (Reingold-Tilford style) ──

def _tree(nodes, connections, max_w):
    node_map = {n["id"]: n for n in nodes}
    children = defaultdict(list)
    for c in connections:
        children[c["from"]].append(c["to"])

    root = _find_root(nodes, connections)
    if not root:
        return _flow(nodes, connections, max_w)

    # Compute subtree widths bottom-up
    stw: dict[str, float] = {}
    _subtree_w(root, children, node_map, stw)

    # Position top-down, centered at max_w/2
    out: dict[str, dict] = {}
    _place(root, max_w / 2, 0, children, node_map, stw, out)

    # Handle orphans
    placed = set(out.keys())
    bottom = max((p["y"] + p["height"] for p in out.values()), default=0)
    ox = 0.0
    for n in nodes:
        if n["id"] not in placed:
            out[n["id"]] = {**n, "x": ox, "y": bottom + V_GAP}
            ox += n["width"] + H_GAP
            if ox > max_w:
                ox = 0.0
                bottom += n["height"] + V_GAP

    return list(out.values())


def _subtree_w(nid, children, node_map, cache):
    if nid in cache:
        return cache[nid]
    node = node_map.get(nid)
    if not node:
        cache[nid] = 0
        return 0
    kids = children.get(nid, [])
    if not kids:
        cache[nid] = node["width"]
        return node["width"]
    total = sum(_subtree_w(k, children, node_map, cache) for k in kids)
    total += H_GAP * (len(kids) - 1)
    cache[nid] = max(node["width"], total)
    return cache[nid]


def _place(nid, cx, y, children, node_map, stw, out):
    node = node_map.get(nid)
    if not node or nid in out:
        return
    out[nid] = {**node, "x": cx - node["width"] / 2, "y": y}
    kids = children.get(nid, [])
    if not kids:
        return
    widths = [stw.get(k, 0) for k in kids]
    total = sum(widths) + H_GAP * (len(kids) - 1)
    child_y = y + node["height"] + V_GAP
    left = cx - total / 2
    for i, kid in enumerate(kids):
        kw = widths[i]
        _place(kid, left + kw / 2, child_y, children, node_map, stw, out)
        left += kw + H_GAP


# ── FLOW ──

def _flow(nodes, conns, max_w):
    out, y = [], 0.0
    for n in nodes:
        x = (max_w - n["width"]) / 2
        out.append({**n, "x": max(0, x), "y": y})
        y += n["height"] + FLOW_GAP
    return out


# ── MINDMAP ──

def _mindmap(nodes, conns, max_w):
    if len(nodes) <= 2:
        return _flow(nodes, conns, max_w)
    out = []
    c = nodes[0]
    cx, cy = max_w / 2, 250.0
    out.append({**c, "x": cx - c["width"] / 2, "y": cy - c["height"] / 2})
    branches = nodes[1:]
    n = len(branches)
    max_dim = max(b["width"] + b["height"] for b in branches)
    circ = sum(max(b["width"], b["height"]) + H_GAP for b in branches)
    radius = max(max_dim * 0.8 + 40, circ / (2 * math.pi), 160)
    radius = min(radius, (max_w - 200) / 2)
    for i, b in enumerate(branches):
        a = (i / n) * 2 * math.pi - math.pi / 2
        bx = max(0, min(cx + radius * math.cos(a) - b["width"] / 2, max_w - b["width"]))
        by = cy + radius * math.sin(a) - b["height"] / 2
        out.append({**b, "x": bx, "y": by})
    return out


# ── LIST ──

def _list(nodes, conns, max_w):
    out, y = [], 0.0
    for n in nodes:
        out.append({**n, "x": 20.0, "y": y})
        y += n["height"] + FLOW_GAP * 0.5
    return out


# ── COMPARISON ──

def _comparison(nodes, conns, max_w):
    gap = 40
    col = (max_w - gap) / 2
    out = []
    for i, n in enumerate(nodes):
        c, r = i % 2, i // 2
        nw = min(n["width"], col)
        x = c * (col + gap) + (col - nw) / 2
        y = r * (n["height"] + FLOW_GAP)
        out.append({**n, "x": x, "y": y, "width": nw})
    return out


# ── TIMELINE ──

def _timeline(nodes, conns, max_w):
    total = sum(n["width"] for n in nodes) + H_GAP * max(len(nodes) - 1, 0)
    if total > max_w:
        return _flow(nodes, conns, max_w)
    mh = max(n["height"] for n in nodes) if nodes else 56
    out, cx = [], 0.0
    for n in nodes:
        out.append({**n, "x": cx, "y": (mh - n["height"]) / 2})
        cx += n["width"] + H_GAP
    return out


# ── Helpers ──

def _bbox(positions):
    if not positions:
        return {"x": 0, "y": 0, "width": 0, "height": 0}
    x1 = min(p["x"] for p in positions)
    y1 = min(p["y"] for p in positions)
    x2 = max(p["x"] + p["width"] for p in positions)
    y2 = max(p["y"] + p["height"] for p in positions)
    return {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}


def _edge_points(src, dst):
    """Connection points on rectangle edges — picks closest side pair."""
    scx = src["x"] + src["width"] / 2
    scy = src["y"] + src["height"] / 2
    dcx = dst["x"] + dst["width"] / 2
    dcy = dst["y"] + dst["height"] / 2
    dx, dy = dcx - scx, dcy - scy

    if abs(dy) > abs(dx) * 0.5:
        if dy > 0:
            return scx, src["y"] + src["height"] + ARROW_GAP, dcx, dst["y"] - ARROW_GAP
        return scx, src["y"] - ARROW_GAP, dcx, dst["y"] + dst["height"] + ARROW_GAP
    if dx > 0:
        return src["x"] + src["width"] + ARROW_GAP, scy, dst["x"] - ARROW_GAP, dcy
    return src["x"] - ARROW_GAP, scy, dst["x"] + dst["width"] + ARROW_GAP, dcy