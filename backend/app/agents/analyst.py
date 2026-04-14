# === FILE: backend/app/agents/analyst.py ===
"""
LangGraph agent: gap analysis, reading paths, page summaries, curator scans.
"""

from collections import Counter
from langgraph.graph import StateGraph, END
from app.agents.state import AnalystState
from app.db.supabase import db
from app.llm import router as llm
import logging

logger = logging.getLogger("mnemos.analyst")


def _top_topics(notes: list[dict], limit: int = 5) -> list[str]:
    tags = []
    for n in notes:
        tags.extend([t for t in (n.get("tags") or []) if isinstance(t, str) and t.strip()])
    if tags:
        return [name for name, _ in Counter(tags).most_common(limit)]
    titles = [n.get("title") for n in notes if isinstance(n.get("title"), str) and n.get("title").strip()]
    return titles[:limit]


def _normalize_str_list(value: object, limit: int = 8) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
    return out[:limit]


def _fallback_gap_result(notes: list[dict], topic: str) -> dict:
    topics = _top_topics(notes)
    return {
        "covered": topics[:3],
        "missing": [f"Foundational overview for {topic}", f"Practical examples for {topic}"],
        "suggestions": ["Capture 3-5 notes that fill missing subtopics.", "Link related notes with explicit edges."],
    }


def _fallback_reading_steps(notes: list[dict], topic: str) -> list[dict]:
    candidates = sorted(
        [n for n in notes if n.get("id")],
        key=lambda n: (n.get("created_at") or "", n.get("title") or ""),
    )
    return [
        {"title": n.get("title") or "Untitled", "noteId": n.get("id"), "reason": f"Build context for {topic}."}
        for n in candidates[:12]
    ]


def _fallback_page_summary(notes: list[dict], page_name: str) -> dict:
    topics = _top_topics(notes)
    snippets = []
    for n in notes[:5]:
        title = n.get("title") or "Untitled"
        summary = (n.get("summary") or n.get("raw_text") or "")[:120]
        if summary:
            snippets.append(f"{title}: {summary}")
    text = " ".join(snippets).strip() or f"{page_name} has notes, but summaries are still sparse."
    return {
        "summary": text,
        "key_topics": topics[:5],
        "connections": ["Connect notes with explicit dependencies to improve navigation."],
    }


def _normalize_gap_result(result: object, notes: list[dict], topic: str) -> dict:
    if not isinstance(result, dict):
        return _fallback_gap_result(notes, topic)
    covered = _normalize_str_list(result.get("covered"))
    missing = _normalize_str_list(result.get("missing"))
    suggestions = _normalize_str_list(result.get("suggestions"))
    if not (covered or missing or suggestions):
        return _fallback_gap_result(notes, topic)
    return {"covered": covered, "missing": missing, "suggestions": suggestions}


def _normalize_reading_steps(steps: object, notes: list[dict], topic: str) -> list[dict]:
    if not isinstance(steps, list):
        return _fallback_reading_steps(notes, topic)
    normalized = []
    for step in steps[:20]:
        if not isinstance(step, dict):
            continue
        title = str(step.get("title") or "").strip()
        reason = str(step.get("reason") or "").strip()
        note_id = step.get("noteId")
        normalized.append({
            "title": title or "Untitled",
            "noteId": note_id if isinstance(note_id, str) else None,
            "reason": reason or "Recommended next.",
        })
    return normalized if normalized else _fallback_reading_steps(notes, topic)


def _normalize_page_summary(result: object, notes: list[dict], page_name: str) -> dict:
    if not isinstance(result, dict):
        return _fallback_page_summary(notes, page_name)
    summary = str(result.get("summary") or "").strip()
    key_topics = _normalize_str_list(result.get("key_topics"), limit=10)
    connections = _normalize_str_list(result.get("connections"), limit=10)
    if not summary:
        fallback = _fallback_page_summary(notes, page_name)
        summary = fallback["summary"]
        if not key_topics:
            key_topics = fallback["key_topics"]
    return {"summary": summary, "key_topics": key_topics, "connections": connections}


