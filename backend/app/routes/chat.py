# === FILE: backend/app/routes/chat.py ===
"""Home chat — not tied to a specific canvas page."""

from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest
from app.db.supabase import db
from app.services import embeddings
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.chat")
router = APIRouter()


@router.post("/chat")
async def home_chat(payload: ChatRequest, user_id: str = Depends(get_optional_user_id)):
    question = payload.question.strip()
    if not question:
        return {"response": "What would you like to know?", "sources": []}

    # Gather context from notes
    context_parts = []
    sources = []
    try:
        emb = await embeddings.generate_query(question)
        relevant = await db.vector_search(emb, limit=8, threshold=0.55)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]
        for note in relevant:
            context_parts.append(
                f"[{note.get('title', 'Untitled')}]: {note.get('summary') or note.get('raw_text', '')[:300]}"
            )
            sources.append({
                "id": note["id"], "title": note.get("title", "Untitled"),
                "similarity": note.get("similarity", 0),
            })
    except Exception as e:
        logger.warning(f"Context search failed: {e}")

    context = "\n\n".join(context_parts) if context_parts else "No relevant notes found."

    system_prompt = """You are Mnemos, a knowledge assistant. Answer using the user's notes as primary source.
If the notes don't cover the question, say so and use general knowledge.
Be concise and helpful. Cite note titles when referencing them."""

    messages = [{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}]
    for h in payload.history[-6:]:
        messages.insert(0, h)

    try:
        response = await llm.chat(system_prompt, messages, user_id=user_id)
    except Exception as e:
        logger.error(f"Chat LLM failed: {e}")
        response = "I'm having trouble generating a response right now. Please try again."

    return {"response": response, "sources": sources}