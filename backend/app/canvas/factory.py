"""
Excalidraw Element Factory — single place for ALL element creation.
Full control over every property. Schema-validated.
"""

from __future__ import annotations
import random
import time
import uuid
from typing import Any, Optional

from app.canvas.constants import (
    BASE_DEFAULTS, TEXT_DEFAULTS, ARROW_DEFAULTS,
    BASE_REQUIRED, TYPE_EXTRA_REQUIRED,
    THEME_COLORS, FONT_FAMILIES,
)
from app.canvas.text_measure import measure_text


def _id() -> str:
    """Generate Excalidraw-compatible element ID (21 chars, alphanumeric)."""
    alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alpha) for _ in range(21))


# ── Fractional Indexing for Excalidraw 0.18+ ──
# Each element needs an 'index' property for z-ordering and shape cache building.
# Without it, isPointOnShape() crashes when accessing element.roundness.type.

_index_counter = 0


def _fractional_index() -> str:
    """
    Generate a fractional index string for Excalidraw 0.18+.
    Uses simple lexicographic ordering: a0, a1, a2, ... a9, aA, aB, ...
    Elements are ordered by these strings in the scene.
    """
    global _index_counter
    _index_counter += 1
    # Simple scheme: "a" + base-62 counter
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    n = _index_counter
    result = []
    while n > 0 or not result:
        result.append(chars[n % len(chars)])
        n //= len(chars)
    return "a" + "".join(reversed(result))


def reset_index_counter():
    """Reset index counter — call when building a new scene."""
    global _index_counter
    _index_counter = 0


def _seed() -> int:
    return random.randint(1, 2_147_483_647)


def _ts() -> int:
    return int(time.time() * 1000)


