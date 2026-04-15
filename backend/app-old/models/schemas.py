# === FILE: backend/app/models/schemas.py ===

from pydantic import BaseModel, Field, model_validator
from typing import Optional


# ── Capture / Chat ──

class CaptureRequest(BaseModel):
    text: str
    source_url: Optional[str] = None
    page_title: Optional[str] = None
    capture_type: str = "manual"
    page_hint: Optional[str] = None
    custom_command: Optional[str] = None
    viewport: Optional[dict] = None  # {x, y, width, height, zoom}


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    context_type: str = "home"
    page_id: Optional[str] = None


class ContextRequest(BaseModel):
    url: str
    text: str


# ── Notes ──

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    tasks: Optional[list[str]] = None
    entities: Optional[list[str]] = None
    page_id: Optional[str] = None
    canvas_x: Optional[float] = None
    canvas_y: Optional[float] = None
    canvas_width: Optional[int] = None
    canvas_height: Optional[int] = None
    cluster_id: Optional[str] = None
    metadata: Optional[dict] = None
    source_reference: Optional[dict] = None
    canonical_block_id: Optional[str] = None


class NoteMoveRequest(BaseModel):
    page_id: str


class ProcessedCapture(BaseModel):
    title: str
    summary: str
    tags: list[str]
    tasks: list[str]
    entities: list[str]
    content_type: str = "note"  # note|code|url|thought|question


# ── Pages ──

class PageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: str = "📄"
    color: str = "#6366f1"


class PageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    canvas_data: Optional[dict] = None
    notebook_data: Optional[dict] = None
    viewport: Optional[dict] = None
    is_archived: Optional[bool] = None
    layout_mode: Optional[str] = None
    flow_scroll_mode: Optional[str] = None
    content_width: Optional[int] = None


# ── Edges ──

class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    edge_type: str = "related"
    label: Optional[str] = None
    strength: float = 0.0
    created_by: str = "user"


class EdgeClassification(BaseModel):
    edge_type: str
    label: Optional[str] = None
    confidence: float


# ── Clusters ──

class ClusterCreate(BaseModel):
    page_id: str
    label: str
    description: Optional[str] = None
    color: str = "#6366f1"


class ClusterUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


# ── Canvas Elements ──

class ElementCreate(BaseModel):
    element_type: str
    content: Optional[str] = None
    canvas_data: Optional[dict] = None
    position_x: float = 0
    position_y: float = 0
    width: Optional[float] = None
    height: Optional[float] = None
    style: dict = {}
    created_by: str = "user"


class ElementUpdate(BaseModel):
    content: Optional[str] = None
    canvas_data: Optional[dict] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    style: Optional[dict] = None


# ── Document Flow Blocks ──

class PageBlockCreate(BaseModel):
    block_type: str = "paragraph"
    text_content: Optional[str] = None
    parent_block_id: Optional[str] = None
    prev_block_id: Optional[str] = None
    next_block_id: Optional[str] = None
    order_key: Optional[float] = None
    depth: int = 0
    attrs: dict = Field(default_factory=dict)
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    anchor_mode: str = "inline"
    wrap_mode: str = "rect"
    source_note_id: Optional[str] = None
    source_page_id: Optional[str] = None
    provenance: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    created_by: str = "user"

    @model_validator(mode="after")
    def _validate_ranges(self):
        if (self.line_start is None) != (self.line_end is None):
            raise ValueError("line_start and line_end must be provided together")
        if self.line_start is not None and self.line_end is not None and self.line_end < self.line_start:
            raise ValueError("line_end must be >= line_start")

        if (self.char_start is None) != (self.char_end is None):
            raise ValueError("char_start and char_end must be provided together")
        if self.char_start is not None and self.char_end is not None and self.char_end < self.char_start:
            raise ValueError("char_end must be >= char_start")
        return self


