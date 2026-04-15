# === FILE: backend/app/llm/router.py ===
"""
LLM Router — selects provider and handles structured calls.
All LLM interactions go through here.
"""

from __future__ import annotations
import json
import re
import logging
from typing import Optional

from app.config import settings
from app.models.schemas import ProcessedCapture, EdgeClassification
from app.db.supabase import db

logger = logging.getLogger("mnemos.llm.router")


async def _runtime_models(user_id: str = None) -> tuple[str, str]:
    """Get user's preferred models, or defaults."""
    primary = settings.gemini_model
    secondary = settings.groq_model
    if user_id:
        try:
            user_settings = await db.get_settings(user_id)
            if user_settings:
                primary = user_settings.get("model") or primary
                secondary = user_settings.get("groq_model") or secondary
        except Exception:
            pass
    return primary, secondary


def _is_groq_model(model: str) -> bool:
    m = (model or "").lower()
    return any(t in m for t in ["llama", "mixtral", "qwen", "deepseek", "gemma"])


async def chat(system: str, messages: list[dict], user_id: str = None) -> str:
    """General chat — tries primary, falls back to secondary."""
    primary, secondary = await _runtime_models(user_id)
    try:
        if _is_groq_model(primary) and settings.groq_api_key:
            from app.llm.groq_provider import groq_chat_call
            return await groq_chat_call(system, messages, model=primary)
        else:
            from app.llm.google_provider import google_chat_call
            return await google_chat_call(system, messages, model=primary)
    except Exception as e:
        logger.warning(f"Primary LLM ({primary}) failed: {e}, trying secondary")
        try:
            if _is_groq_model(secondary) and settings.groq_api_key:
                from app.llm.groq_provider import groq_chat_call
                return await groq_chat_call(system, messages, model=secondary)
            else:
                from app.llm.google_provider import google_chat_call
                return await google_chat_call(system, messages, model=secondary)
        except Exception as e2:
            logger.error(f"Both LLMs failed: primary={e}, secondary={e2}")
            raise


async def process_capture(raw_text: str, user_id: str = None) -> ProcessedCapture:
    """Extract structured data from raw captured text."""
    system = """You are a note processor. Extract structured information from raw text.
Return valid JSON with exactly these fields:
{
  "title": "short descriptive title (max 80 chars)",
  "summary": "2-3 sentence summary of key points",
  "tags": ["lowercase", "relevant", "tags"],
  "tasks": ["any action items or todos found"],
  "entities": ["people", "places", "concepts", "technologies mentioned"],
  "content_type": "note|code|url|thought|question|clip"
}"""

    prompt = f"Process this text:\n\n{raw_text[:4000]}"

    primary, secondary = await _runtime_models(user_id)
    response = None

    try:
        from app.llm.google_provider import google_structured_call
        response = await google_structured_call(system, prompt, response_schema=True, model=primary)
    except Exception as e:
        logger.warning(f"Structured call failed: {e}")
        try:
            response = await chat(system, [{"role": "user", "content": prompt}], user_id=user_id)
        except Exception:
            return ProcessedCapture(
                title=raw_text[:60], summary=raw_text[:280],
                tags=[], tasks=[], entities=[], content_type="note",
            )

    return _parse_processed_capture(response, raw_text)


async def classify_edge(title_a: str, content_a: str, title_b: str, content_b: str,
                        user_id: str = None) -> EdgeClassification:
    """Classify the relationship between two notes."""
    system = """Classify the relationship between two notes.
Return JSON: {"edge_type": "related|depends_on|extends|contradicts|summarizes|example_of", "label": "brief description", "confidence": 0.0-1.0}"""

    prompt = f"""Note A: "{title_a}"
{content_a[:500]}

Note B: "{title_b}"
{content_b[:500]}

What is the relationship from A to B?"""

    try:
        response = await chat(system, [{"role": "user", "content": prompt}], user_id=user_id)
        data = _extract_json(response)
        return EdgeClassification(
            edge_type=data.get("edge_type", "related"),
            label=data.get("label"),
            confidence=float(data.get("confidence", 0.5)),
        )
    except Exception:
        return EdgeClassification(edge_type="related", label=None, confidence=0.3)


