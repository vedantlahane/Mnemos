PROCESS_PROMPT = """Analyze this text and return JSON only:
{{
  "title": "concise title",
  "summary": "2-3 sentence summary",
  "tags": ["tag1", "tag2"],
  "tasks": ["task1", "task2"],
  "entities": ["entity1", "entity2"]
}}

Text to analyze:
{text}"""

EDGE_CLASSIFICATION_PROMPT = """Given two notes, classify their relationship.
Return JSON only:
{{
  "edge_type": "related|depends_on|extends|contradicts|summarizes|example_of",
  "label": "short description of the relationship",
  "confidence": 0.0-1.0
}}

Note A — {title_a}: {content_a}
Note B — {title_b}: {content_b}"""

PAGE_ROUTING_PROMPT = """Given a new note and existing pages, decide which page this note belongs to.
Return JSON only:
{{
  "page": "exact page name or NEW:suggested_name",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}}

Rules:
- If the note clearly fits an existing page, return that page name with high confidence.
- If confidence < 0.75, return "Uncategorized".
- Only suggest "NEW:name" if the note clearly represents a distinct new topic.

Existing pages:
{pages_info}

New note:
Title: {title}
Tags: {tags}
Content: {content}
Source URL: {source_url}"""

CLUSTER_NAMING_PROMPT = """Given these notes grouped together, provide a name and description.
Return JSON only:
{{
  "label": "short cluster name (2-4 words)",
  "description": "one sentence describing what these notes have in common",
  "color_hint": "a hex color that represents this topic"
}}

Notes in cluster:
{notes_info}"""

FOLLOW_UP_PROMPT = """Given this Q&A from a knowledge base, suggest 2-3 natural follow-up questions.
Return JSON only: ["question1", "question2", "question3"]

Question: {question}
Answer: {answer}"""

GAP_ANALYSIS_PROMPT = """Analyze these notes and identify knowledge gaps.
Return JSON only:
{{
  "covered": ["well-covered subtopic1", "well-covered subtopic2"],
  "missing": ["missing subtopic1", "missing subtopic2"],
  "suggestions": ["actionable suggestion 1", "actionable suggestion 2"]
}}

Topic: {topic}
Notes:
{notes_info}"""

READING_PATH_PROMPT = """Given these notes, create an optimal reading order.
Return JSON only — an array:
[
  {{"title": "what to read first", "noteId": "uuid-or-null", "reason": "why start here"}},
  {{"title": "what to read next", "noteId": "uuid-or-null", "reason": "why this order"}}
]

Consider dependencies, foundational concepts first, then advanced topics.

Topic focus: {topic}
Notes:
{notes_info}"""

PAGE_SUMMARY_PROMPT = """Summarize these notes from a knowledge page.
Return JSON only:
{{
  "summary": "coherent 3-5 sentence summary of the page's knowledge",
  "key_topics": ["topic1", "topic2", "topic3"],
  "connections": ["notable connection 1 between notes", "connection 2"]
}}

Page: {page_name}
Notes:
{notes_info}"""

CHAT_SYSTEM = """You are a personal knowledge assistant. Answer based ONLY on
the user's notes provided in the context. If the notes don't contain enough
information, say so honestly. Cite which notes you're drawing from by
mentioning their titles. Use markdown bold (**text**) for emphasis."""

AI_POSITION_PROMPT = """Given existing notes on a canvas and a new note, suggest where to place it.
Return JSON only:
{{
  "x": number,
  "y": number,
  "cluster": "cluster label or null",
  "reason": "brief explanation"
}}

Canvas size: {width}x{height}
Note card size: 360x240, minimum spacing: 420 horizontal, 350 vertical

Existing notes (title → position):
{existing_notes}

New note:
Title: {title}
Tags: {tags}
Summary: {summary}"""