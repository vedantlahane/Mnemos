from pydantic import BaseModel
from typing import Optional


class CaptureRequest(BaseModel):
    text: str
    source_url: Optional[str] = None
    page_title: Optional[str] = None
    capture_type: str = "highlight"


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []


class ContextRequest(BaseModel):
    url: str
    text: str


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    tasks: Optional[list[str]] = None


class ProcessedCapture(BaseModel):
    title: str
    summary: str
    tags: list[str]
    tasks: list[str]
    entities: list[str]