class PageBlockUpdate(BaseModel):
    text_content: Optional[str] = None
    parent_block_id: Optional[str] = None
    order_key: Optional[float] = None
    depth: Optional[int] = None
    block_type: Optional[str] = None
    attrs: Optional[dict] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    anchor_mode: Optional[str] = None
    wrap_mode: Optional[str] = None
    source_note_id: Optional[str] = None
    source_page_id: Optional[str] = None
    provenance: Optional[dict] = None
    metadata: Optional[dict] = None
    is_deleted: Optional[bool] = None

    @model_validator(mode="after")
    def _validate_ranges(self):
        if (self.line_start is None) ^ (self.line_end is None):
            raise ValueError("line_start and line_end must be provided together")
        if self.line_start is not None and self.line_end is not None and self.line_end < self.line_start:
            raise ValueError("line_end must be >= line_start")

        if (self.char_start is None) ^ (self.char_end is None):
            raise ValueError("char_start and char_end must be provided together")
        if self.char_start is not None and self.char_end is not None and self.char_end < self.char_start:
            raise ValueError("char_end must be >= char_start")
        return self


class PageBlockMove(BaseModel):
    prev_block_id: Optional[str] = None
    next_block_id: Optional[str] = None
    order_key: Optional[float] = None


class BlockReferenceCreate(BaseModel):
    ref_type: str
    ref_id: str
    start_offset: int = 0
    end_offset: Optional[int] = None
    label: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class InlineEmbedCreate(BaseModel):
    embed_type: str
    target_page_id: Optional[str] = None
    target_note_id: Optional[str] = None
    target_block_id: Optional[str] = None
    target_element_id: Optional[str] = None
    url: Optional[str] = None
    inline_position: dict = Field(default_factory=dict)
    display_mode: str = "inline-card"
    width: Optional[int] = None
    height: Optional[int] = None
    attrs: dict = Field(default_factory=dict)
    created_by: str = "user"

    @model_validator(mode="after")
    def _validate_single_target(self):
        targets = [
            self.target_page_id,
            self.target_note_id,
            self.target_block_id,
            self.target_element_id,
            self.url,
        ]
        count = sum(1 for t in targets if t)
        if count == 0:
            raise ValueError("inline embed requires one target: page/note/block/element/url")
        if count > 1:
            raise ValueError("inline embed must point to exactly one target")
        return self


class CanvasBindingCreate(BaseModel):
    element_id: str
    anchor_mode: str = "inline"
    wrap_mode: str = "rect"
    anchor_line: Optional[int] = None
    offset_x: float = 0
    offset_y: float = 0
    z_index: int = 0
    metadata: dict = Field(default_factory=dict)


class CanvasBindingUpdate(BaseModel):
    anchor_mode: Optional[str] = None
    wrap_mode: Optional[str] = None
    anchor_line: Optional[int] = None
    offset_x: Optional[float] = None
    offset_y: Optional[float] = None
    z_index: Optional[int] = None
    metadata: Optional[dict] = None


class PageDocumentUpdate(BaseModel):
    default_font: Optional[str] = None
    content_width: Optional[int] = None
    line_height: Optional[float] = None
    left_padding: Optional[int] = None
    right_padding: Optional[int] = None
    metadata: Optional[dict] = None


class PageRevisionCreate(BaseModel):
    scene_data: dict = Field(default_factory=dict)
    viewport: Optional[dict] = None
    ops: list[dict] = Field(default_factory=list)
    source: str = "manual"
    changed_by: str = "user"
    message: Optional[str] = None


# ── Chat History ──

class ChatSave(BaseModel):
    context_type: str = "home"
    context_id: Optional[str] = None
    messages: list[dict]
    title: Optional[str] = None


# ── Canvas State ──

class CanvasState(BaseModel):
    page: dict
    notes: list[dict]
    edges: list[dict]
    elements: list[dict]
    clusters: list[dict]
    viewport: dict


# ── Curator ──

class CuratorReport(BaseModel):
    potential_duplicates: list[dict]
    orphan_notes: list[dict]
    stale_notes: list[dict]
    cluster_issues: list[dict]
    missing_connections: list[dict]
    auto_applied: int
    needs_confirmation: list[dict]


class CuratorAction(BaseModel):
    action_type: str
    params: dict


# ── Routing / Stats ──

class PageRoutingResult(BaseModel):
    page_id: str
    page_name: str
    confidence: float
    reason: str


class StatsResponse(BaseModel):
    total_notes: int
    total_pages: int
    total_tags: int
    total_tasks: int
    status_counts: dict
    last_capture: Optional[str] = None


class TagWithCount(BaseModel):
    name: str
    count: int