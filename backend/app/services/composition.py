# === FILE: backend/app/services/composition.py ===

from __future__ import annotations
import re
import logging

from app.db.repo import repo
from app.services import search as search_svc
from app.llm import router as llm_router

logger = logging.getLogger("mnemos.compose")

COMPOSE_SYSTEM = """You are a knowledge composition assistant for a visual canvas.
Write clear, well-structured content about the requested topic.
Use the user's existing notes as primary sources — cite them by title.
If notes are insufficient, use general knowledge but note that explicitly.

IMPORTANT formatting rules (the canvas is NOT a markdown renderer):
- Do NOT use markdown syntax like **, ##, ###, or ```
- Use plain text only
- Use line breaks to separate sections
- Use "• " for bullet points (the bullet character, not *)
- Use ALL CAPS or "Section:" prefix for headers
- Keep lines under 80 characters when possible
- 200-400 words. No meta-commentary."""


def strip_markdown(text: str) -> str:
    """Convert markdown to plain text suitable for Excalidraw canvas."""
    if not text:
        return text

    # Headers: ### Title → TITLE
    text = re.sub(r'^#{1,6}\s+(.+)$', lambda m: m.group(1).upper(), text, flags=re.MULTILINE)

    # Bold: **text** or __text__ → text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)

    # Italic: *text* or _text_ → text
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'\1', text)

    # Bullet points: * item or - item → • item
    text = re.sub(r'^[\*\-]\s+', '• ', text, flags=re.MULTILINE)

    # Numbered lists: keep as is (1. item)

    # Code blocks: ```code``` → code
    text = re.sub(r'```[\w]*\n?(.*?)```', r'\1', text, flags=re.DOTALL)

    # Inline code: `code` → code
    text = re.sub(r'`(.+?)`', r'\1', text)

    # Links: [text](url) → text
    text = re.sub(r'$$(.+?)$$\(.+?\)', r'\1', text)

    # Horizontal rules
    text = re.sub(r'^---+$', '─' * 40, text, flags=re.MULTILINE)

    # Clean up excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


async def compose_content(topic: str, workspace_id: str = None,
                          owner_id: str = None) -> str:
    context = await _gather_context(topic, workspace_id, owner_id)
    prompt = f"Topic: {topic}\n\n"
    if context:
        prompt += f"Relevant notes:\n{context}\n\nWrite using these as primary source."
    else:
        prompt += "No existing notes found. Write using general knowledge."

    raw = await llm_router.chat(
        COMPOSE_SYSTEM,
        [{"role": "user", "content": prompt}],
        user_id=owner_id,
    )
    return strip_markdown(raw)


async def compose_stream_chunks(topic: str, workspace_id: str = None,
                                owner_id: str = None):
    from app.llm.router import chat_stream
    context = await _gather_context(topic, workspace_id, owner_id)
    prompt = f"Topic: {topic}\n\n"
    if context:
        prompt += f"Relevant notes:\n{context}\n\nWrite using these as primary source."
    else:
        prompt += "No existing notes found. Write using general knowledge."

    buffer = ""
    async for chunk in chat_stream(
        COMPOSE_SYSTEM,
        [{"role": "user", "content": prompt}],
        user_id=owner_id,
    ):
        buffer += chunk
        # Stream cleaned chunks
        yield strip_markdown(chunk)

    # Note: final content in handler will also call strip_markdown on full text


async def _gather_context(topic: str, workspace_id: str = None,
                          owner_id: str = None) -> str:
    try:
        results = await search_svc.semantic_search(
            query=topic,
            owner_id=owner_id,
            workspace_id=workspace_id,
            limit=8,
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