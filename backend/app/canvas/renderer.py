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

    def factory(self, scene: dict) -> ElementFactory:
        """Get element factory with correct theme for this scene."""
        theme = get_theme(scene)
        if theme not in self._factory_cache:
            self._factory_cache[theme] = ElementFactory(theme=theme)
        return self._factory_cache[theme]

    # ── Note card operations ──

    def upsert_note_card(
        self,
        scene: dict,
        note: dict,
        x: float, y: float,
        width: float = None,
        height: float = None,
    ) -> tuple[dict, list[str]]:
        """
        Add or update a note card on scene.
        Returns (modified_scene, element_ids).
        """
        w = width or settings.card_width
        h = height or settings.card_height
        note_id = note["id"]
        f = self.factory(scene)

        # Remove existing elements for this note
        removed = remove_elements_by_custom(scene, "noteId", note_id)

        # Create new card
        elements, group_id = f.note_card(note, x, y, w, h)
        scene["elements"].extend(elements)
        element_ids = [el["id"] for el in elements]

        return scene, element_ids

    def remove_note_card(self, scene: dict, note_id: str) -> tuple[dict, list[str]]:
        """Remove all elements for a note. Returns (scene, removed_ids)."""
        removed = remove_elements_by_custom(scene, "noteId", note_id)
        return scene, removed

    def update_note_card_content(self, scene: dict, note: dict) -> dict:
        """Update text content of existing note card without moving it."""
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
        """
        Add text element to scene.
        Returns (scene, measurement, element_id).
        """
        f = self.factory(scene)
        bg = get_background(scene)
        text_color = color or f.contrast_text_color(bg)

        el = f.text(
            text, x, y,
            id=element_id,
            font_size=font_size, max_width=max_width,
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
        """
        Add diagram to scene.
        Returns (scene, bounding_box).
        """
        f = self.factory(scene)
        elements, bbox = diagram_layout.layout_diagram(
            topology, x, y, f, max_width=max_width,
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
    ) -> tuple[dict, str]:
        """Add sticky note. Returns (scene, group_id)."""
        f = self.factory(scene)
        elements, group_id = f.sticky_note(content, x, y, bg_color=bg_color)
        scene["elements"].extend(elements)
        return scene, group_id

    # ── Background / theme ──

    def set_background(self, scene: dict, color: str) -> dict:
        app_state = scene.setdefault("appState", {})
        app_state["viewBackgroundColor"] = color
        app_state["theme"] = "dark" if _luminance(color) < 0.4 else "light"
        # Clear factory cache so next operation uses correct theme
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
        """Move multiple elements by delta."""
        f = self.factory(scene)
        id_set = set(element_ids)
        for el in scene.get("elements", []):
            if el.get("id") in id_set:
                f.move_element(el, el.get("x", 0) + dx, el.get("y", 0) + dy)
        return scene

    def delete_elements(self, scene: dict, element_ids: list[str]) -> dict:
        """Soft-delete multiple elements."""
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
        """
        Shift all elements below after_y down by shift_amount.
        Returns list of shifted element IDs.
        """
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
        """Full scene analysis for AI context."""
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