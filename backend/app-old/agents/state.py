# === FILE: backend/app/agents/state.py ===
"""
LangGraph state definitions for all agents.
"""

from typing import TypedDict, Optional


class NoteProcessorState(TypedDict):
    note_id: str
    raw_text: str
    page_hint: Optional[str]
    viewport: Optional[dict]  # {x, y, width, height, zoom}
    title: Optional[str]
    summary: Optional[str]
    tags: list[str]
    tasks: list[str]
    entities: list[str]
    content_type: str  # note|code|url|thought|question
    embedding: Optional[list[float]]
    related_notes: list[dict]
    page_id: Optional[str]
    page_name: Optional[str]
    canvas_x: Optional[float]
    canvas_y: Optional[float]
    cluster_id: Optional[str]
    errors: list[str]
    status: str


class CanvasArchitectState(TypedDict):
    page_id: str
    notes: list[dict]
    embeddings_matrix: Optional[list]
    coords_2d: Optional[list]
    cluster_labels: Optional[list]
    cluster_map: dict
    centrality_scores: dict
    bridge_notes: list[str]
    positions: list[dict]
    clusters: list[dict]
    edges: list[dict]
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


class CanvasBrainState(TypedDict):
    """State for the canvas brain orchestrator agent."""
    user_message: str
    page_id: str
    user_id: Optional[str]
    viewport: Optional[dict]
    canvas_snapshot: Optional[dict]
    history: list[dict]
    selected_element_ids: list[str]
    # Classification
    intent: str
    sub_intent: str
    target_topic: str
    intent_metadata: dict
    # Execution results
    operations: list[dict]
    chat_response: Optional[str]
    sources: list[dict]
    follow_ups: list[str]
    errors: list[str]
    status: str