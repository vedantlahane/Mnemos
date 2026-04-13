from pydantic import BaseModel
from typing import Optional


# ── Capture / Chat ────────────────────────────────────

class CaptureRequest(BaseModel):
    text: str
    source_url: Optional[str] = None
    page_title: Optional[str] = None
    capture_type: str = "manual"
    page_hint: Optional[str] = None
    custom_command: Optional[str] = None


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    context_type: str = "home"
    page_id: Optional[str] = None


class ContextRequest(BaseModel):
    url: str
    text: str


# ── Notes ─────────────────────────────────────────────

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


class NoteMoveRequest(BaseModel):
    page_id: str


class ProcessedCapture(BaseModel):
    title: str
    summary: str
    tags: list[str]
    tasks: list[str]
    entities: list[str]


# ── Pages ─────────────────────────────────────────────

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
    viewport: Optional[dict] = None
    is_archived: Optional[bool] = None


# ── Edges ─────────────────────────────────────────────

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


# ── Clusters ──────────────────────────────────────────

class ClusterCreate(BaseModel):
    page_id: str
    label: str
    description: Optional[str] = None
    color: str = "#6366f1"


class ClusterUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


# ── Canvas Elements ───────────────────────────────────

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


# ── Chat History ──────────────────────────────────────

class ChatSave(BaseModel):
    context_type: str = "home"
    context_id: Optional[str] = None
    messages: list[dict]
    title: Optional[str] = None


# ── Canvas State ──────────────────────────────────────

class CanvasState(BaseModel):
    page: dict
    notes: list[dict]
    edges: list[dict]
    elements: list[dict]
    clusters: list[dict]
    viewport: dict


# ── Curator ───────────────────────────────────────────

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


# ── Routing / Stats ───────────────────────────────────

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