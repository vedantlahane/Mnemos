# === FILE: backend/app/commands/router.py ===

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
    (["show graph", "knowledge graph", "open graph", "show connections"],
     "navigate", "open_graph"),
    (["show tags", "list tags", "my tags", "tag list"],
     "navigate", "list_tags"),
    (["show stats", "dashboard", "my stats", "usage stats"],
     "navigate", "show_stats"),

    # Page/board awareness — MUST come before generic capture patterns
    (["summarize this page", "summarize page", "summarize board",
      "summarize this board", "summarize the board", "summarize the page",
      "whats on this page", "what's on this page", "what is on this page",
      "whats on this board", "what's on this board", "what is on this board",
      "whats on the page", "what's on the page",
      "whats on the board", "what's on the board",
      "what do i have here", "whats here", "what's here",
      "show me this page", "show me this board",
      "describe this page", "describe this board",
      "page summary", "board summary",
      "what does this board contain", "what does this page contain",
      "contents of this page", "contents of this board",
      "tell me about this page", "tell me about this board"],
     "chat", "summarize_board"),

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
    (["organize page", "organize board", "organize canvas",
      "clean up page", "clean up board", "clean up canvas",
      "fix layout", "fix overlaps", "fix overlap",
      "reorganize", "reorganize page", "reorganize board"],
     "canvas", "rebuild"),

    # Settings
    (["set theme dark", "dark theme", "dark mode", "switch to dark"],
     "settings", "set_dark"),
    (["set theme light", "light theme", "light mode", "switch to light"],
     "settings", "set_light"),
    (["set primary model "],
     "settings", "set_primary_model"),
    (["set secondary model "],
     "settings", "set_secondary_model"),
    (["set auto layout ", "turn auto layout "],
     "settings", "set_auto_layout"),
    (["set auto connect ", "turn auto connect "],
     "settings", "set_auto_connect"),
    (["increase similarity threshold"],
     "settings", "inc_threshold"),
    (["decrease similarity threshold"],
     "settings", "dec_threshold"),

    # Search
    (["search for ", "find "],
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
            if board_ref not in ("settings",):
                return {
                    "intent": "navigate",
                    "action": "open_board",
                    "params": {"board_ref": board_ref},
                    "confidence": 0.9,
                }

    # 3. Check if it's a board-aware question (heuristic before LLM)
    board_question_signals = [
        "this page", "this board", "on here", "on the page", "on the board",
        "the canvas", "this canvas", "my board", "my page",
        "do i have", "have i got", "is there anything",
    ]
    if context and context.get("workspace_id"):
        for signal in board_question_signals:
            if signal in lower:
                return {
                    "intent": "chat",
                    "action": "summarize_board",
                    "params": {"query": message},
                    "confidence": 0.85,
                }

    # 4. LLM fallback
    return await _llm_classify(message, context)


def _extract_params(remainder: str, action: str) -> dict:
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
        if " to " in remainder:
            parts = remainder.split(" to ", 1)
            return {"board_ref": parts[0].strip(), "new_name": parts[1].strip()}
        return {"board_ref": remainder}

    return {"text": remainder} if remainder else {}


async def _llm_classify(message: str, context: dict = None) -> dict:
    ctx_str = ""
    if context:
        if context.get("workspace_id"):
            ctx_str += f"\nUser is viewing workspace: {context.get('workspace_name', 'unknown')}"
        ctx_str += f"\nTotal items: {context.get('item_count', 0)}"
        if context.get("has_canvas_content"):
            ctx_str += f"\nBoard has content on canvas (items, text, diagrams)"

    system = f"""Classify this message for a knowledge workspace app.
The user is currently viewing a board/workspace.

Return ONLY valid JSON:
{{"intent":"navigate|capture|query|canvas|manage|settings|chat",
  "action":"specific_action",
  "params":{{}},
  "confidence":0.0-1.0}}

IMPORTANT: If the user asks about "this page", "this board", "what's here", 
"what do I have", or any question about the current workspace content,
classify as: {{"intent":"chat","action":"summarize_board","params":{{}},"confidence":0.9}}

Possible actions:
- navigate: open_settings, list_boards, list_items, open_board(board_ref), open_graph, list_tags, show_stats
- capture: capture_text(text, board_hint)
- query: search(query)
- canvas: add_diagram(topic), add_sticky(content, color), compose(topic), rebuild
- manage: create_board(name), delete_board(board_ref), rename_board(board_ref, new_name)
- settings: set_model(model), set_threshold(value)
- chat: answer (general Q&A), summarize_board (questions about current page/board content)
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