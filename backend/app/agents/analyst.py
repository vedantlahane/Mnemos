"""
LangGraph agent: handles gap analysis, reading paths, page summaries, curator scans.
"""

from langgraph.graph import StateGraph, END
from app.agents.state import AnalystState
from app.db.supabase import db
from app.llm import router as llm


async def load_notes_node(state: AnalystState) -> dict:
    page_id = state.get("page_id")
    if page_id:
        notes = await db.get_notes_for_page(page_id)
    else:
        result = await db.list_notes(page=1, limit=200)
        notes = result.get("notes", [])
    return {"notes": notes, "status": "analyzing"}


async def gap_analysis_node(state: AnalystState) -> dict:
    notes = state.get("notes", [])
    if not notes:
        return {
            "result": {"covered": [], "missing": ["No notes captured yet"], "suggestions": ["Start capturing notes on any topic"]},
            "status": "done",
        }

    topic = state.get("topic") or "general knowledge"
    if state.get("page_id"):
        page = await db.get_page(state["page_id"])
        if page:
            topic = page.get("name", topic)

    notes_info = "\n".join(
        f"- {n.get('title', 'Untitled')}: {(n.get('summary') or n.get('raw_text', ''))[:200]}"
        for n in notes[:30]
    )

    try:
        result = await llm.analyze_gaps(topic, notes_info)
        return {"result": result, "status": "done"}
    except Exception as e:
        return {
            "result": {"covered": [], "missing": [], "suggestions": [f"Analysis failed: {e}"]},
            "errors": state.get("errors", []) + [str(e)],
            "status": "done",
        }


async def reading_path_node(state: AnalystState) -> dict:
    notes = state.get("notes", [])
    if not notes:
        return {"result": {"steps": []}, "status": "done"}

    topic = state.get("topic") or "all topics"
    notes_info = "\n".join(
        f"- [{n['id'][:8]}] {n.get('title', 'Untitled')}: {(n.get('summary') or '')[:150]} (tags: {', '.join(n.get('tags') or [])})"
        for n in notes[:30]
    )

    try:
        steps = await llm.generate_reading_path(topic, notes_info)
        # Map partial IDs back to full IDs
        id_map = {n["id"][:8]: n["id"] for n in notes}
        for step in steps:
            note_id = step.get("noteId")
            if note_id and len(note_id) == 8 and note_id in id_map:
                step["noteId"] = id_map[note_id]
        return {"result": {"steps": steps}, "status": "done"}
    except Exception as e:
        return {
            "result": {"steps": []},
            "errors": state.get("errors", []) + [str(e)],
            "status": "done",
        }


async def page_summary_node(state: AnalystState) -> dict:
    notes = state.get("notes", [])
    page_id = state.get("page_id")

    if not notes:
        return {
            "result": {"summary": "No notes on this page yet.", "key_topics": [], "connections": []},
            "status": "done",
        }

    page_name = "Unknown"
    if page_id:
        page = await db.get_page(page_id)
        if page:
            page_name = page.get("name", "Unknown")

    notes_info = "\n".join(
        f"- {n.get('title', 'Untitled')}: {(n.get('summary') or n.get('raw_text', ''))[:300]}"
        for n in notes[:20]
    )

    try:
        result = await llm.generate_page_summary(page_name, notes_info)
        return {"result": result, "status": "done"}
    except Exception as e:
        return {
            "result": {"summary": f"Summary generation failed: {e}", "key_topics": [], "connections": []},
            "status": "done",
        }


def route_task(state: AnalystState) -> str:
    task = state.get("task", "")
    if task == "gap_analysis":
        return "gap_analysis"
    elif task == "reading_path":
        return "reading_path"
    elif task == "page_summary":
        return "page_summary"
    return "gap_analysis"


def build_analyst_graph():
    graph = StateGraph(AnalystState)

    graph.add_node("load_notes", load_notes_node)
    graph.add_node("gap_analysis", gap_analysis_node)
    graph.add_node("reading_path", reading_path_node)
    graph.add_node("page_summary", page_summary_node)

    graph.set_entry_point("load_notes")
    graph.add_conditional_edges("load_notes", route_task, {
        "gap_analysis": "gap_analysis",
        "reading_path": "reading_path",
        "page_summary": "page_summary",
    })
    graph.add_edge("gap_analysis", END)
    graph.add_edge("reading_path", END)
    graph.add_edge("page_summary", END)

    return graph.compile()


analyst_graph = build_analyst_graph()