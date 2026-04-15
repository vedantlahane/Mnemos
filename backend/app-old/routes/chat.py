# === FILE: backend/app/routes/chat.py ===

from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest
from app.services import embeddings
from app.db.supabase import db
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.post("/chat")
async def chat_with_notes(payload: ChatRequest, user_id: str = Depends(get_optional_user_id)):
    query_embedding = await embeddings.generate_query(payload.question)

    if payload.context_type == "page" and payload.page_id:
        page = await db.get_page(payload.page_id, user_id=user_id)
        if not page:
            relevant = []
        else:
            relevant = await db.vector_search_in_page(
                query_embedding, page_id=payload.page_id, limit=5, threshold=0.60,
            )
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]
        if len(relevant) < 2:
            global_results = await db.vector_search(query_embedding, limit=5, threshold=0.65)
            if user_id:
                global_results = [r for r in global_results if r.get("user_id") == user_id]
            seen = {r["id"] for r in relevant}
            for r in global_results:
                if r["id"] not in seen:
                    relevant.append(r)
    else:
        relevant = await db.vector_search(query_embedding, limit=5, threshold=0.65)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]

    if not relevant:
        return {
            "answer": "I couldn't find any related notes. Try capturing some notes on this topic, or ask me to 'write about [topic]' to generate content.",
            "sources": [],
            "follow_ups": ["What topics have I captured?", "Show my recent notes"],
        }

    # Graph expansion
    expanded_ids = {r["id"] for r in relevant}
    extra_notes = []
    for r in relevant[:3]:
        try:
            edges = await db.get_edges_for_note(r["id"])
            for edge in edges[:2]:
                neighbor_id = edge["target_id"] if edge["source_id"] == r["id"] else edge["source_id"]
                if neighbor_id not in expanded_ids:
                    neighbor = await db.get_note(neighbor_id, user_id=user_id)
                    if neighbor:
                        extra_notes.append(neighbor)
                        expanded_ids.add(neighbor_id)
        except Exception:
            pass

    context_parts = []
    for n in relevant:
        context_parts.append(
            f"Note: {n['title']}\nSummary: {n.get('summary', 'No summary')}\n"
            f"Content: {n['raw_text'][:1000]}\nTags: {', '.join(n.get('tags', []))}"
        )
    for n in extra_notes[:3]:
        context_parts.append(
            f"Related Note: {n.get('title', 'Untitled')}\n"
            f"Summary: {n.get('summary', 'No summary')}\nContent: {n.get('raw_text', '')[:500]}"
        )
    context = "\n\n---\n\n".join(context_parts)

    page_context = None
    if payload.context_type == "page" and payload.page_id:
        try:
            page = await db.get_page(payload.page_id, user_id=user_id)
            if page:
                page_context = page["name"]
        except Exception:
            pass

    answer = await llm.chat(
        question=payload.question, context=context,
        history=payload.history, page_context=page_context, user_id=user_id,
    )

    follow_ups = []
    try:
        follow_ups = await llm.generate_follow_ups(payload.question, answer, user_id=user_id)
    except Exception:
        pass

    sources = [{"id": n["id"], "title": n["title"], "similarity": n.get("similarity", 0.0)} for n in relevant]
    return {"answer": answer, "sources": sources, "follow_ups": follow_ups}