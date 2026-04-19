"""Content composition — AI writes on the canvas."""

from __future__ import annotations
import logging
from typing import AsyncIterator

from app.db.supabase import db
from app.services import embeddings
from app.llm import router as llm
from app.llm.google_provider import get_google_llm
from app.llm.groq_provider import get_groq_llm
from app.config import settings
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger("mnemos.compose")

COMPOSE_SYSTEM = """You are a knowledge composition assistant for a visual canvas.
Rules:
- Write clear, well-structured content about the requested topic.
- Use the user's existing notes as primary sources — cite them by title.
- If notes are insufficient, use general knowledge but note that explicitly.
- Format for canvas display: short paragraphs, bullet points, headers.
- Keep it concise but comprehensive (200-400 words).
- Use **bold** for emphasis, - for lists.
- Do NOT add meta-commentary — just write the content directly."""


async def compose_content(topic: str, page_id: str = None,
                          user_id: str = None) -> str:
    context = await _gather_context(topic, page_id, user_id)
    prompt = f"Topic: {topic}\n\n"
    if context:
        prompt += f"Relevant notes:\n{context}\n\nWrite using these notes as primary source."
    else:
        prompt += "No existing notes found. Write using general knowledge."

    try:
        from app.llm.google_provider import google_chat_call
        return await google_chat_call(COMPOSE_SYSTEM, [{"role": "user", "content": prompt}])
    except Exception:
        from app.llm.groq_provider import groq_chat_call
        return await groq_chat_call(COMPOSE_SYSTEM, [{"role": "user", "content": prompt}])


async def stream_compose(topic: str, page_id: str = None,
                         user_id: str = None) -> AsyncIterator[str]:
    context = await _gather_context(topic, page_id, user_id)
    prompt = f"Topic: {topic}\n\n"
    if context:
        prompt += f"Relevant notes:\n{context}\n\nWrite using these notes."
    else:
        prompt += "No existing notes found. Write using general knowledge."

    primary, _ = await llm._runtime_models(user_id)
    try:
        llm_inst = _streaming_llm(primary)
        messages = [SystemMessage(content=COMPOSE_SYSTEM), HumanMessage(content=prompt)]
        async for chunk in llm_inst.astream(messages):
            text = chunk.content if hasattr(chunk, "content") else str(chunk)
            if text:
                yield text
    except Exception as e:
        logger.warning(f"Stream failed: {e}, falling back")
        full = await compose_content(topic, page_id, user_id)
        # Yield in chunks
        chunk_size = 120
        for i in range(0, len(full), chunk_size):
            yield full[i:i + chunk_size]


async def _gather_context(topic: str, page_id: str | None,
                          user_id: str | None, max_notes: int = 8) -> str:
    try:
        emb = await embeddings.generate_query(topic)
        if page_id:
            relevant = await db.vector_search_in_page(emb, page_id, limit=max_notes, threshold=0.5)
            if len(relevant) < 2:
                extra = await db.vector_search(emb, limit=max_notes, threshold=0.55)
                seen = {r["id"] for r in relevant}
                relevant.extend(r for r in extra if r["id"] not in seen)
        else:
            relevant = await db.vector_search(emb, limit=max_notes, threshold=0.55)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]
        if not relevant:
            return ""
        return "\n\n".join(
            f"[{n.get('title', 'Untitled')}]: {n.get('summary') or n.get('raw_text', '')[:300]}"
            for n in relevant[:max_notes]
        )
    except Exception as e:
        logger.warning(f"Context gather failed: {e}")
        return ""


def _streaming_llm(model: str):
    m = (model or "").lower()
    if any(t in m for t in ["llama", "mixtral", "qwen", "deepseek", "gemma"]) and settings.groq_api_key:
        return get_groq_llm(model=model, temperature=0.3)
    return get_google_llm(model=model if "gemini" in m else None, temperature=0.3)