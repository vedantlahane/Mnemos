# === FILE: backend/app/llm/router.py ===

"""LLM Router — provider selection + structured calls."""

from __future__ import annotations
import json
import re
import logging

from app.core.config import settings
from app.db.repo import repo

logger = logging.getLogger("mnemos.llm.router")


async def _runtime_models(user_id: str = None) -> tuple[str, str]:
    primary = settings.gemini_model
    secondary = settings.groq_model
    if user_id:
        try:
            prefs = await repo.get_preferences(user_id)
            if prefs:
                primary = prefs.get("primary_model") or primary
                secondary = prefs.get("secondary_model") or secondary
        except Exception:
            pass
    return primary, secondary


def _is_groq_model(model: str) -> bool:
    m = (model or "").lower()
    return any(t in m for t in ["llama", "mixtral", "qwen", "deepseek", "gemma"])


async def chat(system: str, messages: list[dict],
               user_id: str = None) -> str:
    primary, secondary = await _runtime_models(user_id)
    try:
        if _is_groq_model(primary) and settings.groq_api_key:
            from app.llm.groq_provider import groq_chat_call
            return await groq_chat_call(system, messages, model=primary)
        else:
            from app.llm.google_provider import google_chat_call
            return await google_chat_call(system, messages, model=primary)
    except Exception as e:
        logger.warning(f"Primary LLM ({primary}) failed: {e}")
        try:
            if _is_groq_model(secondary) and settings.groq_api_key:
                from app.llm.groq_provider import groq_chat_call
                return await groq_chat_call(system, messages, model=secondary)
            else:
                from app.llm.google_provider import google_chat_call
                return await google_chat_call(system, messages, model=secondary)
        except Exception as e2:
            logger.error(f"Both LLMs failed: {e}, {e2}")
            raise
async def chat_stream(system: str, messages: list[dict], user_id: str = None):
    primary, secondary = await _runtime_models(user_id)
    try:
        if _is_groq_model(primary) and settings.groq_api_key:
            # We don't have groq_chat_stream yet, fallback to google or fake stream
            from app.llm.groq_provider import groq_chat_call
            res = await groq_chat_call(system, messages, model=primary)
            yield res
        else:
            from app.llm.google_provider import google_chat_stream
            async for chunk in google_chat_stream(system, messages, model=primary):
                yield chunk
    except Exception as e:
        logger.warning(f"Primary LLM ({primary}) failed: {e}")
        try:
            if _is_groq_model(secondary) and settings.groq_api_key:
                from app.llm.groq_provider import groq_chat_call
                res = await groq_chat_call(system, messages, model=secondary)
                yield res
            else:
                from app.llm.google_provider import google_chat_stream
                async for chunk in google_chat_stream(system, messages, model=secondary):
                    yield chunk
        except Exception as e2:
            logger.error(f"Both LLMs failed: {e}, {e2}")
            raise

async def process_capture(raw_text: str, user_id: str = None,
                          source_title: str = None, source_url: str = None):
    """Extract structured data from captured text."""
    from pydantic import BaseModel

    class ProcessedCapture(BaseModel):
        title: str
        summary: str
        tags: list[str]
        tasks: list[str]
        entities: list[str]
        content_type: str

    source_ctx = ""
    if source_title:
        source_ctx += f"\nSource page: {source_title}"
    if source_url:
        source_ctx += f"\nSource URL: {source_url}"

    system = f"""You are a note processor. Return valid JSON.
{source_ctx}

CRITICAL RULES:
- "title" must describe THIS SPECIFIC text snippet, NOT the source page title.
- If multiple snippets come from the same page, each MUST have a DIFFERENT title
  reflecting what that specific snippet says.
- "summary" is a 2-3 sentence distillation of the key points in THIS snippet.
- Preserve the full meaning. Do NOT just repeat the page title.

Return: {{"title":"specific descriptive title","summary":"2-3 sentences","tags":["tag"],"tasks":["task"],"entities":["entity"],"content_type":"note|code|url|thought|question|snippet"}}"""

    prompt = f"Process this text:\n\n{raw_text[:4000]}"

    try:
        from app.llm.google_provider import google_structured_call
        response = await google_structured_call(system, prompt)
    except Exception:
        try:
            response = await chat(system, [{"role": "user", "content": prompt}], user_id)
        except Exception:
            fallback_title = source_title or raw_text[:60]
            return ProcessedCapture(
                title=fallback_title, summary=raw_text[:280],
                tags=[], tasks=[], entities=[], content_type="note",
            )

    data = _extract_json(response) if isinstance(response, str) else (response or {})
    fallback_title = source_title or raw_text[:60]

    return ProcessedCapture(
        title=str(data.get("title", ""))[:100] or fallback_title,
        summary=str(data.get("summary", ""))[:500] or raw_text[:280],
        tags=[str(t).lower().strip() for t in data.get("tags", []) if t][:12]
            if isinstance(data.get("tags"), list) else [],
        tasks=[str(t).strip() for t in data.get("tasks", []) if t][:12]
            if isinstance(data.get("tasks"), list) else [],
        entities=[str(e).strip() for e in data.get("entities", []) if e][:12]
            if isinstance(data.get("entities"), list) else [],
        content_type=str(data.get("content_type", "note"))
            if data.get("content_type") in ("note", "code", "url", "thought", "question", "snippet")
            else "note",
    )


