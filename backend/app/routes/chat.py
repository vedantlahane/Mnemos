from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest
from app.services import embeddings
from app.db.supabase import db
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class IntentRequest(BaseModel):
    question: str
    context_type: str = "home"
    page_id: Optional[str] = None


CONTEXT_COMMANDS: dict[str, list[str]] = {
    "home": [
        "/pages", "/page", "/open", "/search", "/notes", "/tags", "/tasks", "/stats",
        "/capture", "/curator", "/gaps", "/reading", "/export", "/settings", "/history", "/help",
    ],
    "page": [
        "/find", "/add", "/compose", "/diagram", "/layout", "/summarize", "/page-stats",
        "/bg", "/theme", "/style", "/style-lock", "/style-confirm", "/rename", "/search",
        "/capture", "/gaps", "/reading", "/help", "/close", "/home",
    ],
    "settings": ["/home", "/help", "/history"],
    "history": ["/home", "/help", "/open"],
}


@router.post("/chat/intent")
async def chat_intent(payload: IntentRequest, user_id: str = Depends(get_optional_user_id)):
    context_type = payload.context_type if payload.context_type in CONTEXT_COMMANDS else "home"
    page_name = None
    if context_type == "page" and payload.page_id:
        try:
            page = await db.get_page(payload.page_id)
            if page:
                page_name = page.get("name")
        except Exception:
            page_name = None

    available_commands = CONTEXT_COMMANDS.get(context_type, CONTEXT_COMMANDS["home"])
    decision = await llm.decide_command_intent(
        question=payload.question,
        context_type=context_type,
        page_name=page_name,
        available_commands=available_commands,
    )
    return decision


@router.post("/chat")
async def chat_with_notes(payload: ChatRequest, user_id: str = Depends(get_optional_user_id)):
    query_embedding = await embeddings.generate_query(payload.question)

    # Scoped or global search
    if payload.context_type == "page" and payload.page_id:
        relevant = await db.vector_search_in_page(
            query_embedding,
            page_id=payload.page_id,
            limit=5,
            threshold=0.60,
        )
        if len(relevant) < 2:
            global_results = await db.vector_search(
                query_embedding, limit=5, threshold=0.65
            )
            seen = {r["id"] for r in relevant}
            for r in global_results:
                if r["id"] not in seen:
                    relevant.append(r)
                    seen.add(r["id"])
    else:
        relevant = await db.vector_search(
            query_embedding, limit=5, threshold=0.65
        )

    if not relevant:
        return {
            "answer": "I couldn't find any related notes in your knowledge base.",
            "sources": [],
            "follow_ups": ["What topics have I captured notes on?", "Show me my recent notes"],
        }

    # Graph expansion
    expanded_ids = set(r["id"] for r in relevant)
    extra_context_notes = []
    for r in relevant[:3]:
        try:
            edges = await db.get_edges_for_note(r["id"])
            for edge in edges[:2]:
                neighbor_id = edge["target_id"] if edge["source_id"] == r["id"] else edge["source_id"]
                if neighbor_id not in expanded_ids:
                    neighbor = await db.get_note(neighbor_id)
                    if neighbor:
                        extra_context_notes.append(neighbor)
                        expanded_ids.add(neighbor_id)
        except Exception:
            pass

    # Build context
    context_parts = []
    for n in relevant:
        context_parts.append(
            f"Note: {n['title']}\n"
            f"Summary: {n.get('summary', 'No summary')}\n"
            f"Content: {n['raw_text'][:1000]}\n"
            f"Tags: {', '.join(n.get('tags', []))}"
        )
    for n in extra_context_notes[:3]:
        context_parts.append(
            f"Related Note: {n.get('title', 'Untitled')}\n"
            f"Summary: {n.get('summary', 'No summary')}\n"
            f"Content: {n.get('raw_text', '')[:500]}"
        )
    context = "\n\n---\n\n".join(context_parts)

    page_context = None
    if payload.context_type == "page" and payload.page_id:
        try:
            page = await db.get_page(payload.page_id)
            if page:
                page_context = page["name"]
        except Exception:
            pass

    answer = await llm.chat(
        question=payload.question,
        context=context,
        history=payload.history,
        page_context=page_context,
    )

    follow_ups = []
    try:
        follow_ups = await llm.generate_follow_ups(payload.question, answer)
    except Exception as e:
        print(f"Follow-up generation failed: {e}")

    sources = [
        {
            "id": n["id"],
            "title": n["title"],
            "similarity": n.get("similarity", 0.0),
        }
        for n in relevant
    ]

    return {
        "answer": answer,
        "sources": sources,
        "follow_ups": follow_ups,
    }