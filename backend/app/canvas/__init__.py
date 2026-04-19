# === FILE: backend/app/canvas/__init__.py ===

from app.canvas.renderer import SceneManager, scene_manager
from app.canvas.renderer import scene_manager as canvas_renderer
from app.canvas.factory import ElementFactory
from app.canvas.text_measure import measure_text
from app.canvas.layout import layout_diagram
from app.canvas.constants import EXCALIDRAW_VERSION

__all__ = [
    "SceneManager", "scene_manager", "canvas_renderer",
    "ElementFactory", "measure_text",
    "layout_diagram", "EXCALIDRAW_VERSION",
]