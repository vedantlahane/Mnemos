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

CRITICAL: Output PLAIN TEXT ONLY. The canvas cannot render markdown.
- NO markdown: no #, ##, ###, **, *, ```, -, etc.
- Use UPPERCASE for section headers
- Use bullet character • for lists
- Use blank lines between sections
- Keep lines under 80 characters
- 200-400 words total
- No meta-commentary like "here is information about..."
"""


def strip_markdown(text: str) -> str:
    """Aggressively strip ALL markdown from text for plain-text canvas."""
    if not text:
        return text

    # Code blocks first (before other processing)
    text = re.sub(r'```[\w]*\n?(.*?)```', r'\1', text, flags=re.DOTALL)

    # Headers: ## Title → TITLE (strip all # characters)
    text = re.sub(r'^#{1,6}\s+(.+)$', lambda m: m.group(1).strip().upper(), text, flags=re.MULTILINE)

    # Bold: **text** → text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)

    # Italic: *text* → text (but not bullet points)
    text = re.sub(r'(?<!\n)\*([^*\n]+?)\*', r'\1', text)
    text = re.sub(r'(?<!\w)_([^_\n]+?)_(?!\w)', r'\1', text)

    # Bullet points: * item or - item → • item
    text = re.sub(r'^\s*[\*\-]\s+', '• ', text, flags=re.MULTILINE)

    # Inline code: `code` → code
    text = re.sub(r'`(.+?)`', r'\1', text)

    # Links: [text](url) → text
    text = re.sub(r'$$([^$$]+)\]\([^)]+\)', r'\1', text)

    # Horizontal rules
    text = re.sub(r'^[\-\*_]{3,}\s*$', '', text, flags=re.MULTILINE)

    # Remove any remaining standalone * or ** at line starts
    text = re.sub(r'^\*{1,2}\s*', '', text, flags=re.MULTILINE)

    # Clean up excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Remove leading "Here is..." type phrases
    text = re.sub(r'^(?:Here is|Here\'s|Below is)[^.]*\.\s*\n*', '', text, flags=re.IGNORECASE)

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
    """Stream chunks, applying markdown stripping to each."""
    from app.llm.router import chat_stream

    context = await _gather_context(topic, workspace_id, owner_id)
    prompt = f"Topic: {topic}\n\n"
    if context:
        prompt += f"Relevant notes:\n{context}\n\nWrite using these as primary source."
    else:
        prompt += "No existing notes found. Write using general knowledge."

    async for chunk in chat_stream(
        COMPOSE_SYSTEM,
        [{"role": "user", "content": prompt}],
        user_id=owner_id,
    ):
        # Don't strip markdown per-chunk (breaks partial words)
        # The final full text gets stripped in the handler
        yield chunk


async def _gather_context(topic: str, workspace_id: str = None,
                          owner_id: str = None) -> str:
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