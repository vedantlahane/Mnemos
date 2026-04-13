"""
LangGraph state definitions for all agents.
"""

from typing import TypedDict, Optional, Annotated
from langgraph.graph.message import add_messages


class NoteProcessorState(TypedDict):
    note_id: str
    raw_text: str
    page_hint: Optional[str]
    title: Optional[str]
    summary: Optional[str]
    tags: list[str]
    tasks: list[str]
    entities: list[str]
    embedding: Optional[list[float]]
    related_notes: list[dict]
    page_id: Optional[str]
    page_name: Optional[str]
    canvas_x: Optional[float]
    canvas_y: Optional[float]
    cluster_id: Optional[str]
    errors: list[str]
    status: str  # "extracting" | "embedding" | "routing" | "connecting" | "placing" | "done" | "failed"


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
    task: str  # "gap_analysis" | "reading_path" | "page_summary" | "curator_scan"
    page_id: Optional[str]
    topic: Optional[str]
    notes: list[dict]
    result: Optional[dict]
    errors: list[str]
    status: str