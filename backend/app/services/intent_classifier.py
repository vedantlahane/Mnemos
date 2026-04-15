# === FILE: backend/app/services/intent_classifier.py ===

from __future__ import annotations
import re
from app.models.canvas_ops import Intent

_WRITE_DOWN_PATTERN = re.compile(r"^(?:please\s+)?(?:write\s+down|write\s+this\s+down|jot\s+down)\s*[,:\-]?\s*(.+)$", re.I)

_COMMAND_PATTERNS: list[tuple[re.Pattern, Intent, str]] = [
    (re.compile(r"(?:change|set|make)\s+(?:the\s+)?(?:background|bg)\s+(?:to\s+|color\s+)?(.+)", re.I), Intent.COMMAND, "set_background"),
    (re.compile(r"(?:switch\s+to\s+|enable\s+|use\s+)?(?:dark|light)\s+(?:mode|theme)", re.I), Intent.COMMAND, "set_theme"),
    (re.compile(r"(?:zoom)\s+(?:in|out|to\s+\d+)", re.I), Intent.COMMAND, "zoom"),
    (re.compile(r"(?:write|explain|describe|tell\s+me)\s+(?:about\s+)?(.+)", re.I), Intent.COMPOSE, ""),
    (re.compile(r"(?:add|create|put)\s+(?:a\s+)?(?:note|text|section)\s+(?:about|on|for)\s+(.+)", re.I), Intent.COMPOSE, ""),
    (re.compile(r"(?:summarize|overview|recap)\s+(.+)", re.I), Intent.COMPOSE, ""),
    (re.compile(r"(?:draw|create|make|generate)\s+(?:a\s+)?(?:diagram|flowchart|mindmap|chart|flow|map|timeline|visualization)\s*(?:about|of|for)?\s*(.*)", re.I), Intent.DIAGRAM, ""),
    (re.compile(r"(?:visualize|diagram)\s+(.+)", re.I), Intent.DIAGRAM, ""),
    (re.compile(r"(?:organize|arrange|layout|sort|group|cluster|tidy|clean\s*up)\s+(?:my\s+)?(.+)?", re.I), Intent.ARRANGE, ""),
    (re.compile(r"(?:find|search|look\s+for|where\s+is)\s+(.+)", re.I), Intent.SEARCH, ""),
    (re.compile(r"(?:show\s+me)\s+(?:notes?\s+(?:about|on|for)\s+)?(.+)", re.I), Intent.SEARCH, ""),
    (re.compile(r"(?:go\s+to|open|navigate\s+to|show)\s+(?:page\s+)?(.+)", re.I), Intent.NAVIGATE, ""),
    (re.compile(r"(?:capture|save|store|remember|note\s+down)\s+(?:that\s+)?(.+)", re.I), Intent.CAPTURE, ""),
]

_COLOR_MAP = {
    "black": "#000000", "white": "#ffffff", "dark blue": "#1a1a2e", "navy": "#1a1a2e",
    "dark": "#0e0e1a", "midnight": "#0e0e1a", "red": "#ef4444", "green": "#22c55e",
    "blue": "#3b82f6", "purple": "#8b5cf6", "indigo": "#6366f1", "yellow": "#eab308",
    "orange": "#f97316", "pink": "#ec4899", "teal": "#14b8a6", "cyan": "#06b6d4",
}


def classify_intent(message: str) -> tuple[Intent, str, dict]:
    msg = message.strip()
    if not msg:
        return Intent.QUERY, "", {}

    write_down = _WRITE_DOWN_PATTERN.match(msg)
    if write_down:
        literal = write_down.group(1).strip()
        return Intent.COMPOSE, literal, {"sub_intent": "clarify_literal_vs_compose", "literal_text": literal}

    if msg.startswith("/"):
        return _classify_slash(msg)

    exact = _extract_prefix(msg, "exact")
    if exact:
        return Intent.COMPOSE, exact, {"sub_intent": "literal_text", "mode": "exact"}

    compose = _extract_prefix(msg, "compose")
    if compose:
        return Intent.COMPOSE, compose, {"mode": "expanded"}

    for pattern, intent, sub in _COMMAND_PATTERNS:
        match = pattern.match(msg)
        if match:
            topic = match.group(1).strip() if match.lastindex and match.lastindex >= 1 else ""
            meta = {}
            if sub:
                meta["sub_intent"] = sub
            if intent == Intent.COMMAND and sub == "set_background":
                meta["color"] = _resolve_color(topic)
            if intent == Intent.COMMAND and sub == "set_theme":
                meta["theme"] = "dark" if "dark" in msg.lower() else "light"
            return intent, topic, meta

    return Intent.QUERY, msg, {}


def _classify_slash(msg: str) -> tuple[Intent, str, dict]:
    parts = msg.split(None, 1)
    cmd = parts[0].lower()
    args = parts[1].strip() if len(parts) > 1 else ""
    mapping = {
        "/compose": Intent.COMPOSE, "/write": Intent.COMPOSE, "/explain": Intent.COMPOSE,
        "/diagram": Intent.DIAGRAM, "/draw": Intent.DIAGRAM, "/flowchart": Intent.DIAGRAM,
        "/find": Intent.SEARCH, "/search": Intent.SEARCH,
        "/capture": Intent.CAPTURE, "/note": Intent.CAPTURE,
        "/organize": Intent.ARRANGE, "/layout": Intent.ARRANGE,
        "/bg": Intent.COMMAND, "/background": Intent.COMMAND,
        "/theme": Intent.COMMAND, "/dark": Intent.COMMAND, "/light": Intent.COMMAND,
        "/go": Intent.NAVIGATE, "/open": Intent.NAVIGATE,
    }
    intent = mapping.get(cmd, Intent.QUERY)
    meta: dict = {}
    if cmd in ("/bg", "/background"):
        meta["sub_intent"] = "set_background"
        meta["color"] = _resolve_color(args)
    elif cmd in ("/theme", "/dark", "/light"):
        meta["sub_intent"] = "set_theme"
        meta["theme"] = "dark" if cmd == "/dark" or "dark" in args.lower() else "light"
    return intent, args, meta


def _resolve_color(text: str) -> str:
    text = text.strip().lower()
    if text.startswith("#") and len(text) in (4, 7):
        return text
    if text in _COLOR_MAP:
        return _COLOR_MAP[text]
    for name, hex_val in _COLOR_MAP.items():
        if name in text or text in name:
            return hex_val
    return "#0e0e1a"


def _extract_prefix(message: str, prefix: str) -> str:
    m = re.match(rf"^\s*{re.escape(prefix)}\s*[:,-]\s*(.+)$", message, re.I)
    return m.group(1).strip() if m else ""


def extract_topic(message: str) -> str:
    msg = message.strip()
    for prefix in ["write about", "explain", "describe", "tell me about", "summarize",
                    "overview of", "create a note about", "draw a diagram of", "organize my", "find"]:
        if msg.lower().startswith(prefix):
            return msg[len(prefix):].strip()
    return msg