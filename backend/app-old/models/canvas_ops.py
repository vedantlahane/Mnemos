# === FILE: backend/app/models/canvas_ops.py ===
"""
Canvas Operations Protocol.

Every backend action that touches the canvas is expressed as a CanvasOp.
The frontend receives these over SSE and applies them to Excalidraw.
"""

from __future__ import annotations
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid
import time


class OpType(str, Enum):
    # Element CRUD
    CREATE_NOTE = "create_note"
    CREATE_TEXT = "create_text"
    CREATE_DIAGRAM = "create_diagram"
    CREATE_STICKY = "create_sticky"
    UPDATE_ELEMENT = "update_element"
    MOVE_ELEMENT = "move_element"
    DELETE_ELEMENT = "delete_element"
    GROUP_ELEMENTS = "group_elements"
    CREATE_EDGE_LINE = "create_edge_line"

    # Canvas state
    SET_BACKGROUND = "set_background"
    SET_THEME = "set_theme"
    PAN_TO = "pan_to"
    ZOOM_TO = "zoom_to"

    # Streaming text
    STREAM_START = "stream_start"
    STREAM_CHUNK = "stream_chunk"
    STREAM_END = "stream_end"

    # Batch / arrange
    ARRANGE_CLUSTER = "arrange_cluster"
    BATCH = "batch"

    # Meta
    INFO = "info"
    ERROR = "error"
    DONE = "done"


class CanvasOp(BaseModel):
    op: OpType
    element_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    text: Optional[str] = None
    color: Optional[str] = None
    theme: Optional[str] = None
    zoom: Optional[float] = None
    style: Optional[str] = None
    note: Optional[dict] = None
    note_id: Optional[str] = None
    elements: Optional[list[dict]] = None
    connections: Optional[list[dict]] = None
    operations: Optional[list["CanvasOp"]] = None
    topology: Optional[dict] = None
    message: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


class SSEEvent(BaseModel):
    event: str  # "intent", "chat", "canvas_op", "sources", "follow_ups", "error", "done"
    data: dict


class Viewport(BaseModel):
    x: float = 0
    y: float = 0
    width: float = 1920
    height: float = 1080
    zoom: float = 1.0

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    def contains(self, px: float, py: float) -> bool:
        return self.x <= px <= self.right and self.y <= py <= self.bottom


class Rect(BaseModel):
    x: float
    y: float
    w: float
    h: float

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def bottom(self) -> float:
        return self.y + self.h

    @property
    def center_x(self) -> float:
        return self.x + self.w / 2

    @property
    def center_y(self) -> float:
        return self.y + self.h / 2

    def overlaps(self, other: "Rect", gap: float = 0) -> bool:
        return not (
            self.right + gap <= other.x
            or other.right + gap <= self.x
            or self.bottom + gap <= other.y
            or other.bottom + gap <= self.y
        )


class Placement(BaseModel):
    x: float
    y: float
    cluster_id: Optional[str] = None
    strategy: str = "auto"
    reason: str = ""


class CanvasStreamRequest(BaseModel):
    message: str
    viewport: Optional[Viewport] = None
    history: list[dict] = []
    selected_element_ids: list[str] = []
    context_type: str = "page"


class Intent(str, Enum):
    COMPOSE = "compose"
    COMMAND = "command"
    ARRANGE = "arrange"
    CAPTURE = "capture"
    QUERY = "query"
    DIAGRAM = "diagram"
    SEARCH = "search"
    NAVIGATE = "navigate"


def make_element_id(prefix: str = "el") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"