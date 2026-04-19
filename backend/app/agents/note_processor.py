"""
Note processing LangGraph pipeline.
Uses capture service internally — this is the graph wrapper.
"""

from langgraph.graph import StateGraph, END
from app.agents.state import NoteProcessorState
from app.services.capture import process_note
import logging

logger = logging.getLogger("mnemos.note_processor")


async def process_node(state: NoteProcessorState) -> dict:
    """Single node that runs the full pipeline."""
    await process_note(
        note_id=state["note_id"],
        raw_text=state["raw_text"],
        page_hint=state.get("page_hint"),
        viewport=state.get("viewport"),
    )
    return {"status": "done"}


def build_graph():
    graph = StateGraph(NoteProcessorState)
    graph.add_node("process", process_node)
    graph.set_entry_point("process")
    graph.add_edge("process", END)
    return graph.compile()


note_processor_graph = build_graph()