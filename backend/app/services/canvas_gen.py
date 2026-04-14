"""
Canvas AI Generation — Structured diagram & text layout generation.

Provides a new LLM prompt that returns structured JSON describing
boxes, arrows, and text blocks. The frontend converts this topology
into Excalidraw elements using the canvas context (colors, positions).
"""
from __future__ import annotations

import json
from app.services.llm import client, MODEL
from app.services.retry import with_retry


CANVAS_GENERATION_PROMPT = """You are a visual knowledge assistant. Based on the user's request, generate a structured layout of visual elements for an Excalidraw canvas.

Return JSON only with this schema:
{{
  "title": "short title for this diagram",
  "layout_type": "flow|mindmap|list|comparison|timeline|freeform",
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
- Think about the visual weight — main topics get "accent", details get "default", warnings get "warning"

User request: {request}

Additional context (if any):
{context}"""


@with_retry(max_retries=2, base_delay=2.0)
async def generate_diagram(request: str, context: str = "") -> dict:
    """
    Ask the LLM to generate a structured diagram topology.
    Returns the parsed JSON topology with elements and connections.
    """
    prompt = CANVAS_GENERATION_PROMPT.format(
        request=request[:2000],
        context=context[:3000] if context else "None",
    )
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(response.text)