async def classify_edge(title_a: str, content_a: str,
                        title_b: str, content_b: str,
                        user_id: str = None):
    from pydantic import BaseModel

    class EdgeClassification(BaseModel):
        edge_type: str
        label: str | None = None
        confidence: float

    system = """Classify the relationship. Return JSON:
{"edge_type":"related|depends_on|extends|contradicts|summarizes|example_of","label":"brief","confidence":0.0-1.0}"""
    prompt = f'Note A: "{title_a}"\n{content_a[:500]}\n\nNote B: "{title_b}"\n{content_b[:500]}'

    try:
        response = await chat(system, [{"role": "user", "content": prompt}], user_id)
        data = _extract_json(response)
        return EdgeClassification(
            edge_type=data.get("edge_type", "related"),
            label=data.get("label"),
            confidence=float(data.get("confidence", 0.5)),
        )
    except Exception:
        return EdgeClassification(edge_type="related", confidence=0.3)


async def route_to_page(title: str, tags: list[str], content: str,
                        source_url: str, pages_info: str,
                        user_id: str = None) -> dict:
    system = """You are a workspace router. Return JSON:
{"page":"WorkspaceName or NEW:NewWorkspaceName","confidence":0.0-1.0,"reason":"why"}"""
    prompt = (
        f"Item: {title}\nTags: {', '.join(tags)}\n"
        f"Content: {content[:300]}\nSource: {source_url or 'manual'}\n\n"
        f"Workspaces:\n{pages_info}"
    )

    try:
        response = await chat(system, [{"role": "user", "content": prompt}], user_id)
        return _extract_json(response)
    except Exception:
        return {"page": "Inbox", "confidence": 0.0, "reason": "LLM failed"}


async def generate_diagram(topic: str, user_id: str = None) -> dict:
    system = """Generate a diagram topology as JSON. Return ONLY valid JSON:
{"layout_type":"tree|flow|mindmap|list|comparison|timeline",
 "elements":[{"id":"unique_id","label":"Short Label","type":"box","style":"default|accent|muted|warning|success","width":240,"height":64}],
 "connections":[{"from":"id1","to":"id2","label":"optional","style":"solid|dashed|dotted"}]}

RULES:
- Create 5-10 elements with CONCISE labels (1-3 words max, e.g. "API Server" not "Kubernetes API Server Component")
- Use layout_type "tree" for architectures, hierarchies, org charts
- Use layout_type "mindmap" for concept maps with a central topic
- Use layout_type "flow" only for strictly sequential processes
- For tree layouts: ONE root node, branch into 2-4 children, then sub-children
- Set width: 240 for normal labels, 280 for longer labels (3+ words)
- Set height: 64 always
- Use "accent" style for the root/main node, "default" for most nodes, "success"/"warning" for special nodes
- Connections should form a TREE (one parent per child), not a linear chain
- Do NOT create linear chains for architecture diagrams — spread into branches"""

    prompt = f"Create a diagram about: {topic}"

    try:
        from app.llm.google_provider import google_structured_call
        response = await google_structured_call(system, prompt)
        topology = _extract_json(response)
        if not topology.get("elements"):
            topology["elements"] = [
                {"id": "node1", "label": topic, "type": "box",
                 "style": "accent", "width": 240, "height": 64},
            ]
        if not topology.get("layout_type"):
            topology["layout_type"] = "tree"
        # Enforce minimum node widths
        for el in topology.get("elements", []):
            el["width"] = max(int(el.get("width", 240)), 200)
            el["height"] = max(int(el.get("height", 64)), 56)
        return topology
    except Exception as e:
        logger.error(f"Diagram generation failed: {e}")
        return {
            "layout_type": "tree",
            "elements": [
                {"id": "node1", "label": topic, "type": "box",
                 "style": "accent", "width": 260, "height": 64},
                {"id": "node2", "label": "Component A", "type": "box",
                 "style": "default", "width": 240, "height": 64},
                {"id": "node3", "label": "Component B", "type": "box",
                 "style": "default", "width": 240, "height": 64},
            ],
            "connections": [
                {"from": "node1", "to": "node2", "style": "solid"},
                {"from": "node1", "to": "node3", "style": "solid"},
            ],
        }


def _extract_json(text: str) -> dict:
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}