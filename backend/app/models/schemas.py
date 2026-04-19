from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


# ── Capture ──

class CaptureRequest(BaseModel):
    text: str
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    capture_type: str = "manual"
    page_hint: Optional[str] = None
    viewport: Optional[dict] = None


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
    is_archived: Optional[bool] = None


# ── Scene / Sync ──

class SceneSave(BaseModel):
    elements: list[dict] = []
    appState: dict = Field(default_factory=dict)
    files: dict = Field(default_factory=dict)


class SyncRequest(BaseModel):
    base_version: int
    changes: dict = Field(default_factory=dict)  # {added:[], modified:[], deleted:[]}
    full_scene: Optional[dict] = None  # fallback for large diffs


class ViewportSave(BaseModel):
    scroll_x: float = 0
    scroll_y: float = 0
    zoom: float = 1.0


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


# ── Chat ──

class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    context_type: str = "home"
    page_id: Optional[str] = None


# ── Canvas Chat ──

class CanvasChatRequest(BaseModel):
    message: str
    viewport: Optional[dict] = None
    history: list[dict] = []
    selected_element_ids: list[str] = []


# ── AI ──

class CuratorAction(BaseModel):
    action_type: str
    params: dict