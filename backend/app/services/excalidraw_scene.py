from __future__ import annotations

import random
import textwrap
import time
from copy import deepcopy
from typing import Any

from app.db.supabase import db
from app.services.text_layout import layout_single_text

CARD_WIDTH = 360
CARD_HEIGHT = 240
DEFAULT_BG = "#0e0e1a"
DEFAULT_THEME = "dark"


def _luminance(hex_color: str) -> float:
    """Compute relative luminance of a hex color (0=black, 1=white)"""
    h = hex_color.lstrip("#")
    if len(h) < 6:
        h = "".join(c * 2 for c in h[:3])
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    to_linear = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * to_linear(r) + 0.7152 * to_linear(g) + 0.0722 * to_linear(b)


def _is_dark_bg(scene: dict) -> bool:
    bg = (scene.get("appState") or {}).get("viewBackgroundColor", DEFAULT_BG)
    return _luminance(bg) < 0.4

def get_font_string(font_size: int, font_family: int) -> str:
    family = "Virgil"
    if font_family == 2: family = "Helvetica"
    elif font_family == 3: family = "Cascadia"
    elif font_family == 4: family = "Assistant"
    return f'{font_size}px "{family}"'



def empty_scene() -> dict:
    return {
        "elements": [],
        "appState": {
            "viewBackgroundColor": DEFAULT_BG,
            "theme": DEFAULT_THEME,
        },
        "files": {},
    }


def normalize_scene(scene: Any) -> dict:
    if not isinstance(scene, dict):
        return empty_scene()

    normalized = empty_scene()
    normalized["elements"] = scene.get("elements") if isinstance(scene.get("elements"), list) else []
    normalized["files"] = scene.get("files") if isinstance(scene.get("files"), dict) else {}

    app_state = scene.get("appState") if isinstance(scene.get("appState"), dict) else {}
    view_bg = app_state.get("viewBackgroundColor") if isinstance(app_state.get("viewBackgroundColor"), str) else DEFAULT_BG
    theme = app_state.get("theme")
    if theme not in {"dark", "light"}:
        theme = "dark" if _luminance(view_bg) < 0.4 else "light"

    normalized["appState"] = {
        **normalized["appState"],
        **app_state,
        "viewBackgroundColor": view_bg,
        "theme": theme,
    }
    return normalized


async def sync_note_to_canvas(page_id: str, note: dict, x: float | None = None, y: float | None = None) -> dict:
    page = await db.get_page(page_id)
    scene = normalize_scene(page.get("canvas_data") if page else None)
    upsert_note_card(scene, note, x=x, y=y)
    await db.update_page(page_id, canvas_data=scene)
    return scene


async def sync_page_notes_to_canvas(page_id: str) -> dict:
    page = await db.get_page(page_id)
    scene = normalize_scene(page.get("canvas_data") if page else None)
    notes = await db.get_notes_for_page(page_id)

    for index, note in enumerate(reversed(notes)):
        x = note.get("canvas_x")
        y = note.get("canvas_y")
        if x is None or y is None:
            col = index % 3
            row = index // 3
            x = 100 + col * 420
            y = 100 + row * 350
        upsert_note_card(scene, note, x=float(x), y=float(y))

    await db.update_page(page_id, canvas_data=scene)
    return scene


async def remove_note_from_canvas(page_id: str, note_id: str) -> dict:
    page = await db.get_page(page_id)
    scene = normalize_scene(page.get("canvas_data") if page else None)
    scene["elements"] = [
        element
        for element in scene["elements"]
        if _custom_data(element).get("noteId") != note_id
    ]
    await db.update_page(page_id, canvas_data=scene)
    return scene


async def add_sticky_to_canvas(
    page_id: str,
    content: str,
    x: float = 100,
    y: float = 100,
    legacy_element_id: str | None = None,
) -> dict:
    page = await db.get_page(page_id)
    scene = normalize_scene(page.get("canvas_data") if page else None)
    scene["elements"].extend(create_sticky_elements(content, x, y, legacy_element_id=legacy_element_id))
    await db.update_page(page_id, canvas_data=scene)
    return scene


