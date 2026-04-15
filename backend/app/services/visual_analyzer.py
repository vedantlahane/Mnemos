# === FILE: backend/app/services/visual_analyzer.py ===
"""
Visual Analyzer — gives the AI 'eyes' to see the canvas.
Extracts semantic understanding from raw Excalidraw scene JSON.
Updated on every scene save.
"""

from __future__ import annotations
import math
import logging
from collections import Counter
from typing import Optional

from app.models.visual import (
    VisualContext, LayoutPattern, ReadingDirection, Density, RegionInfo,
)
from app.db.supabase import db

logger = logging.getLogger("mnemos.visual_analyzer")


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


class VisualAnalyzer:

    async def analyze_and_persist(self, page_id: str, scene: dict) -> VisualContext:
        """Full analysis pipeline. Returns VisualContext and persists to DB."""
        elements = [el for el in (scene.get("elements") or []) if not el.get("isDeleted")]
        app_state = scene.get("appState") or {}

        bg_color = app_state.get("viewBackgroundColor", "#0e0e1a")
        theme = "dark" if _luminance(bg_color) < 0.4 else "light"

        pattern = self._detect_layout_pattern(elements)
        direction = self._detect_reading_direction(elements)
        colors = self._extract_palette(elements)
        bounds = self._compute_bounds(elements)
        density = self._compute_density(elements, bounds)

        ctx = VisualContext(
            page_id=page_id,
            background_color=bg_color,
            theme=theme,
            dominant_colors=colors,
            layout_pattern=pattern,
            reading_direction=direction,
            density=density,
            bounds=bounds,
            element_count=len(elements),
        )

        try:
            await db.upsert_visual_context(
                page_id=page_id,
                background_color=bg_color,
                theme=theme,
                dominant_colors=colors,
                layout_pattern=pattern.value,
                reading_direction=direction.value,
                density=density.value,
                bounds=bounds,
                element_count=len(elements),
                last_analyzed=db._now() if hasattr(db, '_now') else None,
            )
        except Exception as e:
            logger.warning(f"Failed to persist visual context: {e}")

        return ctx

    async def sync_element_registry(self, page_id: str, scene: dict) -> int:
        """
        Sync Excalidraw scene elements → canvas_element_registry.
        Returns count of entries updated.
        """
        elements = scene.get("elements") or []
        updated = 0

        for el in elements:
            if el.get("isDeleted"):
                continue

            el_id = el.get("id")
            if not el_id:
                continue

            custom = el.get("customData") or {}
            custom_type = str(custom.get("type") or "")

            # Skip placeholders
            if custom_type.startswith("__placeholder"):
                continue

            # Determine element_type and content_source
            element_type, content_source, note_id = self._classify_element(el, custom, custom_type)
            if not element_type:
                continue

            # Extract style snapshot
            style_snapshot = {
                "strokeColor": el.get("strokeColor"),
                "backgroundColor": el.get("backgroundColor"),
                "fontSize": el.get("fontSize"),
                "fontFamily": el.get("fontFamily"),
                "fillStyle": el.get("fillStyle"),
                "roughness": el.get("roughness"),
            }

            try:
                await db.upsert_element_registry(
                    page_id=page_id,
                    element_id=el_id,
                    element_type=element_type,
                    content_source=content_source,
                    note_id=note_id,
                    cached_x=el.get("x"),
                    cached_y=el.get("y"),
                    cached_width=el.get("width"),
                    cached_height=el.get("height"),
                    style_snapshot=style_snapshot,
                )
                updated += 1
            except Exception as e:
                logger.debug(f"Registry upsert failed for {el_id}: {e}")

        return updated

    def analyze_for_prompt(self, ctx: VisualContext, regions: list[dict] = None) -> str:
        """Build a concise text description of the canvas state for LLM prompts."""
        parts = [
            f"Canvas: {ctx.theme} theme, {ctx.background_color} background",
            f"Layout: {ctx.layout_pattern.value}, reading {ctx.reading_direction.value}",
            f"Density: {ctx.density.value} ({ctx.element_count} elements)",
        ]
        if ctx.dominant_colors:
            parts.append(f"Colors in use: {', '.join(ctx.dominant_colors[:5])}")

        b = ctx.bounds
        width = b.get("maxX", 1920) - b.get("minX", 0)
        height = b.get("maxY", 1080) - b.get("minY", 0)
        parts.append(f"Canvas extent: {width:.0f}×{height:.0f}px")

        if regions:
            region_descs = []
            for r in regions[:8]:
                label = r.get("label") or "Unnamed"
                rtype = r.get("region_type", "cluster")
                region_descs.append(f"  - {label} ({rtype})")
            parts.append(f"Regions:\n" + "\n".join(region_descs))

        return "\n".join(parts)

    # ── Detection algorithms ──

    def _detect_layout_pattern(self, elements: list[dict]) -> LayoutPattern:
        content_elements = [
            el for el in elements
            if el.get("type") in ("rectangle", "text", "ellipse", "diamond")
            and not el.get("isDeleted")
        ]
        if len(content_elements) < 3:
            return LayoutPattern.FREEFORM

        positions = [(el.get("x", 0), el.get("y", 0)) for el in content_elements]
        xs = [p[0] for p in positions]
        ys = [p[1] for p in positions]

        # Grid detection: check column/row alignment
        x_clusters = self._find_alignment_clusters(xs, tolerance=50)
        y_clusters = self._find_alignment_clusters(ys, tolerance=50)

        if len(x_clusters) >= 2 and len(y_clusters) >= 2:
            grid_score = min(len(x_clusters), len(y_clusters)) / max(len(x_clusters), len(y_clusters))
            if grid_score > 0.4:
                return LayoutPattern.GRID

        # Column detection
        if len(x_clusters) >= 2 and len(y_clusters) <= 2:
            return LayoutPattern.COLUMNS

        # Timeline detection: horizontal spread >> vertical
        x_range = max(xs) - min(xs) if xs else 0
        y_range = max(ys) - min(ys) if ys else 0
        if x_range > 3 * max(y_range, 1) and len(content_elements) >= 3:
            return LayoutPattern.TIMELINE

        # Flow detection: vertical spread >> horizontal
        if y_range > 3 * max(x_range, 1) and len(content_elements) >= 3:
            return LayoutPattern.FLOW

        # Mindmap detection: central element with radial spread
        center_x = sum(xs) / len(xs)
        center_y = sum(ys) / len(ys)
        distances = [math.sqrt((x - center_x) ** 2 + (y - center_y) ** 2) for x, y in positions]
        if distances and min(distances) < max(distances) * 0.15:
            return LayoutPattern.MINDMAP

        return LayoutPattern.FREEFORM

    def _detect_reading_direction(self, elements: list[dict]) -> ReadingDirection:
        content = [
            el for el in elements
            if el.get("type") in ("rectangle", "text") and not el.get("isDeleted")
        ]
        if len(content) < 2:
            return ReadingDirection.TOP_TO_BOTTOM

        # Sort by creation order (approximated by version or element order)
        sorted_by_y = sorted(content, key=lambda e: e.get("y", 0))
        sorted_by_x = sorted(content, key=lambda e: e.get("x", 0))

        # Check if elements are predominantly arranged horizontally or vertically
        xs = [e.get("x", 0) for e in content]
        ys = [e.get("y", 0) for e in content]
        x_range = max(xs) - min(xs) if xs else 0
        y_range = max(ys) - min(ys) if ys else 0

        if x_range > 2 * max(y_range, 1):
            return ReadingDirection.LEFT_TO_RIGHT
        if y_range > 2 * max(x_range, 1):
            return ReadingDirection.TOP_TO_BOTTOM

        # Check for radial pattern
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        distances = [math.sqrt((x - cx) ** 2 + (y - cy) ** 2) for x, y in zip(xs, ys)]
        dist_variance = sum((d - sum(distances) / len(distances)) ** 2 for d in distances) / len(distances)
        if dist_variance < (sum(distances) / len(distances)) ** 2 * 0.3:
            return ReadingDirection.RADIAL

        return ReadingDirection.MIXED

    def _extract_palette(self, elements: list[dict]) -> list[str]:
        """Extract dominant colors from scene elements."""
        colors = Counter()
        for el in elements:
            if el.get("isDeleted"):
                continue
            for key in ("strokeColor", "backgroundColor"):
                color = el.get(key)
                if isinstance(color, str) and color.startswith("#") and color != "transparent":
                    colors[color] += 1

        return [color for color, _ in colors.most_common(8)]

    def _compute_bounds(self, elements: list[dict]) -> dict:
        positioned = [el for el in elements if not el.get("isDeleted") and el.get("x") is not None]
        if not positioned:
            return {"minX": 0, "minY": 0, "maxX": 1920, "maxY": 1080}
        min_x = min(el.get("x", 0) for el in positioned)
        min_y = min(el.get("y", 0) for el in positioned)
        max_x = max(el.get("x", 0) + el.get("width", 100) for el in positioned)
        max_y = max(el.get("y", 0) + el.get("height", 100) for el in positioned)
        return {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y}

    def _compute_density(self, elements: list[dict], bounds: dict) -> Density:
        count = len([el for el in elements if not el.get("isDeleted")])
        if count == 0:
            return Density.EMPTY
        area = (bounds.get("maxX", 1920) - bounds.get("minX", 0)) * \
               (bounds.get("maxY", 1080) - bounds.get("minY", 0))
        if area <= 0:
            return Density.SPARSE
        # Elements per million pixels
        density_score = (count / max(area, 1)) * 1_000_000
        if density_score < 2:
            return Density.SPARSE
        if density_score < 8:
            return Density.MODERATE
        return Density.DENSE

    def _find_alignment_clusters(self, values: list[float], tolerance: float = 50) -> list[float]:
        """Find groups of values that are within tolerance of each other."""
        if not values:
            return []
        sorted_vals = sorted(values)
        clusters = [[sorted_vals[0]]]
        for v in sorted_vals[1:]:
            if v - clusters[-1][-1] <= tolerance:
                clusters[-1].append(v)
            else:
                clusters.append([v])
        # Only count clusters with 2+ members as real alignment
        return [sum(c) / len(c) for c in clusters if len(c) >= 2]

    def _classify_element(self, el: dict, custom: dict, custom_type: str) -> tuple[str | None, str, str | None]:
        """Returns (element_type, content_source, note_id)."""
        note_id = custom.get("noteId")

        if custom_type == "note-frame":
            return "note-card", "note", note_id
        if custom_type in ("note-title", "note-summary", "note-tags", "note-accent"):
            return None, "", None  # Skip sub-elements of note cards
        if custom_type == "composed-text":
            return "composed-text", "ai-compose", None
        if custom_type in ("diagram-node", "diagram-label"):
            return "diagram-node", "ai-diagram", None
        if custom_type == "diagram-arrow":
            return "diagram-arrow", "ai-diagram", None
        if custom_type in ("sticky-bg", "sticky-text"):
            return "sticky", "user-draw", None

        # Generic elements
        el_type = el.get("type")
        if el_type == "text":
            return "composed-text", "user-draw", None
        if el_type in ("rectangle", "ellipse", "diamond"):
            return "freehand", "user-draw", None
        if el_type in ("freedraw", "line"):
            return "freehand", "user-draw", None
        if el_type == "image":
            return "image", "user-draw", None
        if el_type == "arrow":
            return None, "", None  # Skip arrows from registry

        return None, "", None


visual_analyzer = VisualAnalyzer()