"""
Helpers for searching freeform text written directly on the canvas scene.
"""

from __future__ import annotations

import re
from typing import Any


def _normalize_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    # Collapse internal whitespace so matching/context stays stable.
    return " ".join(value.split()).strip()


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _tokenize(query: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", query.lower()) if len(token) >= 2]


def _score_match(query: str, tokens: list[str], text: str) -> float:
    text_lower = text.lower()
    query_lower = query.lower().strip()

    if not query_lower:
        return 0.0

    if query_lower in text_lower:
        return 1.0

    if not tokens:
        return 0.0

    overlap = sum(1 for token in tokens if token in text_lower)
    if overlap == 0:
        return 0.0

    return overlap / max(len(tokens), 1)


def extract_canvas_text_elements(canvas_data: dict | None) -> list[dict]:
    """Extract non-deleted text-bearing elements from a page canvas_data scene."""
    if not isinstance(canvas_data, dict):
        return []

    elements = canvas_data.get("elements")
    if not isinstance(elements, list):
        return []

    extracted: list[dict] = []

    for idx, element in enumerate(elements):
        if not isinstance(element, dict):
            continue

        if element.get("isDeleted"):
            continue

        custom_data = element.get("customData")
        if isinstance(custom_data, dict):
            custom_type = str(custom_data.get("type") or "")
            if custom_type.startswith("__placeholder"):
                continue

        text = _normalize_text(
            element.get("text")
            or element.get("originalText")
            or element.get("label")
            or ""
        )
        if not text:
            continue

        extracted.append(
            {
                "id": str(element.get("id") or f"canvas-text-{idx}"),
                "text": text,
                "x": _to_float(element.get("x")),
                "y": _to_float(element.get("y")),
            }
        )

    return extracted


def find_canvas_text_matches(query: str, canvas_data: dict | None, limit: int = 5) -> list[dict]:
    """Return ranked text matches from canvas_data elements."""
    query_norm = _normalize_text(query)
    if not query_norm:
        return []

    tokens = _tokenize(query_norm)
    candidates = extract_canvas_text_elements(canvas_data)

    scored: list[dict] = []
    for candidate in candidates:
        score = _score_match(query_norm, tokens, candidate["text"])
        if score <= 0:
            continue

        text = candidate["text"]
        snippet = text if len(text) <= 220 else f"{text[:217]}..."

        scored.append(
            {
                "id": candidate["id"],
                "text": text,
                "snippet": snippet,
                "x": candidate.get("x"),
                "y": candidate.get("y"),
                "score": round(score, 4),
            }
        )

    scored.sort(key=lambda item: (item["score"], len(item["text"])), reverse=True)
    return scored[: max(1, limit)]


def build_canvas_text_context(matches: list[dict], max_chars: int = 3000) -> str:
    """Build an LLM-friendly context string from canvas text matches."""
    if not matches:
        return ""

    lines: list[str] = []
    used = 0

    for idx, match in enumerate(matches, start=1):
        chunk = f"Canvas Text {idx}: {match.get('text', '')}".strip()
        if not chunk:
            continue

        if used + len(chunk) > max_chars and lines:
            break

        lines.append(chunk)
        used += len(chunk)

    return "\n\n".join(lines)
