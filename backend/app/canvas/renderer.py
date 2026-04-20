# === FILE: backend/app/canvas/renderer.py ===

"""
Scene Manager — single authority for all scene reads/writes.
Every mutation goes through here. Handles normalization, versioning, and op logging.
"""

from __future__ import annotations
import logging
from typing import Any, Optional

from app.canvas.constants import DEFAULT_SCENE, THEME_COLORS
from app.canvas.factory import ElementFactory, _luminance
from app.canvas.text_measure import measure_text
from app.canvas import layout as diagram_layout
from app.core.config import settings

logger = logging.getLogger("mnemos.scene")


def normalize_scene(scene: dict | None) -> dict:
    """Ensure scene has all required structure."""
    if not scene or not isinstance(scene, dict):
        return {**DEFAULT_SCENE}

    elements = scene.get("elements")
    if not isinstance(elements, list):
        elements = []

    app_state = scene.get("appState")
    if not isinstance(app_state, dict):
        app_state = {}

    bg = app_state.get("viewBackgroundColor", "#0e0e1a")
    if not isinstance(bg, str):
        bg = "#0e0e1a"

    theme = app_state.get("theme")
    if theme not in ("dark", "light"):
        theme = "dark" if _luminance(bg) < 0.4 else "light"

    files = scene.get("files")
    if not isinstance(files, dict):
        files = {}

    return {
        "elements": elements,
        "appState": {**app_state, "viewBackgroundColor": bg, "theme": theme},
        "files": files,
    }


def get_theme(scene: dict) -> str:
    return (scene.get("appState") or {}).get("theme", "dark")


def get_background(scene: dict) -> str:
    return (scene.get("appState") or {}).get("viewBackgroundColor", "#0e0e1a")


def find_elements_by_custom(scene: dict, key: str, value: Any) -> list[dict]:
    """Find elements where customData[key] == value."""
    return [
        el for el in scene.get("elements", [])
        if isinstance(el.get("customData"), dict)
        and el["customData"].get(key) == value
        and not el.get("isDeleted")
    ]


def find_element_by_id(scene: dict, element_id: str) -> dict | None:
    for el in scene.get("elements", []):
        if el.get("id") == element_id:
            return el
    return None


def remove_elements_by_custom(scene: dict, key: str, value: Any) -> list[str]:
    """Remove elements matching custom data filter. Returns removed IDs."""
    removed = []
    kept = []
    for el in scene.get("elements", []):
        custom = el.get("customData") if isinstance(el.get("customData"), dict) else {}
        if custom.get(key) == value and not el.get("isDeleted"):
            removed.append(el["id"])
        else:
            kept.append(el)
    scene["elements"] = kept
    return removed


def get_all_element_ids(scene: dict) -> set[str]:
    return {el["id"] for el in scene.get("elements", []) if not el.get("isDeleted")}


def get_occupied_rects(scene: dict) -> list[dict]:
    """Get bounding rectangles of all non-deleted elements."""
    rects = []
    for el in scene.get("elements", []):
        if el.get("isDeleted"):
            continue
        x = el.get("x", 0)
        y = el.get("y", 0)
        w = el.get("width", 0)
        h = el.get("height", 0)
        if w > 0 and h > 0:
            rects.append({"x": x, "y": y, "width": w, "height": h})
    return rects


def compute_bounds(scene: dict) -> dict:
    """Compute bounding box of all elements."""
    elements = [el for el in scene.get("elements", []) if not el.get("isDeleted") and el.get("x") is not None]
    if not elements:
        return {"minX": 0, "minY": 0, "maxX": 1920, "maxY": 1080}
    return {
        "minX": min(el.get("x", 0) for el in elements),
        "minY": min(el.get("y", 0) for el in elements),
        "maxX": max(el.get("x", 0) + el.get("width", 0) for el in elements),
        "maxY": max(el.get("y", 0) + el.get("height", 0) for el in elements),
    }


def compute_density(scene: dict) -> str:
    count = len([el for el in scene.get("elements", []) if not el.get("isDeleted")])
    if count == 0:
        return "empty"
    bounds = compute_bounds(scene)
    area = (bounds["maxX"] - bounds["minX"]) * (bounds["maxY"] - bounds["minY"])
    if area <= 0:
        return "sparse"
    score = (count / max(area, 1)) * 1_000_000
    if score < 2:
        return "sparse"
    if score < 8:
        return "moderate"
    return "dense"