async def route_to_page(title: str, tags: list[str], content: str,
                        source_url: str, pages_info: str, user_id: str = None) -> dict:
    """Decide which page a note belongs to."""
    system = """You are a page router. Given a note and existing pages, decide which page it belongs to.
Return JSON: {"page": "PageName or NEW:NewPageName", "confidence": 0.0-1.0, "reason": "why"}"""

    prompt = f"""Note title: {title}
Tags: {', '.join(tags)}
Content preview: {content[:300]}
Source: {source_url or 'manual'}

Existing pages:
{pages_info}

Which page should this note go to? If none fit well, suggest NEW:PageName."""

    try:
        response = await chat(system, [{"role": "user", "content": prompt}], user_id=user_id)
        return _extract_json(response)
    except Exception:
        return {"page": "Uncategorized", "confidence": 0.0, "reason": "LLM failed"}


async def generate_diagram(topic: str, user_id: str = None) -> dict:
    """Generate diagram topology from topic description."""
    system = """You are a diagram generator. Create a visual diagram topology.
Return JSON:
{
  "layout_type": "flow|mindmap|list|comparison|timeline",
  "elements": [
    {"id": "unique_id", "label": "text", "type": "box", "style": "default|accent|muted|warning|success", "width": 200, "height": 60}
  ],
  "connections": [
    {"from": "id1", "to": "id2", "label": "optional", "style": "solid|dashed|dotted"}
  ]
}
Create 4-8 elements. Use meaningful IDs. Keep labels concise."""

    prompt = f"Create a diagram about: {topic}"

    try:
        from app.llm.google_provider import google_structured_call
        response = await google_structured_call(system, prompt, response_schema=True)
        topology = _extract_json(response)
        # Validate minimum structure
        if not topology.get("elements"):
            topology["elements"] = [{"id": "node1", "label": topic, "type": "box", "style": "accent", "width": 200, "height": 60}]
        if not topology.get("layout_type"):
            topology["layout_type"] = "flow"
        return topology
    except Exception as e:
        logger.error(f"Diagram generation failed: {e}")
        return {
            "layout_type": "flow",
            "elements": [
                {"id": "node1", "label": topic, "type": "box", "style": "accent", "width": 200, "height": 60},
                {"id": "node2", "label": "Details", "type": "box", "style": "default", "width": 200, "height": 60},
            ],
            "connections": [{"from": "node1", "to": "node2", "style": "solid"}],
        }


# ── JSON parsing helpers ──

def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    if not text:
        return {}
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from code blocks
    code_block = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if code_block:
        try:
            return json.loads(code_block.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Try finding JSON object
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass
    logger.warning(f"Could not extract JSON from: {text[:200]}")
    return {}


def _parse_processed_capture(response: str, raw_text: str) -> ProcessedCapture:
    """Parse LLM response into ProcessedCapture, with fallbacks."""
    data = _extract_json(response) if isinstance(response, str) else (response or {})

    title = str(data.get("title", ""))[:100] or raw_text[:60]
    summary = str(data.get("summary", ""))[:500] or raw_text[:280]
    tags = data.get("tags", [])
    if isinstance(tags, list):
        tags = [str(t).lower().strip() for t in tags if t][:12]
    else:
        tags = []
    tasks = data.get("tasks", [])
    if isinstance(tasks, list):
        tasks = [str(t).strip() for t in tasks if t][:12]
    else:
        tasks = []
    entities = data.get("entities", [])
    if isinstance(entities, list):
        entities = [str(e).strip() for e in entities if e][:12]
    else:
        entities = []

    content_type = str(data.get("content_type", "note"))
    if content_type not in ("note", "code", "url", "thought", "question", "clip"):
        content_type = "note"

    return ProcessedCapture(
        title=title, summary=summary, tags=tags,
        tasks=tasks, entities=entities, content_type=content_type,
    )