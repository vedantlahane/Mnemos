# === FILE: backend/app/models/schemas.py ===

from pydantic import BaseModel, Field, model_validator
from typing import Optional


class CaptureRequest(BaseModel):
    text: str
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    capture_type: str = "manual"
    page_hint: Optional[str] = None
    custom_command: Optional[str] = None
    viewport: Optional[dict] = None


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    context_type: str = "home"
    page_id: Optional[str] = None


class ContextRequest(BaseModel):
    url: str
    text: str


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    tasks: Optional[list[str]] = None
    entities: Optional[list[str]] = None
    page_id: Optional[str] = None
    metadata: Optional[dict] = None


class NoteMoveRequest(BaseModel):
    page_id: str


class ProcessedCapture(BaseModel):
    title: str
    summary: str
    tags: list[str]
    tasks: list[str]
    entities: list[str]
    content_type: str = "note"


class PageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: str = "📄"
    color: str = "#6366f1"
    layout_mode: str = "canvas"


class PageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_archived: Optional[bool] = None
    layout_mode: Optional[str] = None


class SceneSave(BaseModel):
    elements: list[dict] = []
    appState: dict = Field(default_factory=dict)
    files: dict = Field(default_factory=dict)


class ViewportSave(BaseModel):
    scroll_x: float = 0
    scroll_y: float = 0
    zoom: float = 1.0


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


class RegionCreate(BaseModel):
    page_id: str
    label: str
    description: Optional[str] = None
    color: str = "#6366f1"
    region_type: str = "cluster"
    layout_hint: str = "auto"


class RegionUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    layout_hint: Optional[str] = None


class PageBlockCreate(BaseModel):
    block_type: str = "paragraph"
    text_content: Optional[str] = None
    parent_block_id: Optional[str] = None
    prev_block_id: Optional[str] = None
    next_block_id: Optional[str] = None
    order_key: Optional[float] = None
    depth: int = 0
    attrs: dict = Field(default_factory=dict)
    note_id: Optional[str] = None
    provenance: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    created_by: str = "user"


class PageBlockUpdate(BaseModel):
    text_content: Optional[str] = None
    parent_block_id: Optional[str] = None
    order_key: Optional[float] = None
    depth: Optional[int] = None
    block_type: Optional[str] = None
    attrs: Optional[dict] = None
    provenance: Optional[dict] = None
    metadata: Optional[dict] = None
    is_deleted: Optional[bool] = None


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
    url: Optional[str] = None
    inline_position: dict = Field(default_factory=dict)
    display_mode: str = "inline-card"
    width: Optional[int] = None
    height: Optional[int] = None
    attrs: dict = Field(default_factory=dict)
    created_by: str = "user"

    @model_validator(mode="after")
    def _validate_single_target(self):
        targets = [self.target_page_id, self.target_note_id, self.target_block_id, self.url]
        count = sum(1 for t in targets if t)
        if count != 1:
            raise ValueError("inline embed must point to exactly one target")
        return self


class PageDocumentUpdate(BaseModel):
    default_font: Optional[str] = None
    content_width: Optional[int] = None
    line_height: Optional[float] = None
    left_padding: Optional[int] = None
    right_padding: Optional[int] = None
    metadata: Optional[dict] = None


class ChatSave(BaseModel):
    context_type: str = "home"
    context_id: Optional[str] = None
    messages: list[dict]
    title: Optional[str] = None


class CuratorAction(BaseModel):
    action_type: str
    params: dict


class PageRevisionCreate(BaseModel):
    scene_data: dict = Field(default_factory=dict)
    viewport: Optional[dict] = None
    ops: list[dict] = Field(default_factory=list)
    source: str = "manual"
    changed_by: str = "user"
    message: Optional[str] = None