def upsert_note_card(scene: dict, note: dict, x: float | None = None, y: float | None = None) -> None:
    note_id = note["id"]
    elements = scene.setdefault("elements", [])
    existing = [element for element in elements if _custom_data(element).get("noteId") == note_id]

    if existing:
        if x is not None and y is not None:
            frame = next((element for element in existing if _custom_data(element).get("type") == "note-frame"), existing[0])
            dx = (x - 12) - float(frame.get("x", x - 12))
            dy = (y - 12) - float(frame.get("y", y - 12))
            for element in existing:
                element["x"] = float(element.get("x", 0)) + dx
                element["y"] = float(element.get("y", 0)) + dy

        _update_text(elements, f"note-title-{note_id}", note.get("title") or "Untitled")
        
        sum_text = note.get("summary") or note.get("raw_text") or ""
        sum_layout = layout_single_text(sum_text, get_font_string(13, 1), 336, 6, 13 * 1.25)
        _update_text(elements, f"note-summary-{note_id}", sum_layout.get("wrapped_text", sum_text), sum_layout.get("width"), sum_layout.get("height"))
        
        _update_text(elements, f"note-tags-{note_id}", "  ".join(f"#{tag}" for tag in (note.get("tags") or [])))
        return

    index = len([element for element in elements if _custom_data(element).get("type") == "note-frame"])
    if x is None or y is None:
        col = index % 3
        row = index // 3
        x = 100 + col * 420
        y = 100 + row * 350

    elements.extend(create_note_card_elements(note, float(x), float(y), dark=_is_dark_bg(scene)))


def create_note_card_elements(note: dict, x: float, y: float, dark: bool = True) -> list[dict]:
    note_id = note["id"]
    group_id = f"note-group-{note_id}"
    tags = note.get("tags") or []
    now = int(time.time() * 1000)

    # Context-aware colors
    accent_color = "#818cf8" if dark else "#6366f1"
    card_bg = "#1e1e2e" if dark else "#ffffff"
    card_border = "#374151" if dark else "#e5e7eb"
    title_color = "#f3f4f6" if dark else "#111827"
    summary_color = "#9ca3af" if dark else "#6b7280"

    elements = [
        _base_element(
            id=f"note-frame-{note_id}",
            type="rectangle",
            x=x - 12,
            y=y - 12,
            width=CARD_WIDTH,
            height=CARD_HEIGHT,
            strokeColor=card_border,
            backgroundColor=card_bg,
            fillStyle="solid",
            strokeWidth=1,
            roundness={"type": 3, "value": 10},
            groupIds=[group_id],
            customData={"noteId": note_id, "type": "note-frame"},
            updated=now,
        ),
        _text_element(
            id=f"note-title-{note_id}",
            x=x,
            y=y,
            text=note.get("title") or "Untitled",
            fontSize=18,
            fontFamily=1,
            strokeColor=title_color,
            groupIds=[group_id],
            customData={"noteId": note_id, "type": "note-title", "title": note.get("title") or "Untitled"},
            updated=now,
        ),
        _text_element(
            id=f"note-summary-{note_id}",
            x=x,
            y=y + 32,
            text=note.get("summary") or note.get("raw_text") or "",
            maxWidth=336,
            maxLines=6,
            fontSize=13,
            fontFamily=1,
            strokeColor=summary_color,
            groupIds=[group_id],
            customData={"noteId": note_id, "type": "note-summary"},
            updated=now,
        ),
        _line_element(
            id=f"note-accent-{note_id}",
            x=x - 12,
            y=y - 12,
            points=[[0, 0], [0, CARD_HEIGHT]],
            strokeColor=accent_color,
            strokeWidth=3,
            groupIds=[group_id],
            customData={"noteId": note_id, "type": "note-accent"},
            updated=now,
        ),
    ]

    if tags:
        elements.append(
            _text_element(
                id=f"note-tags-{note_id}",
                x=x,
                y=y + 182,
                text="  ".join(f"#{tag}" for tag in tags),
                fontSize=11,
                fontFamily=3,
                strokeColor=accent_color,
                groupIds=[group_id],
                customData={"noteId": note_id, "type": "note-tags", "tags": tags},
                updated=now,
            )
        )

    return elements