def detect_layout_pattern(scene: dict) -> str:
    """Detect layout pattern from element positions."""
    elements = [
        el for el in scene.get("elements", [])
        if el.get("type") in ("rectangle", "text", "ellipse", "diamond")
        and not el.get("isDeleted")
    ]
    if len(elements) < 3:
        return "freeform"

    xs = [el.get("x", 0) for el in elements]
    ys = [el.get("y", 0) for el in elements]
    x_range = max(xs) - min(xs) if xs else 0
    y_range = max(ys) - min(ys) if ys else 0

    x_clusters = _alignment_clusters(xs, tolerance=50)
    y_clusters = _alignment_clusters(ys, tolerance=50)

    if len(x_clusters) >= 2 and len(y_clusters) >= 2:
        grid_score = min(len(x_clusters), len(y_clusters)) / max(len(x_clusters), len(y_clusters))
        if grid_score > 0.4:
            return "grid"

    if x_range > 3 * max(y_range, 1) and len(elements) >= 3:
        return "timeline"
    if y_range > 3 * max(x_range, 1) and len(elements) >= 3:
        return "flow"

    return "freeform"


def _alignment_clusters(values: list[float], tolerance: float = 50) -> list[float]:
    if not values:
        return []
    sorted_v = sorted(values)
    clusters = [[sorted_v[0]]]
    for v in sorted_v[1:]:
        if v - clusters[-1][-1] <= tolerance:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [sum(c) / len(c) for c in clusters if len(c) >= 2]


def extract_palette(scene: dict) -> list[str]:
    """Extract dominant colors from scene."""
    from collections import Counter
    colors = Counter()
    for el in scene.get("elements", []):
        if el.get("isDeleted"):
            continue
        for key in ("strokeColor", "backgroundColor"):
            c = el.get(key)
            if isinstance(c, str) and c.startswith("#") and c != "transparent":
                colors[c] += 1
    return [c for c, _ in colors.most_common(8)]


