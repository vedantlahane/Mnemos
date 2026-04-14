"""
Canvas AI Generation — Structured diagram & text layout generation.

Provides a new LLM prompt that returns structured JSON describing
boxes, arrows, and text blocks. The frontend converts this topology
into Excalidraw elements using the canvas context (colors, positions).
"""
from __future__ import annotations

from app.config import settings
from app.llm.google_provider import google_json_call
from app.llm.groq_provider import groq_json_call
from app.services.retry import with_retry


CANVAS_GENERATION_PROMPT = """You are a visual knowledge assistant. Based on the user's request, generate a structured layout of visual elements for an Excalidraw canvas.

Return JSON only with this schema:
{{
  "title": "short title for this diagram",
  "layout_type": "flow|mindmap|list|comparison|timeline|freeform",
  "app_state": {{
    "theme": "light|dark",
    "viewBackgroundColor": "#hex",
    "currentItemStrokeColor": "#hex",
    "currentItemBackgroundColor": "#hex",
    "currentItemFillStyle": "solid|hachure|cross-hatch",
    "currentItemStrokeWidth": 1,
    "currentItemStrokeStyle": "solid|dashed|dotted",
    "currentItemRoughness": 0,
    "currentItemOpacity": 100,
    "currentItemFontFamily": 1,
    "currentItemFontSize": 16,
    "currentItemTextAlign": "left|center|right",
    "currentItemStartArrowhead": "arrow|bar|dot|triangle|diamond|null",
    "currentItemEndArrowhead": "arrow|bar|dot|triangle|diamond|null"
  }},
  "elements": [
    {{
      "id": "unique_id",
      "type": "box|text|arrow",
      "label": "text content",
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
- For "flow" layout: arrange elements top-to-bottom or left-to-right with arrows
- For "mindmap" layout: central topic with radiating branches
- For "list" layout: simple vertical list of text blocks (no arrows)
- For "comparison" layout: two columns side by side
- For "timeline" layout: horizontal timeline with events
- For "freeform" layout: whatever makes most sense
- Keep it concise: max 12 elements, max 15 connections
- Each box should have a short, readable label (max 50 chars)
- Think about visual weight: main topics use "accent", details use "default" or "muted", risks use "warning", positive outcomes use "success"
- If canvas style context is provided, align style choices to it (especially background/theme and text readability)
- Use app_state only when changing canvas defaults helps readability or user intent
- Ensure strong contrast between text and likely background
- For flow diagrams, alternate styles across steps to avoid a monochrome wall of boxes

User request: {request}

Additional context (if any):
{context}"""


def _is_groq_model(model: str | None) -> bool:
    m = (model or "").lower()
    return any(token in m for token in ["llama", "mixtral", "qwen", "deepseek", "gemma"])


@with_retry(max_retries=2, base_delay=2.0)
async def generate_diagram(request: str, context: str = "", model: str | None = None) -> dict:
    """
    Ask the LLM to generate a structured diagram topology.
    Returns the parsed JSON topology with elements and connections.
    """
    prompt = CANVAS_GENERATION_PROMPT.format(
        request=request[:2000],
        context=context[:3000] if context else "None",
    )
    chosen_model = (model or settings.gemini_model or "").strip() or "gemini-2.5-flash"

    if _is_groq_model(chosen_model) and settings.groq_api_key:
        result = await groq_json_call(prompt, model=chosen_model)
    else:
        result = await google_json_call(prompt, model=chosen_model)

    if not isinstance(result, dict):
      raise ValueError("Diagram model returned non-object JSON")
    return result


def fallback_diagram(request: str) -> dict:
    """Deterministic local fallback when LLM diagram generation is unavailable."""
    title = (request or "Untitled Diagram").strip()[:64] or "Untitled Diagram"

    # Build a concise 5-step flow from the request text.
    steps = [
        f"Understand: {title[:34]}",
        "Break into components",
        "Map dependencies",
        "Implement and validate",
        "Review and iterate",
    ]

    elements = []
    for i, step in enumerate(steps, start=1):
        style = "accent" if i == 1 else ("success" if i == len(steps) else ("muted" if i % 2 == 0 else "default"))
        elements.append(
            {
                "id": f"n{i}",
                "type": "box",
                "label": step,
                "style": style,
                "width": 300,
                "height": 74,
            }
        )

    connections = [
        {"from": f"n{i}", "to": f"n{i+1}", "style": "solid"}
        for i in range(1, len(steps))
    ]

    return {
        "title": title,
        "layout_type": "flow",
        "elements": elements,
        "connections": connections,
    }
