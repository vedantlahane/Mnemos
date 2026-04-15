# === FILE: backend/app/services/intent_classifier.py ===
"""
Intent classification for canvas brain.
Fast, deterministic pattern matching + LLM fallback.
"""

from __future__ import annotations
import re
import logging
from typing import Optional

from app.models.canvas_ops import Intent

logger = logging.getLogger("mnemos.intent")

_WRITE_DOWN_PATTERN = re.compile(
    r"^(?:please\s+)?(?:write\s+down|write\s+this\s+down|jot\s+down)\s*[,:\-]?\s*(.+)$",
    re.I,
)


# ── Pattern rules (checked before LLM) ──

_COMMAND_PATTERNS: list[tuple[re.Pattern, Intent, str]] = [
    # Canvas commands
    (re.compile(r"(?:change|set|make)\s+(?:the\s+)?(?:background|bg)\s+(?:to\s+|color\s+)?(.+)", re.I), Intent.COMMAND, "set_background"),
    (re.compile(r"(?:switch\s+to\s+|enable\s+|use\s+)?(?:dark|light)\s+(?:mode|theme)", re.I), Intent.COMMAND, "set_theme"),
    (re.compile(r"(?:zoom)\s+(?:in|out|to\s+\d+)", re.I), Intent.COMMAND, "zoom"),

    # Compose
    (re.compile(r"(?:write|explain|describe|tell\s+me)\s+(?:about\s+)?(.+)", re.I), Intent.COMPOSE, ""),
    (re.compile(r"(?:add|create|put)\s+(?:a\s+)?(?:note|text|section)\s+(?:about|on|for)\s+(.+)", re.I), Intent.COMPOSE, ""),
    (re.compile(r"(?:summarize|overview|recap)\s+(.+)", re.I), Intent.COMPOSE, ""),

    # Diagram
    (re.compile(r"(?:draw|create|make|generate)\s+(?:a\s+)?(?:diagram|flowchart|mindmap|chart|flow|map|timeline|visualization)\s*(?:about|of|for)?\s*(.*)", re.I), Intent.DIAGRAM, ""),
    (re.compile(r"(?:visualize|diagram)\s+(.+)", re.I), Intent.DIAGRAM, ""),

    # Arrange
    (re.compile(r"(?:organize|arrange|layout|sort|group|cluster|tidy|clean\s*up)\s+(?:my\s+)?(.+)?", re.I), Intent.ARRANGE, ""),
    (re.compile(r"(?:move|put)\s+(.+?)\s+(?:near|next\s+to|beside|by)\s+(.+)", re.I), Intent.ARRANGE, ""),

    # Search
    (re.compile(r"(?:find|search|look\s+for|where\s+is)\s+(.+)", re.I), Intent.SEARCH, ""),
    (re.compile(r"(?:show\s+me)\s+(?:notes?\s+(?:about|on|for)\s+)?(.+)", re.I), Intent.SEARCH, ""),

    # Navigate
    (re.compile(r"(?:go\s+to|open|navigate\s+to|show)\s+(?:page\s+)?(.+)", re.I), Intent.NAVIGATE, ""),
    (re.compile(r"(?:pan\s+to|scroll\s+to|focus\s+on)\s+(.+)", re.I), Intent.NAVIGATE, ""),

    # Capture
    (re.compile(r"(?:capture|save|store|remember|note\s+down)\s+(?:that\s+)?(.+)", re.I), Intent.CAPTURE, ""),
]

# Color name → hex mapping
_COLOR_MAP: dict[str, str] = {
    "black": "#000000", "white": "#ffffff",
    "dark blue": "#1a1a2e", "navy": "#1a1a2e",
    "dark": "#0e0e1a", "midnight": "#0e0e1a",
    "dark gray": "#1e1e2e", "dark grey": "#1e1e2e",
    "light gray": "#f3f4f6", "light grey": "#f3f4f6",
    "red": "#ef4444", "green": "#22c55e", "blue": "#3b82f6",
    "purple": "#8b5cf6", "indigo": "#6366f1",
    "yellow": "#eab308", "orange": "#f97316", "pink": "#ec4899",
    "teal": "#14b8a6", "cyan": "#06b6d4",
    "slate": "#334155", "zinc": "#3f3f46",
    "warm": "#292524", "cool": "#1e293b",
}


