# === FILE: backend/app/services/composition.py ===

"""Content composition — AI writes on the canvas using knowledge context."""

from __future__ import annotations
import logging

from app.db.repo import repo
from app.services import search as search_svc
from app.llm import router as llm_router

logger = logging.getLogger("mnemos.compose")

COMPOSE_SYSTEM = """You are a knowledge composition assistant for a visual canvas.
Write clear, well-structured content about the requested topic.
Use the user's existing notes as primary sources — cite them by title.
If notes are insufficient, use general knowledge but note that explicitly.
Format for canvas: short paragraphs, bullet points, headers.
200-400 words. Use **bold** for emphasis. No meta-commentary."""


async def compose_content(topic: str, workspace_id: str = None,
                          owner_id: str = None) -> str:
    context = await _gather_context(topic, workspace_id, owner_id)
    prompt = f"Topic: {topic}\n\n"
    if context:
        prompt += f"Relevant notes:\n{context}\n\nWrite using these as primary source."
    else:
        prompt += "No existing notes found. Write using general knowledge."

    return await llm_router.chat(
        COMPOSE_SYSTEM,
        [{"role": "user", "content": prompt}],
        user_id=owner_id,
    )


async def _gather_context(topic: str, workspace_id: str | None,
                          owner_id: str | None) -> str:
    try:
        results = await search_svc.semantic_search(
            query=topic, owner_id=owner_id,
            workspace_id=workspace_id, limit=8,
        )
        if not results:
            return ""
        return "\n\n".join(
            f"[{r.get('title', 'Untitled')}]: "
            f"{r.get('summary') or r.get('source_text', '')[:300]}"
            for r in results[:8]
        )
    except Exception as e:
        logger.warning(f"Context gather failed: {e}")
        return ""