def create_sticky_elements(
    content: str,
    x: float,
    y: float,
    color: str = "#fef08a",
    legacy_element_id: str | None = None,
) -> list[dict]:
    sticky_id = legacy_element_id or f"sticky-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
    group_id = f"sticky-group-{sticky_id}"
    custom = {"type": "sticky-bg"}
    if legacy_element_id:
        custom["legacyElementId"] = legacy_element_id

    return [
        _base_element(
            id=f"{sticky_id}-bg",
            type="rectangle",
            x=x,
            y=y,
            width=180,
            height=160,
            strokeColor="transparent",
            backgroundColor=color,
            fillStyle="solid",
            roundness={"type": 3, "value": 4},
            groupIds=[group_id],
            customData=custom,
        ),
        _text_element(
            id=f"{sticky_id}-text",
            x=x + 12,
            y=y + 12,
            text=content,
            maxWidth=156,
            maxLines=6,
            fontSize=16,
            fontFamily=4,
            strokeColor="#78350f",
            groupIds=[group_id],
            customData={"type": "sticky-text", "legacyElementId": legacy_element_id},
        ),
    ]


def _base_element(**overrides: Any) -> dict:
    element = {
        "id": _element_id(),
        "type": "rectangle",
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100,
        "angle": 0,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent",
        "fillStyle": "hachure",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": None,
        "roundness": None,
        "seed": random.randint(1, 2_147_483_647),
        "version": 1,
        "versionNonce": random.randint(1, 2_147_483_647),
        "isDeleted": False,
        "boundElements": None,
        "updated": int(time.time() * 1000),
        "link": None,
        "locked": False,
        "customData": {},
    }
    element.update(overrides)
    return element


def _text_element(**overrides: Any) -> dict:
    original_text = str(overrides.get("text", ""))
    font_size = overrides.get("fontSize", 16)
    font_family = overrides.get("fontFamily", 1)
    
    max_width = overrides.pop("maxWidth", 1000)
    max_lines = overrides.pop("maxLines", 100)
    line_height_px = font_size * 1.25
    
    layout = layout_single_text(original_text, get_font_string(font_size, font_family), max_width, max_lines, line_height_px)
    
    element = _base_element(
        type="text",
        width=layout.get("width", 100),
        height=layout.get("height", 100),
        backgroundColor="transparent",
        fillStyle="solid",
        strokeWidth=1,
        roundness=None,
        boundElements=None,
        containerId=None,
        originalText=original_text,
        autoResize=True,
        lineHeight=1.25,
        textAlign="left",
        verticalAlign="top",
    )
    overrides["text"] = layout.get("wrapped_text", original_text)
    element.update(overrides)
    element["originalText"] = original_text
    return element


def _line_element(**overrides: Any) -> dict:
    element = _base_element(
        type="line",
        width=0,
        height=CARD_HEIGHT,
        backgroundColor="transparent",
        fillStyle="solid",
        roundness=None,
        points=[[0, 0], [0, CARD_HEIGHT]],
        lastCommittedPoint=None,
        startBinding=None,
        endBinding=None,
        startArrowhead=None,
        endArrowhead=None,
    )
    element.update(overrides)
    return element


def _update_text(elements: list[dict], element_id: str, text: str, width: float = None, height: float = None) -> None:
    element = next((item for item in elements if item.get("id") == element_id), None)
    if not element:
        return

    element["text"] = text
    element["originalText"] = text
    if width is not None: element["width"] = width
    if height is not None: element["height"] = height
    element["version"] = int(element.get("version") or 1) + 1
    element["versionNonce"] = random.randint(1, 2_147_483_647)
    element["updated"] = int(time.time() * 1000)


def _custom_data(element: dict) -> dict:
    custom = element.get("customData")
    return custom if isinstance(custom, dict) else {}


def _wrap(text: str, chars_per_line: int, max_lines: int) -> str:
    # Deprecated fallback wrapper
    text = " ".join(str(text or "").split())
    if not text:
        return ""

    lines = textwrap.wrap(text, width=chars_per_line)[:max_lines]
    if len(textwrap.wrap(text, width=chars_per_line)) > max_lines:
        lines[-1] = f"{lines[-1]}..."
    return "\n".join(lines)


def _element_id() -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alphabet) for _ in range(21))


def clone_scene(scene: dict) -> dict:
    return deepcopy(normalize_scene(scene))