def classify_intent(message: str) -> tuple[Intent, str, dict]:
    """
    Returns (intent, extracted_topic, metadata).
    Deterministic pattern matching. Fast and predictable.
    """
    msg = message.strip()
    if not msg:
        return Intent.QUERY, "", {}

    # Ambiguous dictation: users often mean "place exact text" not "expand topic".
    # We ask for explicit mode selection instead of silently composing long content.
    write_down_match = _WRITE_DOWN_PATTERN.match(msg)
    if write_down_match:
        literal_text = write_down_match.group(1).strip()
        return Intent.COMPOSE, literal_text, {
            "sub_intent": "clarify_literal_vs_compose",
            "literal_text": literal_text,
        }

    # Check slash commands first
    if msg.startswith("/"):
        return _classify_slash_command(msg)

    # Explicit mode prefixes to avoid accidental expansion.
    exact_text = _extract_prefixed_content(msg, "exact")
    if exact_text:
        return Intent.COMPOSE, exact_text, {"sub_intent": "literal_text", "mode": "exact"}

    compose_topic = _extract_prefixed_content(msg, "compose")
    if compose_topic:
        return Intent.COMPOSE, compose_topic, {"mode": "expanded"}

    # Pattern matching
    for pattern, intent, sub_intent in _COMMAND_PATTERNS:
        match = pattern.match(msg)
        if match:
            topic = match.group(1).strip() if match.lastindex and match.lastindex >= 1 else ""
            meta = {}
            if sub_intent:
                meta["sub_intent"] = sub_intent
            if intent == Intent.COMMAND and sub_intent == "set_background":
                meta["color"] = _resolve_color(topic)
            if intent == Intent.COMMAND and sub_intent == "set_theme":
                meta["theme"] = "dark" if "dark" in msg.lower() else "light"
            return intent, topic, meta

    # Default: treat as query
    return Intent.QUERY, msg, {}


def _classify_slash_command(msg: str) -> tuple[Intent, str, dict]:
    parts = msg.split(None, 1)
    cmd = parts[0].lower()
    args = parts[1].strip() if len(parts) > 1 else ""

    mapping = {
        "/compose": Intent.COMPOSE,
        "/write": Intent.COMPOSE,
        "/explain": Intent.COMPOSE,
        "/diagram": Intent.DIAGRAM,
        "/draw": Intent.DIAGRAM,
        "/flowchart": Intent.DIAGRAM,
        "/mindmap": Intent.DIAGRAM,
        "/find": Intent.SEARCH,
        "/search": Intent.SEARCH,
        "/capture": Intent.CAPTURE,
        "/note": Intent.CAPTURE,
        "/organize": Intent.ARRANGE,
        "/layout": Intent.ARRANGE,
        "/arrange": Intent.ARRANGE,
        "/bg": Intent.COMMAND,
        "/background": Intent.COMMAND,
        "/theme": Intent.COMMAND,
        "/dark": Intent.COMMAND,
        "/light": Intent.COMMAND,
        "/go": Intent.NAVIGATE,
        "/open": Intent.NAVIGATE,
        "/page": Intent.NAVIGATE,
    }

    intent = mapping.get(cmd, Intent.QUERY)
    meta: dict = {}

    if cmd in ("/bg", "/background"):
        meta["sub_intent"] = "set_background"
        meta["color"] = _resolve_color(args)
    elif cmd in ("/theme", "/dark", "/light"):
        meta["sub_intent"] = "set_theme"
        if cmd == "/dark":
            meta["theme"] = "dark"
        elif cmd == "/light":
            meta["theme"] = "light"
        else:
            meta["theme"] = "dark" if "dark" in args.lower() else "light"

    return intent, args, meta


def _resolve_color(text: str) -> str:
    """Resolve a color name or hex string."""
    text = text.strip().lower()
    if text.startswith("#") and len(text) in (4, 7):
        return text
    # Check color map
    if text in _COLOR_MAP:
        return _COLOR_MAP[text]
    # Partial match
    for name, hex_val in _COLOR_MAP.items():
        if name in text or text in name:
            return hex_val
    return "#0e0e1a"  # default dark


def _extract_prefixed_content(message: str, prefix: str) -> str:
    m = re.match(rf"^\s*{re.escape(prefix)}\s*[:,-]\s*(.+)$", message, re.I)
    if not m:
        return ""
    return m.group(1).strip()


def extract_topic(message: str) -> str:
    """Extract the main topic/subject from a message."""
    msg = message.strip()
    # Remove common prefixes
    for prefix in ["write about", "explain", "describe", "tell me about",
                    "summarize", "overview of", "create a note about",
                    "draw a diagram of", "organize my", "find"]:
        if msg.lower().startswith(prefix):
            return msg[len(prefix):].strip()
    return msg