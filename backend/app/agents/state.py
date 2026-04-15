# === FILE: backend/app/agents/state.py ===

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


class CanvasBrainState(TypedDict):
    user_message: str
    page_id: str
    user_id: Optional[str]
    viewport: Optional[dict]
    visual_context: Optional[dict]
    history: list[dict]
    selected_element_ids: list[str]
    intent: str
    sub_intent: str
    target_topic: str
    intent_metadata: dict
    operations: list[dict]
    chat_response: Optional[str]
    sources: list[dict]
    follow_ups: list[str]
    errors: list[str]
    status: str


class AnalystState(TypedDict):
    task: str
    page_id: Optional[str]
    user_id: Optional[str]
    topic: Optional[str]
    notes: list[dict]
    result: Optional[dict]
    errors: list[str]
    status: str