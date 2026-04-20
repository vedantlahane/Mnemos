# === FILE: backend/app/canvas/renderer.py ===

"""
Scene builder — single authority for all scene reads/writes.
Every canvas mutation goes through here.
Terminology: "scene" = Excalidraw JSON, "workspace" = board.
"""

from __future__ import annotations
import logging
from typing import Any

from app.canvas.constants import DEFAULT_SCENE, THEME_COLORS
from app.canvas.factory import ElementFactory, _luminance, reset_index_counter
from app.canvas.text_measure import measure_text
from app.canvas import layout as diagram_layout
from app.core.config import settings

logger = logging.getLogger("mnemos.scene")


# ══════════════════════════════════════
# Scene helpers
# ══════════════════════════════════════

def normalize_scene(scene: dict | None) -> dict:
    if not scene or not isinstance(scene, dict):
        return {**DEFAULT_SCENE, "elements": [], "files": {},
                "appState": {**DEFAULT_SCENE["appState"]}}

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


def compute_bounds(scene: dict) -> dict:
    elements = [el for el in scene.get("elements", [])
                if not el.get("isDeleted") and el.get("x") is not None]
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

    if y_range > 3 * max(x_range, 1):
        return "flow"
    if x_range > 3 * max(y_range, 1):
        return "timeline"
    return "freeform"


def extract_palette(scene: dict) -> list[str]:
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


# ══════════════════════════════════════
# Managed element type registry
# ══════════════════════════════════════

MANAGED_TYPES = frozenset({
    "note-title", "note-summary",
    # Legacy (old scenes still have these)
    "note-frame", "note-accent", "note-tags",
    "note-text", "note-body", "note-divider",
    "sticky-bg", "sticky-text",
    "composed-text",
    "diagram-node", "diagram-label", "diagram-arrow", "diagram-edge-label",
})