class SceneManager:
    """
    High-level scene operations.
    All scene mutations go through here.
    """

    def __init__(self):
        self._factory_cache: dict[str, ElementFactory] = {}

    def factory(self, scene_or_theme) -> ElementFactory:
        """Get element factory with correct theme for this scene."""
        if isinstance(scene_or_theme, str):
            theme = scene_or_theme
        else:
            theme = get_theme(scene_or_theme)
        if theme not in self._factory_cache:
            self._factory_cache[theme] = ElementFactory(theme=theme)
        return self._factory_cache[theme]

    def extract_position_changes(
        self,
        incoming_elements: list[dict],
        current_placements: list[dict],
        current_objects: list[dict] = None,
    ) -> tuple[list[dict], list[dict]]:
        """
        User may have dragged items around. Extract POSITION changes only.
        
        CRITICAL: Never extract 'content' from Excalidraw's text property — 
        it contains wrapped text from measure_text() and would corrupt the 
        original content in the DB (double-wrapping on each sync cycle).
        """
        item_changes = []
        obj_changes = []
        curr_map = {p["item_id"]: p for p in current_placements}
        obj_map = {str(o["id"]): o for o in (current_objects or [])}

        for el in incoming_elements:
            if el.get("isDeleted"):
                continue
            custom = el.get("customData")
            if not isinstance(custom, dict):
                continue

            ctype = custom.get("type")

            # ── Note card frames → update canvas_placements ──
            if ctype == "note-frame":
                item_id = custom.get("noteId")
                if not item_id:
                    continue
                new_x, new_y = el.get("x", 0), el.get("y", 0)
                new_w, new_h = el.get("width", 0), el.get("height", 0)
                curr = curr_map.get(item_id)
                if not curr or abs(curr["x"] - new_x) > 1 or abs(curr["y"] - new_y) > 1 \
                        or abs(curr["w"] - new_w) > 1 or abs(curr.get("h", 0) - new_h) > 1:
                    item_changes.append({
                        "item_id": item_id,
                        "x": new_x, "y": new_y, "w": new_w, "h": new_h,
                    })

            # ── Composed text → update position ONLY (never content) ──
            elif ctype == "composed-text":
                obj_id = str(el.get("id", ""))
                if not obj_id:
                    continue
                import uuid
                try:
                    uuid.UUID(obj_id)
                except ValueError:
                    continue

                new_x, new_y = el.get("x", 0), el.get("y", 0)
                new_w, new_h = el.get("width", 0), el.get("height", 0)
                curr = obj_map.get(obj_id)

                # Only detect POSITION changes — never touch content
                if not curr:
                    continue  # unknown object, skip
                if abs(curr.get("x", 0) - new_x) > 1 or abs(curr.get("y", 0) - new_y) > 1:
                    obj_changes.append({
                        "obj_id": obj_id,
                        "x": new_x, "y": new_y,
                        "w": new_w, "h": new_h,
                        # NO content here — that's the fix
                    })

            # ── Sticky notes → update position, optionally content from text child ──
            elif ctype == "sticky-bg":
                obj_id = custom.get("stickyId")
                if not obj_id:
                    continue
                obj_id = str(obj_id)
                import uuid
                try:
                    uuid.UUID(obj_id)
                except ValueError:
                    continue

                new_x, new_y = el.get("x", 0), el.get("y", 0)
                new_w, new_h = el.get("width", 0), el.get("height", 0)

                # For stickies, content comes from the paired text element
                content = None
                text_id = f"{obj_id}-text"
                for text_el in incoming_elements:
                    if text_el.get("id") == text_id and not text_el.get("isDeleted"):
                        content = text_el.get("originalText") or text_el.get("text", "")
                        break

                curr = obj_map.get(obj_id)
                changed = False
                if not curr:
                    continue  # unknown object, skip
                if abs(curr.get("x", 0) - new_x) > 1 or abs(curr.get("y", 0) - new_y) > 1:
                    changed = True
                # Only update content if user actually edited the sticky text
                if content is not None and content != (curr.get("content") or ""):
                    changed = True

                if changed:
                    update_dict = {
                        "obj_id": obj_id,
                        "x": new_x, "y": new_y, "w": new_w, "h": new_h,
                    }
                    if content is not None and content != (curr.get("content") or ""):
                        update_dict["content"] = content
                    obj_changes.append(update_dict)

        return item_changes, obj_changes

    def extract_user_drawn(self, elements: list[dict], managed_ids: set[str] = None) -> list[dict]:
        """
        Extract elements drawn by user (not managed by system via build_scene).
        
        Two-layer filter:
        1. Filter by customData.type (semantic)
        2. Filter by element ID if we know the managed IDs (exact match)
        """
        kept = []
        managed_types = {
            "note-frame", "note-accent", "note-title", "note-summary", "note-tags",
            "sticky-bg", "sticky-text",
            "composed-text",
            "diagram-node", "diagram-label", "diagram-arrow", "diagram-edge-label",
        }
        skip_ids = managed_ids or set()

        for el in elements:
            if el.get("isDeleted"):
                continue

            el_id = el.get("id", "")

            # Skip by known managed ID
            if el_id and el_id in skip_ids:
                continue

            # Skip by customData type
            custom = el.get("customData")
            if isinstance(custom, dict):
                t = custom.get("type")
                if t in managed_types:
                    continue

            kept.append(el)
        return kept

    def _collect_managed_ids(self, items: list[dict], objects: list[dict]) -> set[str]:
        """
        Compute ALL element IDs that build_scene will generate.
        Used to definitively filter them from user_drawn.
        """
        ids = set()

        for item in items:
            note_id = item["id"]
            ids.update({
                f"note-frame-{note_id}",
                f"note-accent-{note_id}",
                f"note-title-{note_id}",
                f"note-summary-{note_id}",
                f"note-tags-{note_id}",
            })

        for obj in objects:
            obj_id = str(obj.get("id", ""))
            kind = obj.get("kind")

            if kind == "text":
                ids.add(obj_id)  # composed text uses obj UUID as element ID

            elif kind == "sticky":
                ids.add(f"{obj_id}-bg")
                ids.add(f"{obj_id}-text")

            # Diagram element IDs are generated dynamically by layout_diagram,
            # so we can't precompute them. They're caught by customData filter.

        return ids

    def build_scene(
        self,
        items: list[dict],
        placements: list[dict],
        objects: list[dict],
        user_drawn: list[dict],
        theme: str = "dark",
        background: str = "#0e0e1a",
    ) -> dict:
        """
        Get the full rendered scene for a workspace.
        REBUILDS from source-of-truth tables every time.
        Deduplicates by element ID — managed elements always win.
        """
        scene = normalize_scene(None)
        scene = self.set_theme(scene, theme)
        scene = self.set_background(scene, background)

        # ── Compute managed IDs to definitively filter user_drawn ──
        managed_ids = self._collect_managed_ids(items, objects)

        # ── Filter user_drawn against managed IDs ──
        clean_user_drawn = []
        for el in user_drawn:
            el_id = el.get("id", "")
            if el_id in managed_ids:
                continue  # this element will be recreated by build_scene
            # Also check customData type as a backup
            custom = el.get("customData")
            if isinstance(custom, dict):
                ctype = custom.get("type", "")
                if ctype in {
                    "note-frame", "note-accent", "note-title",
                    "note-summary", "note-tags",
                    "sticky-bg", "sticky-text",
                    "composed-text",
                    "diagram-node", "diagram-label",
                    "diagram-arrow", "diagram-edge-label",
                }:
                    continue
            clean_user_drawn.append(el)

        scene["elements"].extend(clean_user_drawn)

        # ── Render canvas objects (text, stickies, diagrams) ──
        for obj in objects:
            kind = obj.get("kind")
            data = obj.get("meta") or {}
            content = obj.get("content") or ""

            x = obj.get("x")
            y = obj.get("y")
            x = x if x is not None else 0
            y = y if y is not None else 0

            w = obj.get("w")
            w = w if w is not None else 500

            if kind == "sticky":
                self.add_sticky(scene, content, x, y,
                                bg_color=data.get("color", "#fef08a"),
                                id=str(obj.get("id")))
            elif kind == "text":
                col_width = settings.sheet_width - settings.sheet_margin * 2
                self.add_text(scene, content, x, y,
                              max_width=min(w, col_width),
                              element_id=str(obj.get("id")))
            elif kind == "diagram":
                # Rebuild diagram from stored topology
                topology = data.get("topology")
                if topology:
                    self._rebuild_diagram(scene, topology, x, y, w, obj)

        # ── Render note cards from placements ──
        placement_map = {p["item_id"]: p for p in placements}
        for item in items:
            p = placement_map.get(item["id"])
            if not p:
                continue
            self.upsert_note_card(scene, item, p["x"], p["y"], p.get("w"), p.get("h"))

        # ── FINAL SAFETY: deduplicate by element ID ──
        # If somehow the same ID appears twice, the LAST one wins
        # (managed elements are added after user_drawn, so they win)
        seen_ids = {}
        deduped = []
        for el in scene["elements"]:
            el_id = el.get("id")
            if el_id:
                if el_id in seen_ids:
                    # Replace the earlier element
                    deduped[seen_ids[el_id]] = None  # mark for removal
                seen_ids[el_id] = len(deduped)
            deduped.append(el)

        scene["elements"] = [el for el in deduped if el is not None]

        return scene

    def _rebuild_diagram(self, scene: dict, topology: dict,
                         x: float, y: float, w: float, obj: dict):
        """Rebuild diagram elements from stored topology at stored position."""
        from app.canvas.layout import layout_diagram

        f = self.factory(scene)
        col_width = settings.sheet_width - settings.sheet_margin * 2
        max_w = min(w, col_width) if w and w > 0 else col_width

        elements, bbox = layout_diagram(topology, 0, 0, f, max_width=max_w)

        if not elements:
            return

        # Center the diagram within the column
        diagram_w = bbox["width"]
        if diagram_w < col_width:
            target_x = settings.sheet_margin + (col_width - diagram_w) / 2
        else:
            target_x = x if x else settings.sheet_margin

        dx = target_x - bbox["x"]
        dy = y - bbox["y"]

        for el in elements:
            el["x"] = el.get("x", 0) + dx
            el["y"] = el.get("y", 0) + dy

        scene["elements"].extend(elements)

    # ── Note card operations ──

    def upsert_note_card(
        self,
        scene: dict,
        note: dict,
        x: float, y: float,
        width: float = None,
        height: float = None,
    ) -> tuple[dict, list[str]]:
        w = width or settings.card_w
        h = height or settings.card_h
        note_id = note["id"]
        f = self.factory(scene)

        removed = remove_elements_by_custom(scene, "noteId", note_id)
        elements, group_id = f.note_card(note, x, y, w, h)
        scene["elements"].extend(elements)
        element_ids = [el["id"] for el in elements]

        return scene, element_ids

    def remove_note_card(self, scene: dict, note_id: str) -> tuple[dict, list[str]]:
        removed = remove_elements_by_custom(scene, "noteId", note_id)
        return scene, removed

    def update_note_card_content(self, scene: dict, note: dict) -> dict:
        note_id = note["id"]
        f = self.factory(scene)

        title_el = find_element_by_id(scene, f"note-title-{note_id}")
        if title_el:
            new_title = note.get("title") or "Untitled"
            m = measure_text(new_title, font_size=18, font_family=1, max_width=336, max_lines=2)
            f.update_element(title_el, text=m["wrapped_text"], originalText=new_title,
                             width=m["width"], height=m["height"])

        summary_el = find_element_by_id(scene, f"note-summary-{note_id}")
        if summary_el:
            new_summary = note.get("summary") or note.get("raw_text", "")
            m = measure_text(new_summary, font_size=13, font_family=1, max_width=336, max_lines=6)
            f.update_element(summary_el, text=m["wrapped_text"], originalText=new_summary,
                             width=m["width"], height=m["height"])

        tags_el = find_element_by_id(scene, f"note-tags-{note_id}")
        if tags_el:
            tag_text = "  ".join(f"#{t}" for t in (note.get("tags") or []))
            m = measure_text(tag_text, font_size=11, font_family=3, max_width=336, max_lines=1)
            f.update_element(tags_el, text=m["wrapped_text"], originalText=tag_text,
                             width=m["width"], height=m["height"])

        return scene

    # ── Text operations ──

    def add_text(
        self,
        scene: dict,
        text: str,
        x: float, y: float,
        *,
        font_size: int = 16,
        max_width: float = 500,
        element_id: str = None,
        color: str = None,
    ) -> tuple[dict, dict, str]:
        f = self.factory(scene)
        bg = get_background(scene)
        text_color = color or f.contrast_text_color(bg)

        # Clamp max_width to column width
        col_width = settings.sheet_width - settings.sheet_margin * 2
        effective_max_width = min(max_width, col_width)

        el = f.text(
            text, x, y,
            id=element_id,
            font_size=font_size, max_width=effective_max_width,
            color=text_color,
            custom_data={"type": "composed-text"},
        )
        scene["elements"].append(el)

        measurement = {"width": el["width"], "height": el["height"]}
        return scene, measurement, el["id"]

    # ── Diagram operations ──

    def add_diagram(
        self,
        scene: dict,
        topology: dict,
        x: float, y: float,
        max_width: float = None,
    ) -> tuple[dict, dict]:
        f = self.factory(scene)
        col_width = settings.sheet_width - settings.sheet_margin * 2
        elements, bbox = diagram_layout.layout_diagram(
            topology, x, y, f, max_width=max_width or col_width,
        )
        scene["elements"].extend(elements)
        return scene, bbox

    # ── Sticky notes ──

    def add_sticky(
        self,
        scene: dict,
        content: str,
        x: float, y: float,
        bg_color: str = "#fef08a",
        id: str = None,
    ) -> tuple[dict, str]:
        f = self.factory(scene)
        elements, group_id = f.sticky_note(content, x, y, bg_color=bg_color, id=id)
        scene["elements"].extend(elements)
        return scene, group_id

    # ── Background / theme ──

    def set_background(self, scene: dict, color: str) -> dict:
        app_state = scene.setdefault("appState", {})
        app_state["viewBackgroundColor"] = color
        app_state["theme"] = "dark" if _luminance(color) < 0.4 else "light"
        self._factory_cache.clear()
        return scene

    def set_theme(self, scene: dict, theme: str) -> dict:
        app_state = scene.setdefault("appState", {})
        app_state["theme"] = theme
        app_state["viewBackgroundColor"] = (
            "#0e0e1a" if theme == "dark" else "#ffffff"
        )
        self._factory_cache.clear()
        return scene

    # ── Bulk operations ──

    def move_elements(
        self,
        scene: dict,
        element_ids: list[str],
        dx: float, dy: float,
    ) -> dict:
        f = self.factory(scene)
        id_set = set(element_ids)
        for el in scene.get("elements", []):
            if el.get("id") in id_set:
                f.move_element(el, el.get("x", 0) + dx, el.get("y", 0) + dy)
        return scene

    def delete_elements(self, scene: dict, element_ids: list[str]) -> dict:
        f = self.factory(scene)
        id_set = set(element_ids)
        for el in scene.get("elements", []):
            if el.get("id") in id_set:
                f.delete_element(el)
        return scene

    def shift_elements_below(
        self,
        scene: dict,
        after_y: float,
        shift_amount: float,
        exclude_ids: set[str] = None,
    ) -> list[str]:
        exclude = exclude_ids or set()
        f = self.factory(scene)
        shifted = []
        for el in scene.get("elements", []):
            if el.get("isDeleted"):
                continue
            if el.get("id") in exclude:
                continue
            if el.get("y", 0) > after_y:
                f.update_element(el, y=el["y"] + shift_amount)
                shifted.append(el["id"])
        return shifted

    # ── Analysis ──

    def analyze(self, scene: dict) -> dict:
        return {
            "theme": get_theme(scene),
            "background": get_background(scene),
            "layout_pattern": detect_layout_pattern(scene),
            "density": compute_density(scene),
            "bounds": compute_bounds(scene),
            "palette": extract_palette(scene),
            "element_count": len([e for e in scene.get("elements", []) if not e.get("isDeleted")]),
        }


scene_manager = SceneManager()