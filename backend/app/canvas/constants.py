"""
Excalidraw element schema constants.
Single source of truth for all Excalidraw properties.
Update this file when targeting a new Excalidraw version.
"""

EXCALIDRAW_VERSION = "0.17.6"

# ── All supported element types ──

ELEMENT_TYPES = {
    "rectangle", "ellipse", "diamond", "text", "line", "arrow",
    "freedraw", "image", "frame", "magicframe", "embeddable",
    "iframe", "selection",
}

# ── Properties every element MUST have ──

BASE_REQUIRED = {
    "id", "type", "x", "y", "width", "height", "angle",
    "strokeColor", "backgroundColor", "fillStyle",
    "strokeWidth", "strokeStyle", "roughness", "opacity",
    "groupIds", "frameId", "index", "roundness",
    "seed", "version", "versionNonce",
    "isDeleted", "updated", "link", "locked",
    "customData",
}

# ── Additional required per type ──

TYPE_EXTRA_REQUIRED = {
    "text": {
        "text", "fontSize", "fontFamily", "textAlign",
        "verticalAlign", "lineHeight", "originalText",
        "autoResize", "containerId",
    },
    "arrow": {
        "points", "startArrowhead", "endArrowhead",
        "startBinding", "endBinding", "lastCommittedPoint",
    },
    "line": {
        "points", "startArrowhead", "endArrowhead",
        "startBinding", "endBinding", "lastCommittedPoint",
    },
    "freedraw": {"points", "pressures", "simulatePressure"},
    "image": {"fileId", "status", "scale"},
    "frame": {"name"},
}

# ── Base defaults for all elements ──

BASE_DEFAULTS = {
    "angle": 0,
    "strokeColor": "#1e1e1e",
    "backgroundColor": "transparent",
    "fillStyle": "solid",
    "strokeWidth": 2,
    "strokeStyle": "solid",
    "roughness": 0,
    "opacity": 100,
    "groupIds": [],
    "frameId": None,
    "roundness": None,
    "isDeleted": False,
    "link": None,
    "locked": False,
    "customData": {},
    "boundElements": [],
}

# ── Text defaults ──

TEXT_DEFAULTS = {
    "textAlign": "left",
    "verticalAlign": "top",
    "lineHeight": 1.25,
    "autoResize": True,
    "containerId": None,
    "backgroundColor": "transparent",
    "strokeWidth": 0,
    "fillStyle": "solid",
}

# ── Arrow defaults ──

ARROW_DEFAULTS = {
    "startArrowhead": None,
    "endArrowhead": "arrow",
    "startBinding": None,
    "endBinding": None,
    "lastCommittedPoint": None,
    "backgroundColor": "transparent",
    "fillStyle": "solid",
}

# ── Font families ──

FONT_FAMILIES = {
    1: "Virgil",      # Handwritten
    2: "Helvetica",   # Sans-serif
    3: "Cascadia",    # Monospace
    4: "Excalifont",  # Excalidraw native
    5: "Nunito",      # Round sans
    6: "Lilita One",  # Display
    7: "Comic Shanns",# Comic
}

# ── Fill styles ──

FILL_STYLES = {"solid", "hachure", "cross-hatch", "dots", "zigzag"}

# ── Stroke styles ──

STROKE_STYLES = {"solid", "dashed", "dotted"}

# ── Roundness types ──

ROUNDNESS_ADAPTIVE = {"type": 3}
ROUNDNESS_NONE = None

# ── Theme color palettes ──
# Replace the THEME_COLORS dict in constants.py:

THEME_COLORS = {
    "dark": {
        "background": "#0e0e1a",
        "card_bg": "#1e1e2e",
        "card_border": "#374151",
        "title_color": "#f3f4f6",
        "body_color": "#d1d5db",
        "accent": "#818cf8",
        "muted": "#6b7280",
        "divider": "#374151",
        "node": {
            "default":  {"bg": "#1e1e2e", "border": "#374151", "text": "#e5e7eb"},
            "accent":   {"bg": "#312e81", "border": "#6366f1", "text": "#c7d2fe"},
            "muted":    {"bg": "#1f2937", "border": "#4b5563", "text": "#9ca3af"},
            "warning":  {"bg": "#431407", "border": "#ea580c", "text": "#fed7aa"},
            "success":  {"bg": "#052e16", "border": "#16a34a", "text": "#bbf7d0"},
        },
        "arrow": "#6b7280",
    },
    "light": {
        "background": "#ffffff",
        "card_bg": "#f9fafb",
        "card_border": "#d1d5db",
        "title_color": "#111827",
        "body_color": "#374151",
        "accent": "#4f46e5",
        "muted": "#6b7280",
        "divider": "#d1d5db",
        "node": {
            "default":  {"bg": "#f9fafb", "border": "#d1d5db", "text": "#1f2937"},
            "accent":   {"bg": "#e0e7ff", "border": "#4f46e5", "text": "#312e81"},
            "muted":    {"bg": "#f3f4f6", "border": "#9ca3af", "text": "#4b5563"},
            "warning":  {"bg": "#fff7ed", "border": "#ea580c", "text": "#7c2d12"},
            "success":  {"bg": "#f0fdf4", "border": "#16a34a", "text": "#14532d"},
        },
        "arrow": "#6b7280",
    },
}

# ── Default scene template ──

DEFAULT_SCENE = {
    "elements": [],
    "appState": {
        "viewBackgroundColor": "#0e0e1a",
        "theme": "dark",
    },
    "files": {},
}