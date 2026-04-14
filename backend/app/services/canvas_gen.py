# === FILE: backend/app/services/canvas_gen.py ===
"""
Diagram generation — structured topology from natural language.
"""
from __future__ import annotations

from app.config import settings
from app.llm.google_provider import google_json_call
from app.llm.groq_provider import groq_json_call
from app.services.retry import with_retry


CANVAS_GENERATION_PROMPT = """You are a visual knowledge assistant. Generate a structured diagram layout.

Return JSON only:
{{
  "title": "short title",
  "layout_type": "flow|mindmap|list|comparison|timeline|freeform",
  "elements": [
    {{
      "id": "unique_id",
      "type": "box|text|arrow",
      "label": "text content (max 50 chars)",
      "style": "default|accent|muted|warning|success",
      "width": 200,
      "height": 60
    }}
  ],
  "connections": [
    {{
      "from": "element_id",
      "to": "element_id",
      "label": "optional edge label",
      "style": "solid|dashed|dotted"
    }}
  ]
}}

Rules:
- "flow": top-to-bottom or left-to-right with arrows
- "mindmap": central topic with radiating branches
- "list": vertical text blocks, no arrows
- "comparison": two columns side by side
- "timeline": horizontal with events
- "freeform": whatever fits best
- Max 12 elements, max 15 connections
- Vary styles for visual weight: accent=important, muted=detail, warning=risk, success=outcome

User request: {request}

Context:
{context}"""


def _is_groq_model(model: str | None) -> bool:
    m = (model or "").lower()
    return any(t in m for t in ["llama", "mixtral", "qwen", "deepseek", "gemma"])


@with_retry(max_retries=2, base_delay=2.0)
async def generate_diagram(request: str, context: str = "", model: str | None = None) -> dict:
    prompt = CANVAS_GENERATION_PROMPT.format(
        request=request[:2000],
        context=context[:3000] if context else "None",
    )
    chosen = (model or settings.gemini_model or "").strip() or "gemini-2.5-flash"

    if _is_groq_model(chosen) and settings.groq_api_key:
        result = await groq_json_call(prompt, model=chosen)
    else:
        result = await google_json_call(prompt, model=chosen)

    if not isinstance(result, dict):
        raise ValueError("Diagram model returned non-object JSON")
    return result


def fallback_diagram(request: str) -> dict:
    title = (request or "Untitled Diagram").strip()[:64]
    steps = [
        f"Understand: {title[:34]}",
        "Break into components",
        "Map dependencies",
        "Implement and validate",
        "Review and iterate",
    ]
    elements = []
    for i, step in enumerate(steps, 1):
        style = "accent" if i == 1 else ("success" if i == len(steps) else ("muted" if i % 2 == 0 else "default"))
        elements.append({"id": f"n{i}", "type": "box", "label": step, "style": style, "width": 300, "height": 74})

    connections = [{"from": f"n{i}", "to": f"n{i+1}", "style": "solid"} for i in range(1, len(steps))]
    return {"title": title, "layout_type": "flow", "elements": elements, "connections": connections}