from google import genai
from app.config import settings
from app.models.schemas import ProcessedCapture, EdgeClassification
from app.services.retry import with_retry

client = genai.Client(api_key=settings.gemini_api_key)
MODEL = "gemini-2.5-flash"

# ── Existing prompts ──────────────────────────────────

PROCESS_PROMPT = """Analyze this text and return JSON only:
{
  "title": "concise title",
  "summary": "2-3 sentence summary",
  "tags": ["tag1", "tag2"],
  "tasks": ["task1", "task2"],
  "entities": ["entity1", "entity2"]
}

Text to analyze:
"""

CHAT_SYSTEM = """You are a personal knowledge assistant. Answer based ONLY on
the user's notes provided in the context. If the notes don't contain enough
information, say so honestly. Cite which notes you're drawing from by
mentioning their titles."""

# ── New prompts ───────────────────────────────────────

EDGE_CLASSIFICATION_PROMPT = """Given two notes, classify their relationship.
Return JSON only:
{
  "edge_type": "related|depends_on|extends|contradicts|summarizes|example_of",
  "label": "short description of the relationship",
  "confidence": 0.0-1.0
}

Edge types:
- related: general topical similarity
- depends_on: Note A requires understanding Note B first
- extends: Note A builds on or adds to Note B
- contradicts: Note A disagrees with or conflicts with Note B
- summarizes: Note A is a summary or overview of Note B
- example_of: Note A is a concrete example of concepts in Note B

Note A:
Title: {title_a}
Content: {content_a}

Note B:
Title: {title_b}
Content: {content_b}
"""

PAGE_ROUTING_PROMPT = """Given a new note and existing pages, decide which page this note belongs to.
Return JSON only:
{{
  "page": "exact page name" or "NEW:suggested_name",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}}

Rules:
- If the note clearly fits an existing page, return that page name with high confidence.
- If confidence < 0.75, return page: "Uncategorized".
- Only suggest "NEW:name" if the note clearly represents a new distinct topic not covered by any existing page.
- Consider the note's tags, content, and source URL when deciding.

Existing pages:
{pages_info}

New note:
Title: {title}
Tags: {tags}
Content: {content}
Source URL: {source_url}
"""

CLUSTER_NAMING_PROMPT = """Given these notes that are grouped together in a cluster, provide a name and description.
Return JSON only:
{{
  "label": "short cluster name (2-4 words)",
  "description": "one sentence describing what these notes have in common",
  "color_hint": "a hex color that represents this topic"
}}

Notes in cluster:
{notes_info}
"""

CURATOR_REVIEW_PROMPT = """Review these findings about a knowledge base and suggest actions.
Return JSON only — an array of actions:
[
  {{
    "action": "merge_notes|delete_note|add_edge|split_cluster|merge_clusters|connect_orphan",
    "params": {{}},
    "reason": "why this action is suggested",
    "risk_level": "low|medium|high"
  }}
]

Findings:
{findings}
"""

FOLLOW_UP_PROMPT = """Given this question and answer from a knowledge base, suggest 2-3 natural follow-up questions the user might ask.
Return JSON only:
["question1", "question2", "question3"]

Question: {question}
Answer: {answer}
"""

GAP_ANALYSIS_PROMPT = """Given notes on the topic "{topic}" and their content, identify what subtopics are covered and what's missing.
Return JSON only:
{{
  "covered": ["subtopic1", "subtopic2"],
  "missing": ["missing_subtopic1", "missing_subtopic2"],
  "suggestions": ["suggestion for what to learn/capture next"]
}}

Notes on this page:
{notes_info}
"""


# ── Existing functions (keep) ─────────────────────────

@with_retry(max_retries=3, base_delay=2.0)
async def process_capture(text: str) -> ProcessedCapture:
    prompt = PROCESS_PROMPT + text[:3000]
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return ProcessedCapture.model_validate_json(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def chat(question: str, context: str, history: list, page_context: str = None) -> str:
    system = CHAT_SYSTEM
    if page_context:
        system += f"\n\nThe user is currently viewing the '{page_context}' page. Prioritize notes from this page."

    messages = [
        {"role": "user", "parts": [{"text": system}]},
        {"role": "model", "parts": [{"text": "Understood. I'll answer based only on the provided notes and cite my sources."}]},
    ]

    for msg in (history or [])[-10:]:
        role = "user" if msg.get("role") == "user" else "model"
        messages.append({"role": role, "parts": [{"text": msg["content"]}]})

    messages.append({
        "role": "user",
        "parts": [{"text": f"Context from notes:\n{context}\n\nQuestion: {question}"}],
    })

    response = await client.aio.models.generate_content(
        model=MODEL, contents=messages
    )
    return response.text


# ── New functions ─────────────────────────────────────

@with_retry(max_retries=3, base_delay=2.0)
async def classify_edge(title_a: str, content_a: str, title_b: str, content_b: str) -> EdgeClassification:
    prompt = EDGE_CLASSIFICATION_PROMPT.format(
        title_a=title_a,
        content_a=content_a[:1000],
        title_b=title_b,
        content_b=content_b[:1000],
    )
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return EdgeClassification.model_validate_json(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def route_to_page(title: str, tags: list, content: str, source_url: str, pages_info: str) -> dict:
    prompt = PAGE_ROUTING_PROMPT.format(
        title=title or "Untitled",
        tags=", ".join(tags) if tags else "none",
        content=content[:1500],
        source_url=source_url or "none",
        pages_info=pages_info,
    )
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    import json
    return json.loads(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def name_cluster(notes_info: str) -> dict:
    prompt = CLUSTER_NAMING_PROMPT.format(notes_info=notes_info)
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    import json
    return json.loads(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def review_curator_findings(findings: str) -> list:
    prompt = CURATOR_REVIEW_PROMPT.format(findings=findings)
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    import json
    return json.loads(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def generate_follow_ups(question: str, answer: str) -> list[str]:
    prompt = FOLLOW_UP_PROMPT.format(question=question, answer=answer[:1500])
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    import json
    return json.loads(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def analyze_gaps(topic: str, notes_info: str) -> dict:
    prompt = GAP_ANALYSIS_PROMPT.format(topic=topic, notes_info=notes_info)
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    import json
    return json.loads(response.text)