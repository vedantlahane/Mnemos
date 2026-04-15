# === FILE: backend/app/models/visual.py ===
"""
Visual context models — what the AI 'sees' when looking at a canvas.
"""

from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class LayoutPattern(str, Enum):
    FREEFORM = "freeform"
    GRID = "grid"
    TIMELINE = "timeline"
    MINDMAP = "mindmap"
    FLOW = "flow"
    COLUMNS = "columns"


class ReadingDirection(str, Enum):
    LEFT_TO_RIGHT = "left-to-right"
    TOP_TO_BOTTOM = "top-to-bottom"
    RADIAL = "radial"
    MIXED = "mixed"


class Density(str, Enum):
    EMPTY = "empty"
    SPARSE = "sparse"
    MODERATE = "moderate"
    DENSE = "dense"


class VisualContext(BaseModel):
    page_id: str
    background_color: str = "#0e0e1a"
    theme: str = "dark"
    dominant_colors: list[str] = Field(default_factory=list)
    layout_pattern: LayoutPattern = LayoutPattern.FREEFORM
    reading_direction: ReadingDirection = ReadingDirection.TOP_TO_BOTTOM
    density: Density = Density.SPARSE
    bounds: dict = Field(default_factory=lambda: {"minX": 0, "minY": 0, "maxX": 1920, "maxY": 1080})
    element_count: int = 0

    @property
    def is_dark(self) -> bool:
        return self.theme == "dark"

    @property
    def is_empty(self) -> bool:
        return self.element_count == 0


class OrganizationDecision(BaseModel):
    action: str  # place_near | create_region | extend_region | reorganize
    target_region_id: Optional[str] = None
    anchor_element_id: Optional[str] = None
    direction: str = "right"  # right | below | above | left
    position: Optional[dict] = None  # {x, y} override
    match_style: bool = True
    needs_reorganization: bool = False
    style_overrides: dict = Field(default_factory=dict)
    reasoning: str = ""


class RegionInfo(BaseModel):
    id: str
    label: Optional[str]
    region_type: str
    layout_hint: str
    element_count: int = 0
    bounds: Optional[dict] = None
    color: Optional[str] = None