# === FILE: backend/app/services/scene_manager.py (COMPLETE TOP — prepend to class) ===
"""
Scene Manager — single authority for all Excalidraw scene mutations.
Every scene write goes through here. After every save, visual context is updated.
"""

from __future__ import annotations
import random
import time
import logging
from typing import Any

from app.db.supabase import db
from app.services import cache as cache_svc
from app.services.text_layout import layout_single_text, get_font_string

logger = logging.getLogger("mnemos.scene_manager")

DEFAULT_BG = "#0e0e1a"
CARD_WIDTH = 360
CARD_HEIGHT = 240


def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) < 6:
        h = "".join(c * 2 for c in h[:3])
    try:
        r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    except (ValueError, IndexError):
        return 0.1
    to_linear = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * to_linear(r) + 0.7152 * to_linear(g) + 0.0722 * to_linear(b)


def normalize_scene(scene: dict | None) -> dict:
    """Ensure scene has required structure."""
    if not scene or not isinstance(scene, dict):
        return {"elements": [], "appState": {"viewBackgroundColor": DEFAULT_BG, "theme": "dark"}, "files": {}}
    result = {
        "elements": scene.get("elements") if isinstance(scene.get("elements"), list) else [],
        "appState": {"viewBackgroundColor": DEFAULT_BG, "theme": "dark"},
        "files": scene.get("files") if isinstance(scene.get("files"), dict) else {},
    }
    app_state = scene.get("appState") if isinstance(scene.get("appState"), dict) else {}
    view_bg = app_state.get("viewBackgroundColor") if isinstance(app_state.get("viewBackgroundColor"), str) else DEFAULT_BG
    theme = app_state.get("theme")
    if theme not in ("dark", "light"):
        theme = "dark" if _luminance(view_bg) < 0.4 else "light"
    result["appState"] = {**result["appState"], **app_state, "viewBackgroundColor": view_bg, "theme": theme}
    return result


def _contrast_text_color(bg_hex: str) -> str:
    bg_l = _luminance(bg_hex)
    light_ratio = (max(_luminance("#f9fafb"), bg_l) + 0.05) / (min(_luminance("#f9fafb"), bg_l) + 0.05)
    dark_ratio = (max(_luminance("#111827"), bg_l) + 0.05) / (min(_luminance("#111827"), bg_l) + 0.05)
    return "#f9fafb" if light_ratio >= dark_ratio else "#111827"


def _is_dark(scene: dict) -> bool:
    bg = (scene.get("appState") or {}).get("viewBackgroundColor", DEFAULT_BG)
    return _luminance(bg) < 0.4


def _element_id() -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alphabet) for _ in range(21))


def _base_element(**overrides: Any) -> dict:
    el = {
        "id": _element_id(), "type": "rectangle",
        "x": 0, "y": 0, "width": 100, "height": 100, "angle": 0,
        "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
        "fillStyle": "hachure", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": None, "seed": random.randint(1, 2_147_483_647),
        "version": 1, "versionNonce": random.randint(1, 2_147_483_647),
        "isDeleted": False, "boundElements": None,
        "updated": int(time.time() * 1000), "link": None, "locked": False,
        "customData": {},
    }
    el.update(overrides)
    return el


def _text_element(**overrides: Any) -> dict:
    original_text = str(overrides.get("text", ""))
    font_size = overrides.get("fontSize", 16)
    font_family = overrides.get("fontFamily", 1)
    max_width = overrides.pop("maxWidth", 1000)
    max_lines = overrides.pop("maxLines", 100)
    line_height_px = font_size * 1.25
    layout = layout_single_text(original_text, get_font_string(font_size, font_family), max_width, max_lines, line_height_px)
    el = _base_element(
        type="text",
        width=layout.get("width", 100), height=layout.get("height", 100),
        backgroundColor="transparent", fillStyle="solid",
        strokeWidth=1, roundness=None, boundElements=None,
        containerId=None, originalText=original_text,
        autoResize=True, lineHeight=1.25,
        textAlign="left", verticalAlign="top",
    )
    overrides["text"] = layout.get("wrapped_text", original_text)
    el.update(overrides)
    el["originalText"] = original_text
    return el


def _line_element(**overrides: Any) -> dict:
    el = _base_element(
        type="line", width=0, height=CARD_HEIGHT,
        backgroundColor="transparent", fillStyle="solid", roundness=None,
        points=[[0, 0], [0, CARD_HEIGHT]],
        lastCommittedPoint=None, startBinding=None, endBinding=None,
        startArrowhead=None, endArrowhead=None,
    )
    el.update(overrides)
    return el