class ElementFactory:
    """
    Creates properly-structured Excalidraw elements.
    All element creation in the entire backend goes through this class.
    """

    def __init__(self, theme: str = "dark"):
        self.theme = theme
        self._colors = THEME_COLORS.get(theme, THEME_COLORS["dark"])

    def set_theme(self, theme: str):
        self.theme = theme
        self._colors = THEME_COLORS.get(theme, THEME_COLORS["dark"])

    # ── Core builders ──

    def _base(self, element_type: str, **overrides: Any) -> dict:
        """Build base element with all required properties."""
        el = {
            **BASE_DEFAULTS,
            "id": _id(),
            "type": element_type,
            "x": 0.0,
            "y": 0.0,
            "width": 100.0,
            "height": 100.0,
            "index": _fractional_index(),  # REQUIRED for Excalidraw 0.18+
            "seed": _seed(),
            "version": 1,
            "versionNonce": _seed(),
            "updated": _ts(),
        }
        # Deep-copy mutable defaults
        el["groupIds"] = list(el.get("groupIds", []))
        el["boundElements"] = list(el.get("boundElements", []))
        el["customData"] = dict(el.get("customData", {}))

        el.update(overrides)
        return el

    def _validate(self, el: dict) -> dict:
        """Validate element has all required fields for its type."""
        el_type = el.get("type", "rectangle")
        required = BASE_REQUIRED | TYPE_EXTRA_REQUIRED.get(el_type, set())
        missing = required - set(el.keys())
        if missing:
            raise ValueError(f"Element '{el_type}' missing fields: {missing}")

        # ── Safety: Excalidraw 0.18 crashes on null for these fields ──
        # Colors: .length is called → must be string
        for field in ("strokeColor", "backgroundColor"):
            if el.get(field) is None:
                el[field] = BASE_DEFAULTS.get(field, "transparent")

        # fillStyle/strokeStyle: must be string
        if not isinstance(el.get("fillStyle"), str):
            el["fillStyle"] = "solid"
        if not isinstance(el.get("strokeStyle"), str):
            el["strokeStyle"] = "solid"

        # Arrays: must never be None
        for field in ("groupIds", "boundElements"):
            if el.get(field) is None:
                el[field] = []

        # roundness: can be None (null) — that's OK for Excalidraw
        # but if it's a dict, it MUST have "type"
        rn = el.get("roundness")
        if isinstance(rn, dict) and "type" not in rn:
            rn["type"] = 3

        return el

    # ── Shapes ──

    def rectangle(
        self,
        x: float, y: float, width: float, height: float,
        *,
        id: str = None,
        stroke_color: str = None,
        bg_color: str = "transparent",
        fill_style: str = "solid",
        stroke_width: int = 2,
        roughness: int = 0,
        corner_radius: int = 8,
        opacity: int = 100,
        group_ids: list[str] = None,
        custom_data: dict = None,
        locked: bool = False,
        frame_id: str = None,
        bound_elements: list[dict] = None,
    ) -> dict:
        return self._validate(self._base(
            "rectangle",
            id=id or _id(),
            x=x, y=y, width=width, height=height,
            strokeColor=stroke_color or self._colors["card_border"],
            backgroundColor=bg_color,
            fillStyle=fill_style,
            strokeWidth=stroke_width,
            roughness=roughness,
            opacity=opacity,
            roundness={"type": 3, "value": corner_radius} if corner_radius else None,
            groupIds=group_ids or [],
            customData=custom_data or {},
            locked=locked,
            frameId=frame_id,
            boundElements=bound_elements or [],
        ))

    def ellipse(
        self,
        x: float, y: float, width: float, height: float, **kwargs
    ) -> dict:
        el = self.rectangle(x, y, width, height, **kwargs)
        el["type"] = "ellipse"
        el["roundness"] = {"type": 2}
        return el

    def diamond(
        self,
        x: float, y: float, width: float, height: float, **kwargs
    ) -> dict:
        el = self.rectangle(x, y, width, height, **kwargs)
        el["type"] = "diamond"
        el["roundness"] = {"type": 2}
        return el

    # ── Text ──

    def text(
        self,
        text_content: str,
        x: float, y: float,
        *,
        id: str = None,
        font_size: int = 16,
        font_family: int = 1,
        max_width: float = 600,
        max_lines: int = 200,
        color: str = None,
        text_align: str = "left",
        vertical_align: str = "top",
        container_id: str = None,
        opacity: int = 100,
        group_ids: list[str] = None,
        custom_data: dict = None,
        locked: bool = False,
        frame_id: str = None,
        bound_elements: list[dict] = None,
    ) -> dict:
        m = measure_text(text_content, font_size, font_family, max_width, max_lines)

        return self._validate(self._base(
            "text",
            id=id or _id(),
            x=x, y=y,
            width=m["width"],
            height=m["height"],
            text=m["wrapped_text"],
            originalText=text_content,
            fontSize=font_size,
            fontFamily=font_family,
            textAlign=text_align,
            verticalAlign=vertical_align,
            lineHeight=1.25,
            autoResize=True,
            containerId=container_id,
            strokeColor=color or self._colors["body_color"],
            backgroundColor="transparent",
            fillStyle="solid",
            strokeWidth=0,
            opacity=opacity,
            roundness=None,
            groupIds=group_ids or [],
            customData=custom_data or {},
            locked=locked,
            frameId=frame_id,
            boundElements=bound_elements or [],
        ))

    # ── Lines & Arrows ──

    def line(
        self,
        points: list[list[float]],
        *,
        id: str = None,
        stroke_color: str = None,
        stroke_width: int = 2,
        stroke_style: str = "solid",
        roughness: int = 0,
        opacity: int = 100,
        group_ids: list[str] = None,
        custom_data: dict = None,
    ) -> dict:
        if len(points) < 2:
            raise ValueError("Line needs at least 2 points")
        x0, y0 = points[0]
        # Normalize points relative to origin
        norm_points = [[p[0] - x0, p[1] - y0] for p in points]
        xs = [p[0] for p in norm_points]
        ys = [p[1] for p in norm_points]

        return self._validate(self._base(
            "line",
            id=id or _id(),
            x=x0, y=y0,
            width=max(xs) - min(xs) if xs else 0,
            height=max(ys) - min(ys) if ys else 0,
            points=norm_points,
            strokeColor=stroke_color or self._colors["divider"],
            strokeWidth=stroke_width,
            strokeStyle=stroke_style,
            roughness=roughness,
            opacity=opacity,
            roundness=None,
            groupIds=group_ids or [],
            customData=custom_data or {},
            startArrowhead=None,
            endArrowhead=None,
            startBinding=None,
            endBinding=None,
            lastCommittedPoint=None,
        ))

    def arrow(
        self,
        start_x: float, start_y: float,
        end_x: float, end_y: float,
        *,
        id: str = None,
        stroke_color: str = None,
        stroke_width: int = 2,
        stroke_style: str = "solid",
        roughness: int = 0,
        start_arrowhead: str = None,
        end_arrowhead: str = "arrow",
        start_binding: dict = None,
        end_binding: dict = None,
        points: list[list[float]] = None,
        opacity: int = 100,
        group_ids: list[str] = None,
        custom_data: dict = None,
    ) -> dict:
        dx = end_x - start_x
        dy = end_y - start_y

        return self._validate(self._base(
            "arrow",
            id=id or _id(),
            x=start_x, y=start_y,
            width=max(abs(dx), 1),
            height=max(abs(dy), 1),
            points=points or [[0, 0], [dx, dy]],
            strokeColor=stroke_color or self._colors["arrow"],
            strokeWidth=stroke_width,
            strokeStyle=stroke_style,
            roughness=roughness,
            opacity=opacity,
            roundness={"type": 2},
            startArrowhead=start_arrowhead,
            endArrowhead=end_arrowhead,
            startBinding=start_binding,
            endBinding=end_binding,
            lastCommittedPoint=None,
            groupIds=group_ids or [],
            customData=custom_data or {},
        ))

    # ── Freedraw ──

    def freedraw(
        self,
        points: list[list[float]],
        *,
        id: str = None,
        stroke_color: str = None,
        stroke_width: int = 1,
        opacity: int = 100,
        simulate_pressure: bool = True,
        custom_data: dict = None,
    ) -> dict:
        if not points:
            raise ValueError("Freedraw needs points")
        x0, y0 = points[0]
        norm = [[p[0] - x0, p[1] - y0] for p in points]
        xs = [p[0] for p in norm]
        ys = [p[1] for p in norm]

        return self._validate(self._base(
            "freedraw",
            id=id or _id(),
            x=x0, y=y0,
            width=max(xs) - min(xs) if xs else 0,
            height=max(ys) - min(ys) if ys else 0,
            points=norm,
            pressures=[],
            simulatePressure=simulate_pressure,
            strokeColor=stroke_color or self._colors["body_color"],
            strokeWidth=stroke_width,
            opacity=opacity,
            roundness=None,
            customData=custom_data or {},
        ))

    # ── Image ──

    def image(
        self,
        x: float, y: float, width: float, height: float,
        file_id: str,
        *,
        id: str = None,
        status: str = "saved",
        scale: list[float] = None,
        opacity: int = 100,
        group_ids: list[str] = None,
        custom_data: dict = None,
    ) -> dict:
        return self._validate(self._base(
            "image",
            id=id or _id(),
            x=x, y=y, width=width, height=height,
            fileId=file_id,
            status=status,
            scale=scale or [1, 1],
            strokeColor="transparent",
            backgroundColor="transparent",
            opacity=opacity,
            roundness=None,
            groupIds=group_ids or [],
            customData=custom_data or {},
        ))

    # ── Frame ──

    def frame(
        self,
        x: float, y: float, width: float, height: float,
        name: str = "",
        *,
        id: str = None,
        custom_data: dict = None,
    ) -> dict:
        return self._validate(self._base(
            "frame",
            id=id or _id(),
            x=x, y=y, width=width, height=height,
            name=name,
            strokeColor=self._colors["card_border"],
            backgroundColor="transparent",
            roundness=None,
            customData=custom_data or {},
        ))

    # ── Composite builders ──

    def note_card(
        self,
        note: dict,
        x: float, y: float,
        width: float = 360, height: float = 240,
    ) -> tuple[list[dict], str]:
        """
        Build a complete note card (frame + title + summary + accent + tags).
        Returns (elements, group_id).
        """
        note_id = note["id"]
        group_id = f"note-{note_id[:12]}"
        title = note.get("title") or "Untitled"
        summary = note.get("summary") or note.get("raw_text", "")
        tags = note.get("tags") or []
        content_width = width - 24  # 12px padding each side

        # Measure text blocks
        title_m = measure_text(title, font_size=18, font_family=1, max_width=content_width, max_lines=2)
        summary_m = measure_text(summary, font_size=13, font_family=1, max_width=content_width, max_lines=6)
        tag_text = "  ".join(f"#{t}" for t in tags)

        elements = [
            # Card background
            self.rectangle(
                x - 12, y - 12, width, height,
                id=f"note-frame-{note_id}",
                bg_color=self._colors["card_bg"],
                stroke_color=self._colors["card_border"],
                stroke_width=1,
                corner_radius=10,
                group_ids=[group_id],
                custom_data={"noteId": note_id, "type": "note-frame"},
            ),
            # Accent bar
            self.line(
                [[x - 12, y - 12], [x - 12, y - 12 + height]],
                id=f"note-accent-{note_id}",
                stroke_color=self._colors["accent"],
                stroke_width=3,
                group_ids=[group_id],
                custom_data={"noteId": note_id, "type": "note-accent"},
            ),
            # Title
            self.text(
                title, x, y,
                id=f"note-title-{note_id}",
                font_size=18, font_family=1,
                max_width=content_width, max_lines=2,
                color=self._colors["title_color"],
                group_ids=[group_id],
                custom_data={"noteId": note_id, "type": "note-title"},
            ),
            # Summary
            self.text(
                summary, x, y + title_m["height"] + 8,
                id=f"note-summary-{note_id}",
                font_size=13, font_family=1,
                max_width=content_width, max_lines=6,
                color=self._colors["body_color"],
                group_ids=[group_id],
                custom_data={"noteId": note_id, "type": "note-summary"},
            ),
        ]

        if tags:
            elements.append(self.text(
                tag_text, x, y + height - 48,
                id=f"note-tags-{note_id}",
                font_size=11, font_family=3,
                max_width=content_width, max_lines=1,
                color=self._colors["accent"],
                group_ids=[group_id],
                custom_data={"noteId": note_id, "type": "note-tags"},
            ))

        return elements, group_id

    def diagram_node(
        self,
        label: str,
        x: float, y: float,
        width: float, height: float,
        node_id: str,
        style: str = "default",
        *,
        group_id: str = None,
        diagram_id: str = None,
    ) -> list[dict]:
        """Build a diagram node (box + centered label)."""
        node_colors = self._colors.get("node", {}).get(style, self._colors["node"]["default"])
        gids = [group_id] if group_id else []

        label_m = measure_text(label, font_size=14, font_family=1, max_width=width - 20, max_lines=3)

        return [
            self.rectangle(
                x, y, width, height,
                id=f"{node_id}-rect",
                bg_color=node_colors["bg"],
                stroke_color=node_colors["border"],
                stroke_width=2,
                corner_radius=8,
                group_ids=gids,
                custom_data={"type": "diagram-node", "diagramId": diagram_id, "nodeId": node_id},
            ),
            self.text(
                label,
                x + (width - label_m["width"]) / 2,
                y + (height - label_m["height"]) / 2,
                id=f"{node_id}-text",
                font_size=14, font_family=1,
                max_width=width - 20, max_lines=3,
                color=node_colors["text"],
                text_align="center",
                vertical_align="middle",
                group_ids=gids,
                custom_data={"type": "diagram-label", "diagramId": diagram_id, "nodeId": node_id},
            ),
        ]

    def sticky_note(
        self,
        content: str,
        x: float, y: float,
        width: float = 180, height: float = 160,
        bg_color: str = "#fef08a",
        text_color: str = "#78350f",
        id: str = None,
    ) -> tuple[list[dict], str]:
        """Build a sticky note."""
        sticky_id = id or f"sticky-{_id()[:8]}"
        group_id = f"sticky-{sticky_id}"

        elements = [
            self.rectangle(
                x, y, width, height,
                id=f"{sticky_id}-bg",
                bg_color=bg_color,
                stroke_color="transparent",
                stroke_width=0,
                corner_radius=4,
                group_ids=[group_id],
                custom_data={"type": "sticky-bg", "stickyId": sticky_id},
            ),
            self.text(
                content, x + 12, y + 12,
                id=f"{sticky_id}-text",
                font_size=16, font_family=4,
                max_width=width - 24, max_lines=6,
                color=text_color,
                group_ids=[group_id],
                custom_data={"type": "sticky-text", "stickyId": sticky_id},
            ),
        ]
        return elements, group_id

    # ── Utilities ──

    def group(self, elements: list[dict], group_id: str = None) -> str:
        """Add same group ID to all elements. Returns group_id."""
        gid = group_id or _id()
        for el in elements:
            el.setdefault("groupIds", [])
            if gid not in el["groupIds"]:
                el["groupIds"].insert(0, gid)
        return gid

    def bind_text_to_container(self, container: dict, text_el: dict):
        """Set up proper Excalidraw binding between text and container."""
        text_el["containerId"] = container["id"]
        text_el["textAlign"] = "center"
        text_el["verticalAlign"] = "middle"
        container.setdefault("boundElements", [])
        container["boundElements"].append({"type": "text", "id": text_el["id"]})

    def bind_arrow(
        self,
        arrow_el: dict,
        start_el: dict = None,
        end_el: dict = None,
    ):
        """Set up proper Excalidraw arrow bindings."""
        if start_el:
            arrow_el["startBinding"] = {
                                "elementId": start_el["id"],
                "focus": 0,
                "gap": 8,
                "fixedPoint": None,
            }
            start_el.setdefault("boundElements", [])
            start_el["boundElements"].append({"type": "arrow", "id": arrow_el["id"]})

        if end_el:
            arrow_el["endBinding"] = {
                "elementId": end_el["id"],
                "focus": 0,
                "gap": 8,
                "fixedPoint": None,
            }
            end_el.setdefault("boundElements", [])
            end_el["boundElements"].append({"type": "arrow", "id": arrow_el["id"]})

    def update_element(self, el: dict, **changes) -> dict:
        """Update element fields and bump version."""
        el.update(changes)
        el["version"] = el.get("version", 1) + 1
        el["versionNonce"] = _seed()
        el["updated"] = _ts()
        return el

    def move_element(self, el: dict, x: float, y: float) -> dict:
        """Move element to new position."""
        return self.update_element(el, x=x, y=y)

    def delete_element(self, el: dict) -> dict:
        """Soft-delete element (Excalidraw style)."""
        return self.update_element(el, isDeleted=True)

    def restore_element(self, el: dict) -> dict:
        """Undelete element."""
        return self.update_element(el, isDeleted=False)

    def contrast_text_color(self, bg_hex: str) -> str:
        """Pick readable text color for given background."""
        lum = _luminance(bg_hex)
        return "#f9fafb" if lum < 0.4 else "#111827"


def _luminance(hex_color: str) -> float:
    if not hex_color:
        return 0.1
    h = hex_color.lstrip("#")
    if len(h) < 6:
        h = "".join(c * 2 for c in h[:3])
    try:
        r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    except (ValueError, IndexError):
        return 0.1
    to_lin = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * to_lin(r) + 0.7152 * to_lin(g) + 0.0722 * to_lin(b)