# === FILE: backend/app/canvas/__init__.py ===

from app.canvas.renderer import SceneBuilder, scene_builder
from app.canvas.factory import ElementFactory
from app.canvas.text_measure import measure_text
from app.canvas.layout import layout_diagram
from app.canvas.constants import EXCALIDRAW_VERSION

# Canonical name — use this everywhere
canvas_renderer = scene_builder

__all__ = [
    "SceneBuilder", "scene_builder", "canvas_renderer",
    "ElementFactory", "measure_text",
    "layout_diagram", "EXCALIDRAW_VERSION",
]