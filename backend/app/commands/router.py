# === FILE: backend/app/commands/router.py ===

"""
Intent classification.
Fast pattern matching → LLM fallback for ambiguous messages.
"""

from __future__ import annotations
import json
import logging

from app.llm import router as llm_router

logger = logging.getLogger("mnemos.cmd")


# (patterns, intent, action)
_PATTERNS: list[tuple[list[str], str, str]] = [
    # Navigate
    (["open settings", "show settings", "preferences", "my settings"],
     "navigate", "open_settings"),
    (["show boards", "list boards", "my boards", "show workspaces", "all boards"],
     "navigate", "list_boards"),
    (["show cards", "list cards", "my cards", "all items", "show items"],
     "navigate", "list_items"),
    (["show graph", "knowledge graph", "open graph", "graph view"],
     "navigate", "open_graph"),
    (["show tags", "list tags", "all tags"],
     "navigate", "list_tags"),
    (["stats", "statistics", "dashboard", "show stats"],
     "navigate", "show_stats"),

    # Capture
    (["remember ", "save this", "capture ", "note this", "jot down"],
     "capture", "capture_text"),

    # Canvas
    (["draw diagram", "create diagram", "diagram about", "make diagram"],
     "canvas", "add_diagram"),
    (["add sticky", "sticky note", "post-it", "new sticky"],
     "canvas", "add_sticky"),
    (["write about", "compose ", "write on canvas"],
     "canvas", "compose"),
    (["rebuild canvas", "reset canvas", "rebuild board"],
     "canvas", "rebuild"),
    (["dark mode", "dark theme", "switch to dark"],
     "canvas", "set_dark"),
    (["light mode", "light theme", "switch to light"],
     "canvas", "set_light"),

    # Search
    (["search for ", "find ", "look up "],
     "query", "search"),

    # Manage
    (["create board ", "new board ", "create workspace "],
     "manage", "create_board"),
    (["delete board ", "remove board "],
     "manage", "delete_board"),
    (["rename board "],
     "manage", "rename_board"),
]


async def classify(message: str, context: dict = None) -> dict:
    """
    Returns: {intent, action, params, confidence}
    """
    lower = message.lower().strip()

    # 1. Fast pattern match
    for patterns, intent, action in _PATTERNS:
        for pat in patterns:
            if lower.startswith(pat) or (pat.endswith(" ") and pat.rstrip() in lower) \
               or (not pat.endswith(" ") and lower == pat): 
                remainder = lower
                for p in patterns:
                    remainder = remainder.replace(p.strip(), "", 1)
                remainder = remainder.strip().strip(":").strip('"').strip("'").strip()

                params = _extract_params(remainder, action)
                return {
                    "intent": intent,
                    "action": action,
                    "params": params,
                    "confidence": 0.95,
                }

    # 2. "open <board>" / "go to <board>"
    for prefix in ["open ", "go to ", "switch to "]:
        if lower.startswith(prefix):
            board_ref = message[len(prefix):].strip()
            # Don't match if it's a known action like "open settings"
            if board_ref not in ("settings", "graph", "stats"):
                return {
                    "intent": "navigate",
                    "action": "open_board",
                    "params": {"board_ref": board_ref},
                    "confidence": 0.9,
                }

    # 3. LLM fallback
    return await _llm_classify(message, context)


def _extract_params(remainder: str, action: str) -> dict:
    """Pull structured params from the leftover text after pattern match."""
    if action == "capture_text":
        return {"text": remainder} if remainder else {}

    if action in ("add_diagram", "compose"):
        return {"topic": remainder} if remainder else {}

    if action == "add_sticky":
        return {"content": remainder} if remainder else {}

    if action == "search":
        return {"query": remainder} if remainder else {}

    if action == "create_board":
        return {"name": remainder} if remainder else {}

    if action == "delete_board":
        return {"board_ref": remainder} if remainder else {}

    if action == "rename_board":
        # expect "old name to new name"
        if " to " in remainder:
            parts = remainder.split(" to ", 1)
            return {"board_ref": parts[0].strip(), "new_name": parts[1].strip()}
        return {"board_ref": remainder}

    return {"text": remainder} if remainder else {}


async def _llm_classify(message: str, context: dict = None) -> dict:
    """LLM classification for ambiguous messages."""
    ctx_str = ""
    if context:
        if context.get("workspace_id"):
            ctx_str += f"\nUser is viewing workspace: {context.get('workspace_name', 'unknown')}"
        ctx_str += f"\nTotal items: {context.get('item_count', 0)}"

    system = f"""Classify this message for a knowledge workspace app.
Return ONLY valid JSON:
{{"intent":"navigate|capture|query|canvas|manage|settings|chat",
  "action":"specific_action",
  "params":{{}},
  "confidence":0.0-1.0}}

Possible actions:
- navigate: open_settings, list_boards, list_items, open_board(board_ref), open_graph, list_tags, show_stats
- capture: capture_text(text, board_hint)
- query: search(query), knowledge_query(topic)
- canvas: add_diagram(topic), add_sticky(content, color), compose(topic), set_dark, set_light, rebuild
- manage: create_board(name, description), delete_board(board_ref), rename_board(board_ref, new_name), delete_item(item_id), move_item(item_id, board_ref)
- settings: set_model(model), set_threshold(value)
- chat: answer (general Q&A)
{ctx_str}"""

    try:
        response = await llm_router.chat(
            system, [{"role": "user", "content": message}],
        )
        data = _parse_json(response)
        return {
            "intent": data.get("intent", "chat"),
            "action": data.get("action", "answer"),
            "params": data.get("params", {}),
            "confidence": float(data.get("confidence", 0.6)),
        }
    except Exception as e:
        logger.warning(f"LLM classify failed: {e}")
        return {
            "intent": "chat",
            "action": "answer",
            "params": {},
            "confidence": 0.5,
        }


def _parse_json(text: str) -> dict:
    import re
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