def _update_text_in_scene(elements: list[dict], element_id: str, text: str, width: float = None, height: float = None) -> None:
    el = next((item for item in elements if item.get("id") == element_id), None)
    if not el:
        return
    el["text"] = text
    el["originalText"] = text
    if width is not None:
        el["width"] = width
    if height is not None:
        el["height"] = height
    el["version"] = int(el.get("version") or 1) + 1
    el["versionNonce"] = random.randint(1, 2_147_483_647)
    el["updated"] = int(time.time() * 1000)


def _custom_data(element: dict) -> dict:
    custom = element.get("customData")
    return custom if isinstance(custom, dict) else {}


# ── Lazy import to avoid circular dependency ──
def _get_visual_analyzer():
    from app.services.visual_analyzer import visual_analyzer
    return visual_analyzer


class SceneManager:
    """
    All scene mutations go through here.
    Scene is loaded from page_scenes table, modified, saved back.
    After every save, visual context is updated.
    """

    async def get_scene(self, page_id: str) -> dict:
        scene = await db.get_scene(page_id)
        return normalize_scene(scene)

    async def save_scene(self, page_id: str, scene: dict) -> dict:
        """Save scene and trigger visual analysis + registry sync."""
        normalized = normalize_scene(scene)
        await db.save_scene(page_id, normalized)
        await cache_svc.invalidate_scene(page_id)

        # Async visual analysis
        try:
            analyzer = _get_visual_analyzer()
            await analyzer.analyze_and_persist(page_id, normalized)
            await analyzer.sync_element_registry(page_id, normalized)
        except Exception as e:
            logger.warning(f"Visual analysis after save failed: {e}")

        return normalized

    async def get_visual_context(self, page_id: str) -> dict | None:
        """Get cached visual context, or analyze on the fly."""
        ctx = await db.get_visual_context(page_id)
        if ctx:
            return ctx
        # Generate on first access
        scene = await self.get_scene(page_id)
        try:
            analyzer = _get_visual_analyzer()
            result = await analyzer.analyze_and_persist(page_id, scene)
            return result.model_dump()
        except Exception:
            return None

    # ── Note Card Operations ──
    # (rest of the class continues as already provided above)

    async def upsert_note_card(self, page_id: str, note: dict, x: float, y: float) -> dict:
        scene = await self.get_scene(page_id)
        self._upsert_note_card_elements(scene, note, x, y)
        return await self.save_scene(page_id, scene)

    async def remove_note_card(self, page_id: str, note_id: str) -> dict:
        scene = await self.get_scene(page_id)
        scene["elements"] = [el for el in scene["elements"] if _custom_data(el).get("noteId") != note_id]
        return await self.save_scene(page_id, scene)

    async def sync_all_notes(self, page_id: str) -> dict:
        scene = await self.get_scene(page_id)
        notes = await db.get_notes_for_page(page_id)

        from app.config import settings as cfg
        for idx, note in enumerate(reversed(notes)):
            pos = await db.get_note_position(page_id, note["id"])
            if pos and pos.get("x") is not None:
                x, y = float(pos["x"]), float(pos["y"])
            else:
                col = idx % 3
                row = idx // 3
                x = 100 + col * cfg.card_spacing_x
                y = 100 + row * cfg.card_spacing_y
            self._upsert_note_card_elements(scene, note, x, y)

        return await self.save_scene(page_id, scene)

    async def add_text_block(
        self, page_id: str, text: str, x: float, y: float,
        font_size: int = 16, max_width: float = 400,
        color: str = None, element_id: str = None,
    ) -> tuple[dict, dict]:
        from app.services.element_layout import measure_text

        measurement = measure_text(text, font_size=font_size, font_family=1, max_width=max_width)
        scene = await self.get_scene(page_id)
        bg = (scene.get("appState") or {}).get("viewBackgroundColor", DEFAULT_BG)
        text_color = color or _contrast_text_color(bg)

        el = _text_element(
            id=element_id or _element_id(),
            x=x, y=y, text=measurement["wrapped_text"],
            fontSize=font_size, fontFamily=1, maxWidth=max_width, maxLines=200,
            strokeColor=text_color,
            customData={"type": "composed-text"},
        )
        el["width"] = measurement["width"]
        el["height"] = measurement["height"]
        scene["elements"].append(el)

        saved = await self.save_scene(page_id, scene)
        return saved, measurement

    async def add_diagram(self, page_id: str, topology: dict, x: float, y: float) -> dict:
        from app.services.element_layout import layout_diagram_topology

        scene = await self.get_scene(page_id)
        dark = _is_dark(scene)
        positioned, arrows = layout_diagram_topology(topology, x, y)

        STYLE_COLORS = {
            "dark": {
                "default": {"bg": "#1e1e2e", "border": "#374151", "text": "#e5e7eb"},
                "accent": {"bg": "#312e81", "border": "#6366f1", "text": "#c7d2fe"},
                "muted": {"bg": "#1f2937", "border": "#4b5563", "text": "#9ca3af"},
                "warning": {"bg": "#431407", "border": "#ea580c", "text": "#fed7aa"},
                "success": {"bg": "#052e16", "border": "#16a34a", "text": "#bbf7d0"},
            },
            "light": {
                "default": {"bg": "#ffffff", "border": "#e5e7eb", "text": "#1f2937"},
                "accent": {"bg": "#eef2ff", "border": "#6366f1", "text": "#312e81"},
                "muted": {"bg": "#f9fafb", "border": "#d1d5db", "text": "#6b7280"},
                "warning": {"bg": "#fff7ed", "border": "#ea580c", "text": "#7c2d12"},
                "success": {"bg": "#f0fdf4", "border": "#16a34a", "text": "#14532d"},
            },
        }
        theme_key = "dark" if dark else "light"

        for p in positioned:
            style = p.metadata.get("style", "default")
            colors = STYLE_COLORS.get(theme_key, STYLE_COLORS["dark"]).get(style, STYLE_COLORS["dark"]["default"])
            group_id = f"diagram-{p.id}"

            if p.element_type in ("box", "text"):
                scene["elements"].append(_base_element(
                    id=f"{p.id}-rect", type="rectangle",
                    x=p.x, y=p.y, width=p.width, height=p.height,
                    strokeColor=colors["border"], backgroundColor=colors["bg"],
                    fillStyle="solid", strokeWidth=2, roughness=0,
                    roundness={"type": 3, "value": 8},
                    groupIds=[group_id],
                    customData={"type": "diagram-node", "diagramId": p.id},
                ))
                label_w = p.metadata.get("label_width", p.width - 24)
                label_h = p.metadata.get("label_height", 20)
                scene["elements"].append(_base_element(
                    id=f"{p.id}-text", type="text",
                    x=p.x + (p.width - label_w) / 2, y=p.y + (p.height - label_h) / 2,
                    width=label_w, height=label_h,
                    strokeColor=colors["text"], backgroundColor="transparent",
                    fillStyle="solid", strokeWidth=1, roughness=0,
                    groupIds=[group_id],
                    customData={"type": "diagram-label", "diagramId": p.id},
                    text=p.content, originalText=p.content,
                    fontSize=16, fontFamily=1, textAlign="center", verticalAlign="middle",
                    lineHeight=1.25, containerId=None, autoResize=True,
                ))

        for arrow in arrows:
            sx, sy = arrow["from_x"], arrow["from_y"]
            ex, ey = arrow["to_x"], arrow["to_y"]
            stroke_style = {"dashed": "dashed", "dotted": "dotted"}.get(arrow.get("style"), "solid")
            scene["elements"].append(_base_element(
                id=f"arrow-{arrow['from_id']}-{arrow['to_id']}",
                type="arrow", x=sx, y=sy,
                width=ex - sx, height=ey - sy,
                strokeColor="#6b7280" if dark else "#9ca3af",
                backgroundColor="transparent", fillStyle="solid",
                strokeWidth=2, strokeStyle=stroke_style, roughness=0,
                points=[[0, 0], [ex - sx, ey - sy]],
                startArrowhead=None, endArrowhead="arrow",
                startBinding=None, endBinding=None, lastCommittedPoint=None,
                customData={"type": "diagram-arrow"},
            ))

        return await self.save_scene(page_id, scene)

    async def add_sticky(self, page_id: str, content: str, x: float, y: float, color: str = "#fef08a") -> dict:
        scene = await self.get_scene(page_id)
        sticky_id = f"sticky-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
        group_id = f"sticky-group-{sticky_id}"
        scene["elements"].extend([
            _base_element(
                id=f"{sticky_id}-bg", type="rectangle",
                x=x, y=y, width=180, height=160,
                strokeColor="transparent", backgroundColor=color,
                fillStyle="solid", roundness={"type": 3, "value": 4},
                groupIds=[group_id], customData={"type": "sticky-bg"},
            ),
            _text_element(
                id=f"{sticky_id}-text", x=x + 12, y=y + 12,
                text=content, maxWidth=156, maxLines=6,
                fontSize=16, fontFamily=4, strokeColor="#78350f",
                groupIds=[group_id], customData={"type": "sticky-text"},
            ),
        ])
        return await self.save_scene(page_id, scene)

    async def set_background(self, page_id: str, color: str) -> dict:
        scene = await self.get_scene(page_id)
        app_state = scene.get("appState") or {}
        app_state["viewBackgroundColor"] = color
        app_state["theme"] = "dark" if _luminance(color) < 0.4 else "light"
        scene["appState"] = app_state
        return await self.save_scene(page_id, scene)

    # ── Internal helpers ──

    def _upsert_note_card_elements(self, scene: dict, note: dict, x: float, y: float) -> None:
        note_id = note["id"]
        elements = scene.setdefault("elements", [])
        existing = [el for el in elements if _custom_data(el).get("noteId") == note_id]

        if existing:
            frame = next((el for el in existing if _custom_data(el).get("type") == "note-frame"), existing[0])
            dx = (x - 12) - float(frame.get("x", x - 12))
            dy = (y - 12) - float(frame.get("y", y - 12))
            for el in existing:
                el["x"] = float(el.get("x", 0)) + dx
                el["y"] = float(el.get("y", 0)) + dy
            _update_text_in_scene(elements, f"note-title-{note_id}", note.get("title") or "Untitled")
            sum_text = note.get("summary") or note.get("raw_text") or ""
            sum_layout = layout_single_text(sum_text, get_font_string(13, 1), 336, 6, 13 * 1.25)
            _update_text_in_scene(elements, f"note-summary-{note_id}", sum_layout.get("wrapped_text", sum_text),
                                  sum_layout.get("width"), sum_layout.get("height"))
            _update_text_in_scene(elements, f"note-tags-{note_id}",
                                  "  ".join(f"#{tag}" for tag in (note.get("tags") or [])))
            return

        dark = _is_dark(scene)
        now = int(time.time() * 1000)
        group_id = f"note-group-{note_id}"
        tags = note.get("tags") or []

        accent = "#818cf8" if dark else "#6366f1"
        card_bg = "#1e1e2e" if dark else "#ffffff"
        card_border = "#374151" if dark else "#e5e7eb"
        title_color = "#f3f4f6" if dark else "#111827"
        summary_color = "#9ca3af" if dark else "#6b7280"

        elements.extend([
            _base_element(
                id=f"note-frame-{note_id}", type="rectangle",
                x=x - 12, y=y - 12, width=CARD_WIDTH, height=CARD_HEIGHT,
                strokeColor=card_border, backgroundColor=card_bg,
                fillStyle="solid", strokeWidth=1,
                roundness={"type": 3, "value": 10},
                groupIds=[group_id],
                customData={"noteId": note_id, "type": "note-frame"},
                updated=now,
            ),
            _text_element(
                id=f"note-title-{note_id}", x=x, y=y,
                text=note.get("title") or "Untitled",
                fontSize=18, fontFamily=1, strokeColor=title_color,
                groupIds=[group_id],
                customData={"noteId": note_id, "type": "note-title"},
                updated=now,
            ),
            _text_element(
                id=f"note-summary-{note_id}", x=x, y=y + 32,
                text=note.get("summary") or note.get("raw_text") or "",
                maxWidth=336, maxLines=6, fontSize=13, fontFamily=1,
                strokeColor=summary_color, groupIds=[group_id],
                customData={"noteId": note_id, "type": "note-summary"},
                updated=now,
            ),
            _line_element(
                id=f"note-accent-{note_id}", x=x - 12, y=y - 12,
                points=[[0, 0], [0, CARD_HEIGHT]],
                strokeColor=accent, strokeWidth=3,
                groupIds=[group_id],
                customData={"noteId": note_id, "type": "note-accent"},
                updated=now,
            ),
        ])
        if tags:
            elements.append(_text_element(
                id=f"note-tags-{note_id}", x=x, y=y + 182,
                text="  ".join(f"#{tag}" for tag in tags),
                fontSize=11, fontFamily=3, strokeColor=accent,
                groupIds=[group_id],
                customData={"noteId": note_id, "type": "note-tags"},
                updated=now,
            ))


scene_manager = SceneManager()