class SceneBuilder:
    """
    Builds and manages Excalidraw scenes from source-of-truth tables.
    Single instance — import as `scene_builder`.
    """

    def __init__(self):
        self._factory_cache: dict[str, ElementFactory] = {}

    def factory(self, scene_or_theme) -> ElementFactory:
        if isinstance(scene_or_theme, str):
            theme = scene_or_theme
        else:
            theme = get_theme(scene_or_theme)
        if theme not in self._factory_cache:
            self._factory_cache[theme] = ElementFactory(theme=theme)
        return self._factory_cache[theme]

    # ──────────────────────────────────
    # Position extraction (Excalidraw → DB)
    # ──────────────────────────────────

    def extract_position_changes(
        self,
        incoming_elements: list[dict],
        current_placements: list[dict],
        current_objects: list[dict] = None,
    ) -> tuple[list[dict], list[dict]]:
        item_changes = []
        obj_changes = []
        place_map = {p["item_id"]: p for p in current_placements}
        obj_map = {str(o["id"]): o for o in (current_objects or [])}

        for el in incoming_elements:
            if el.get("isDeleted"):
                continue
            custom = el.get("customData")
            if not isinstance(custom, dict):
                continue

            ctype = custom.get("type")
            new_x = el.get("x", 0)
            new_y = el.get("y", 0)
            new_w = el.get("width", 0)
            new_h = el.get("height", 0)

            if ctype in ("note-text", "note-body", "note-frame"):
                item_id = custom.get("noteId")
                if not item_id:
                    continue
                curr = place_map.get(item_id)
                if not curr:
                    continue
                if (abs(curr["x"] - new_x) > 2 or abs(curr["y"] - new_y) > 2
                        or abs(curr["w"] - new_w) > 2 or abs(curr.get("h", 0) - new_h) > 2):
                    item_changes.append({
                        "item_id": item_id,
                        "x": new_x, "y": new_y, "w": new_w, "h": new_h,
                    })

            elif ctype == "composed-text":
                obj_id = str(el.get("id", ""))
                curr = obj_map.get(obj_id)
                if not curr:
                    continue
                if abs(curr.get("x", 0) - new_x) > 2 or abs(curr.get("y", 0) - new_y) > 2:
                    obj_changes.append({
                        "obj_id": obj_id,
                        "x": new_x, "y": new_y, "w": new_w, "h": new_h,
                    })

            elif ctype == "sticky-bg":
                obj_id = str(custom.get("stickyId", ""))
                curr = obj_map.get(obj_id)
                if not curr:
                    continue
                if abs(curr.get("x", 0) - new_x) > 2 or abs(curr.get("y", 0) - new_y) > 2:
                    obj_changes.append({
                        "obj_id": obj_id,
                        "x": new_x, "y": new_y, "w": new_w, "h": new_h,
                    })

        return item_changes, obj_changes

    # ──────────────────────────────────
    # User-drawn element extraction
    # ──────────────────────────────────

    def extract_user_drawn(
        self,
        elements: list[dict],
        managed_ids: set[str] = None,
    ) -> list[dict]:
        kept = []
        skip_ids = managed_ids or set()

        for el in elements:
            if el.get("isDeleted"):
                continue
            eid = el.get("id", "")
            if eid in skip_ids:
                continue
            custom = el.get("customData")
            if isinstance(custom, dict) and custom.get("type") in MANAGED_TYPES:
                continue
            kept.append(el)
        return kept

    def collect_managed_ids(
        self,
        items: list[dict],
        objects: list[dict],
    ) -> set[str]:
        ids = set()
        for item in items:
            nid = item["id"]
            ids.update({
                f"note-title-{nid}", f"note-summary-{nid}",
                # Legacy
                f"note-frame-{nid}", f"note-accent-{nid}", f"note-tags-{nid}",
                f"note-text-{nid}", f"note-body-{nid}", f"note-divider-{nid}",
            })
        for obj in objects:
            oid = str(obj.get("id", ""))
            kind = obj.get("kind")
            if kind == "text":
                ids.add(oid)
            elif kind == "sticky":
                ids.add(f"{oid}-bg")
                ids.add(f"{oid}-text")
        return ids

    # ──────────────────────────────────
    # Full scene build (source of truth → Excalidraw)
    # ──────────────────────────────────

    def build_scene(
        self,
        items: list[dict],
        placements: list[dict],
        objects: list[dict],
        user_drawn: list[dict],
        theme: str = "dark",
        background: str = None,
    ) -> dict:
        reset_index_counter()

        bg = background or ("#0e0e1a" if theme == "dark" else "#ffffff")
        scene: dict = {
            "elements": [],
            "appState": {"viewBackgroundColor": bg, "theme": theme},
            "files": {},
        }

        managed_ids = self.collect_managed_ids(items, objects)

        # 1. User-drawn elements (filtered against managed)
        for el in user_drawn:
            eid = el.get("id", "")
            if eid in managed_ids:
                continue
            custom = el.get("customData")
            if isinstance(custom, dict) and custom.get("type") in MANAGED_TYPES:
                continue
            scene["elements"].append(el)

        # 2. Canvas objects (text, stickies, diagrams)
        col_width = settings.sheet_width - settings.sheet_margin * 2
        for obj in objects:
            kind = obj.get("kind")
            data = obj.get("meta") or {}
            content = obj.get("content") or ""
            x = float(obj.get("x") or 0)
            y = float(obj.get("y") or 0)
            w = float(obj.get("w") or 500)

            if kind == "sticky":
                self._add_sticky(scene, content, x, y,
                                 bg_color=data.get("color", "#fef08a"),
                                 sticky_id=str(obj.get("id")))
            elif kind == "text":
                self._add_text(scene, content, x, y,
                               max_width=min(w, col_width),
                               element_id=str(obj.get("id")))
            elif kind == "diagram":
                topology = data.get("topology")
                if topology:
                    self._add_diagram(scene, topology, x, y, w)

        # 3. Note cards
        place_map = {p["item_id"]: p for p in placements}
        for item in items:
            p = place_map.get(item["id"])
            if not p:
                continue
            self._upsert_note_card(
                scene, item, p["x"], p["y"], p.get("w"), p.get("h"),
            )

        # 4. Deduplicate — last element with a given ID wins
        seen: dict[str, int] = {}
        final = []
        for el in scene["elements"]:
            eid = el.get("id")
            if eid and eid in seen:
                final[seen[eid]] = None  # type: ignore
            if eid:
                seen[eid] = len(final)
            final.append(el)
        scene["elements"] = [el for el in final if el is not None]

        return scene

    # ── Internal builders ──

    def _upsert_note_card(self, scene, note, x, y, width=None, height=None):
        col_width = settings.sheet_width - settings.sheet_margin * 2
        w = min(width or col_width, col_width)
        h = height or settings.card_h
        f = self.factory(scene)
        remove_elements_by_custom(scene, "noteId", note["id"])
        elements, _ = f.note_card(note, float(settings.sheet_margin), y, w, h)
        scene["elements"].extend(elements)

    def _add_text(self, scene, text, x, y, *, max_width=500, element_id=None):
        f = self.factory(scene)
        bg = get_background(scene)
        color = f.contrast_text_color(bg)
        col_width = settings.sheet_width - settings.sheet_margin * 2
        el = f.text(
            text, x, y,
            id=element_id,
            font_size=16, max_width=min(max_width, col_width),
            color=color,
            custom_data={"type": "composed-text"},
        )
        scene["elements"].append(el)

    def _add_sticky(self, scene, content, x, y, bg_color="#fef08a", sticky_id=None):
        f = self.factory(scene)
        elements, _ = f.sticky_note(content, x, y, bg_color=bg_color, id=sticky_id)
        scene["elements"].extend(elements)

    def _add_diagram(self, scene, topology, x, y, w):
        f = self.factory(scene)
        col_width = settings.sheet_width - settings.sheet_margin * 2
        max_w = min(w, col_width) if w and w > 0 else col_width

        elements, bbox = diagram_layout.layout_diagram(
            topology, 0, 0, f, max_width=max_w,
        )
        if not elements:
            return

        # Center diagram in column
        diag_w = bbox["width"]
        if diag_w < col_width:
            target_x = settings.sheet_margin + (col_width - diag_w) / 2
        else:
            target_x = x if x else settings.sheet_margin

        dx = target_x - bbox["x"]
        dy = y - bbox["y"]
        for el in elements:
            el["x"] = el.get("x", 0) + dx
            el["y"] = el.get("y", 0) + dy

        scene["elements"].extend(elements)

    # ── Diagram wrapper for handlers ──

    def add_diagram(self, scene, topology, x, y, max_width=None):
        f = self.factory(scene)
        col_width = settings.sheet_width - settings.sheet_margin * 2
        elements, bbox = diagram_layout.layout_diagram(
            topology, x, y, f, max_width=max_width or col_width,
        )
        scene["elements"].extend(elements)
        return scene, bbox

    def add_sticky(self, scene, content, x, y, bg_color="#fef08a", id=None):
        self._add_sticky(scene, content, x, y, bg_color=bg_color, sticky_id=id)
        return scene, "ok"

    def add_text(self, scene, text, x, y, *, font_size=16, max_width=500,
                 element_id=None, color=None):
        self._add_text(scene, text, x, y, max_width=max_width, element_id=element_id)
        el = scene["elements"][-1]
        return scene, {"width": el["width"], "height": el["height"]}, el["id"]

    # ── Theme ──

    def set_theme(self, scene: dict, theme: str) -> dict:
        bg = "#0e0e1a" if theme == "dark" else "#ffffff"
        scene.setdefault("appState", {})
        scene["appState"]["theme"] = theme
        scene["appState"]["viewBackgroundColor"] = bg
        self._factory_cache.clear()
        return scene

    def set_background(self, scene: dict, color: str) -> dict:
        scene.setdefault("appState", {})
        scene["appState"]["viewBackgroundColor"] = color
        scene["appState"]["theme"] = "dark" if _luminance(color) < 0.4 else "light"
        self._factory_cache.clear()
        return scene

    # ── Analysis ──

    def analyze(self, scene: dict) -> dict:
        return {
            "theme": get_theme(scene),
            "background": get_background(scene),
            "layout_pattern": detect_layout_pattern(scene),
            "density": compute_density(scene),
            "bounds": compute_bounds(scene),
            "palette": extract_palette(scene),
            "element_count": len([e for e in scene.get("elements", [])
                                  if not e.get("isDeleted")]),
        }


# ── Singleton ──
scene_builder = SceneBuilder()

# Backward-compatible aliases (remove these once all imports updated)
scene_manager = scene_builder
canvas_renderer = scene_builder
SceneManager = SceneBuilder