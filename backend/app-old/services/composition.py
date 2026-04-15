# === FILE: backend/app/services/composition.py ===
"""
Composition service — generates content for canvas placement.
Handles "write about X", "explain Y", etc.
Uses notes + optional web context, streams output.
"""

from __future__ import annotations
import logging
from typing import AsyncIterator, Optional

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
- If notes are insufficient, use your general knowledge but note that explicitly.
- Format for canvas display: use short paragraphs, bullet points, and headers.
- Keep it concise but comprehensive (aim for 200-400 words).
- Use markdown-style formatting: **bold** for emphasis, - for lists.
- Do NOT use code fences unless the user asked for code.
- Do NOT add meta-commentary like "Here's what I found" — just write the content directly."""

COMPOSE_WITH_WEB_SYSTEM = """You are a knowledge composition assistant for a visual canvas.

Rules:
- Combine the user's notes with additional context to write comprehensive content.
- Always cite which notes you drew from.
- When using knowledge beyond the notes, mark it clearly.
- Format for canvas display: short paragraphs, bullet points, headers.
- Keep it concise but comprehensive (200-500 words).
- Use markdown-style formatting: **bold** for emphasis, - for lists."""


def _chunk_text_preserving_format(text: str, chunk_size: int = 120) -> list[str]:
    """Split text into stream-sized chunks without flattening whitespace/newlines."""
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)

        if end < text_len:
            newline_break = text.rfind("\n", start, end)
            if newline_break > start:
                end = newline_break + 1
            else:
                space_break = text.rfind(" ", start, end)
                # Keep reasonable chunk sizes while still preferring word boundaries.
                if space_break > start + max(8, chunk_size // 3):
                    end = space_break + 1

        chunks.append(text[start:end])
        start = end

    return chunks


async def compose_content(
    topic: str,
    page_id: Optional[str] = None,
    user_id: Optional[str] = None,
    max_notes: int = 8,
) -> str:
    """Generate composed content (non-streaming). Returns full text."""
    notes_context = await _gather_context(topic, page_id, user_id, max_notes)

    prompt = f"Topic: {topic}\n\n"
    if notes_context:
        prompt += f"Relevant notes from the knowledge base:\n{notes_context}\n\n"
        prompt += "Write comprehensive content about this topic using these notes as primary source."
    else:
        prompt += "No existing notes found on this topic. Write comprehensive content using your general knowledge. Clearly indicate this is general knowledge, not from the user's notes."

    primary_model, _ = await llm._runtime_models(user_id=user_id)

    try:
        from app.llm.google_provider import google_chat_call
        return await google_chat_call(COMPOSE_SYSTEM, [{"role": "user", "content": prompt}], model=primary_model)
    except Exception:
        from app.llm.groq_provider import groq_chat_call
        return await groq_chat_call(COMPOSE_SYSTEM, [{"role": "user", "content": prompt}])


async def stream_compose(
    topic: str,
    page_id: Optional[str] = None,
    user_id: Optional[str] = None,
    max_notes: int = 8,
) -> AsyncIterator[str]:
    """Stream composed content chunk by chunk."""
    notes_context = await _gather_context(topic, page_id, user_id, max_notes)

    prompt = f"Topic: {topic}\n\n"
    if notes_context:
        prompt += f"Relevant notes from the knowledge base:\n{notes_context}\n\n"
        prompt += "Write comprehensive content about this topic using these notes as primary source."
    else:
        prompt += "No existing notes found. Write comprehensive content using your general knowledge. Note this clearly."

    primary_model, fast_model = await llm._runtime_models(user_id=user_id)

    try:
        llm_instance = _get_streaming_llm(primary_model)
        messages = [
            SystemMessage(content=COMPOSE_SYSTEM),
            HumanMessage(content=prompt),
        ]
        async for chunk in llm_instance.astream(messages):
            text = chunk.content if hasattr(chunk, "content") else str(chunk)
            if text:
                yield text
    except Exception as e:
        logger.warning(f"Streaming compose failed: {e}, falling back to non-stream")
        full_text = await compose_content(topic, page_id, user_id, max_notes)
        # Simulate streaming while preserving all original formatting.
        for chunk in _chunk_text_preserving_format(full_text):
            yield chunk


async def _gather_context(
    topic: str,
    page_id: Optional[str],
    user_id: Optional[str],
    max_notes: int,
) -> str:
    """Gather relevant notes as context."""
    try:
        query_emb = await embeddings.generate_query(topic)

        if page_id:
            relevant = await db.vector_search_in_page(query_emb, page_id, limit=max_notes, threshold=0.5)
            if len(relevant) < 2:
                global_results = await db.vector_search(query_emb, limit=max_notes, threshold=0.55)
                seen = {r["id"] for r in relevant}
                for r in global_results:
                    if r["id"] not in seen:
                        relevant.append(r)
        else:
            relevant = await db.vector_search(query_emb, limit=max_notes, threshold=0.55)

        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]

        if not relevant:
            return ""

        parts = []
        for n in relevant[:max_notes]:
            title = n.get("title", "Untitled")
            summary = n.get("summary") or n.get("raw_text", "")[:300]
            tags = ", ".join(n.get("tags") or [])
            parts.append(f"[{title}]: {summary}\nTags: {tags}")

        return "\n\n".join(parts)

    except Exception as e:
        logger.warning(f"Context gathering failed: {e}")
        return ""


def _get_streaming_llm(model: str):
    """Get a streaming-capable LLM instance."""
    m = (model or "").lower()
    if any(tok in m for tok in ["llama", "mixtral", "qwen", "deepseek", "gemma"]):
        if settings.groq_api_key:
            return get_groq_llm(model=model, temperature=0.3)
    return get_google_llm(model=model if "gemini" in m else None, temperature=0.3)