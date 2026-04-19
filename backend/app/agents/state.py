from typing import TypedDict, Optional


class NoteProcessorState(TypedDict):
    note_id: str
    raw_text: str
    page_hint: Optional[str]
    viewport: Optional[dict]
    title: Optional[str]
    summary: Optional[str]
    tags: list[str]
    tasks: list[str]
    entities: list[str]
    content_type: str
    embedding: Optional[list[float]]
    related_notes: list[dict]
    page_id: Optional[str]
    page_name: Optional[str]
    errors: list[str]
    status: str