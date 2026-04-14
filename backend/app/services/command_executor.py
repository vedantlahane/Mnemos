# === FILE: backend/app/services/command_executor.py ===
"""
Canvas command executor — handles direct canvas state changes.
Background, theme, zoom, find, delete, etc.
"""

from __future__ import annotations
import logging
from typing import AsyncIterator

from app.models.canvas_ops import CanvasOp, OpType, Viewport
from app.db.supabase import db
from app.services.canvas_state import canvas_state

logger = logging.getLogger("mnemos.commands")


async def execute_command(
    sub_intent: str,
    meta: dict,
    page_id: str,
    viewport: Viewport | None = None,
) -> AsyncIterator[CanvasOp]:
    """Execute a canvas command, yielding operations."""
    handler = _HANDLERS.get(sub_intent)
    if handler:
        async for op in handler(meta, page_id, viewport):
            yield op
    else:
        yield CanvasOp(
            op=OpType.ERROR,
            message=f"Unknown command: {sub_intent}",
        )


async def _set_background(meta: dict, page_id: str, viewport: Viewport | None) -> AsyncIterator[CanvasOp]:
    color = meta.get("color", "#0e0e1a")

    # Update DB
    page = await db.get_page(page_id)
    if page:
        canvas_data = page.get("canvas_data") or {}
        app_state = canvas_data.get("appState") or {}
        app_state["viewBackgroundColor"] = color
        # Auto-adjust theme
        from app.services.excalidraw_scene import _luminance
        if _luminance(color) < 0.4:
            app_state["theme"] = "dark"
        else:
            app_state["theme"] = "light"
        canvas_data["appState"] = app_state
        await db.update_page(page_id, canvas_data=canvas_data)

    yield CanvasOp(
        op=OpType.SET_BACKGROUND,
        color=color,
        message=f"Background changed to {color}",
    )

    # Also emit theme if it changed
    if page:
        yield CanvasOp(
            op=OpType.SET_THEME,
            theme=app_state.get("theme", "dark"),
        )


async def _set_theme(meta: dict, page_id: str, viewport: Viewport | None) -> AsyncIterator[CanvasOp]:
    theme = meta.get("theme", "dark")
    colors = {
        "dark": "#0e0e1a",
        "light": "#ffffff",
    }
    bg = colors.get(theme, "#0e0e1a")

    page = await db.get_page(page_id)
    if page:
        canvas_data = page.get("canvas_data") or {}
        app_state = canvas_data.get("appState") or {}
        app_state["theme"] = theme
        app_state["viewBackgroundColor"] = bg
        canvas_data["appState"] = app_state
        await db.update_page(page_id, canvas_data=canvas_data)

    yield CanvasOp(op=OpType.SET_THEME, theme=theme)
    yield CanvasOp(op=OpType.SET_BACKGROUND, color=bg)


async def _zoom(meta: dict, page_id: str, viewport: Viewport | None) -> AsyncIterator[CanvasOp]:
    text = meta.get("sub_intent", "")
    current = viewport.zoom if viewport else 1.0
    if "in" in text:
        new_zoom = min(current + 0.25, 3.0)
    elif "out" in text:
        new_zoom = max(current - 0.25, 0.25)
    else:
        new_zoom = 1.0
    yield CanvasOp(op=OpType.ZOOM_TO, zoom=new_zoom)


_HANDLERS = {
    "set_background": _set_background,
    "set_theme": _set_theme,
    "zoom": _zoom,
}