async def load_notes_node(state: AnalystState) -> dict:
    page_id = state.get("page_id")
    user_id = state.get("user_id")
    if page_id:
        notes = await db.get_notes_for_page(page_id, user_id=user_id)
    else:
        result = await db.list_notes(page=1, limit=200, user_id=user_id)
        notes = result.get("notes", [])
    return {"notes": notes, "status": "analyzing"}


async def gap_analysis_node(state: AnalystState) -> dict:
    notes = state.get("notes", [])
    user_id = state.get("user_id")
    if not notes:
        return {
            "result": {"covered": [], "missing": ["No notes captured yet"], "suggestions": ["Start capturing notes"]},
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
        result = await llm.analyze_gaps(topic, notes_info, user_id=user_id)
        return {"result": _normalize_gap_result(result, notes, topic), "status": "done"}
    except Exception as e:
        return {
            "result": _fallback_gap_result(notes, topic),
            "errors": state.get("errors", []) + [str(e)],
            "status": "done",
        }


async def reading_path_node(state: AnalystState) -> dict:
    notes = state.get("notes", [])
    user_id = state.get("user_id")
    if not notes:
        return {"result": {"steps": []}, "status": "done"}

    topic = state.get("topic") or "all topics"
    notes_info = "\n".join(
        f"- [{n['id'][:8]}] {n.get('title', 'Untitled')}: {(n.get('summary') or '')[:150]} (tags: {', '.join(n.get('tags') or [])})"
        for n in notes[:30]
    )

    try:
        steps = await llm.generate_reading_path(topic, notes_info, user_id=user_id)
        steps = _normalize_reading_steps(steps, notes, topic)
        id_map = {n["id"][:8]: n["id"] for n in notes}
        for step in steps:
            note_id = step.get("noteId")
            if note_id and len(note_id) == 8 and note_id in id_map:
                step["noteId"] = id_map[note_id]
        return {"result": {"steps": steps}, "status": "done"}
    except Exception as e:
        return {
            "result": {"steps": _fallback_reading_steps(notes, topic)},
            "errors": state.get("errors", []) + [str(e)],
            "status": "done",
        }


async def page_summary_node(state: AnalystState) -> dict:
    notes = state.get("notes", [])
    page_id = state.get("page_id")
    user_id = state.get("user_id")

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
        result = await llm.generate_page_summary(page_name, notes_info, user_id=user_id)
        return {"result": _normalize_page_summary(result, notes, page_name), "status": "done"}
    except Exception as e:
        return {
            "result": _fallback_page_summary(notes, page_name),
            "errors": state.get("errors", []) + [str(e)],
            "status": "done",
        }


async def curator_scan_node(state: AnalystState) -> dict:
    try:
        from app.services.curator import curator
        report = await curator.full_scan(user_id=state.get("user_id"))
        return {"result": report, "status": "done"}
    except Exception as e:
        return {
            "result": {
                "potential_duplicates": [], "orphan_notes": [], "stale_notes": [],
                "cluster_issues": [], "missing_connections": [],
                "auto_applied": 0, "needs_confirmation": [],
            },
            "errors": state.get("errors", []) + [str(e)],
            "status": "done",
        }


def route_task(state: AnalystState) -> str:
    task = state.get("task", "gap_analysis")
    valid = {"gap_analysis", "reading_path", "page_summary", "curator_scan"}
    return task if task in valid else "gap_analysis"


def build_analyst_graph():
    graph = StateGraph(AnalystState)

    graph.add_node("load_notes", load_notes_node)
    graph.add_node("gap_analysis", gap_analysis_node)
    graph.add_node("reading_path", reading_path_node)
    graph.add_node("page_summary", page_summary_node)
    graph.add_node("curator_scan", curator_scan_node)

    graph.set_entry_point("load_notes")
    graph.add_conditional_edges("load_notes", route_task, {
        "gap_analysis": "gap_analysis",
        "reading_path": "reading_path",
        "page_summary": "page_summary",
        "curator_scan": "curator_scan",
    })
    graph.add_edge("gap_analysis", END)
    graph.add_edge("reading_path", END)
    graph.add_edge("page_summary", END)
    graph.add_edge("curator_scan", END)

    return graph.compile()


analyst_graph = build_analyst_graph()