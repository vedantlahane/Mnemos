# === FILE: backend/app/commands/router.py ===

"""
Intent classifier — pattern matching first, LLM fallback.
Converts natural language → (intent, action, params).
"""

from __future__ import annotations
import json
import re
import logging

from app.llm import router as llm_router

logger = logging.getLogger("mnemos.cmd")

# ══════════════════════════════════════
# Pattern table: (triggers, intent, action)
# Order matters — first match wins.
# Triggers ending with space are prefix-matches.
# ══════════════════════════════════════

_RULES: list[tuple[list[str], str, str]] = [
    # ── Navigate ──
    (["open settings", "show settings", "preferences", "my settings", "/settings"],
     "navigate", "open_settings"),
    (["show boards", "list boards", "my boards", "all boards", "/boards"],
     "navigate", "list_boards"),

    # ── Board awareness (before generic capture) ──
    (["summarize this page", "summarize page", "summarize board",
      "summarize this board", "summarize the board", "summarize the page",
      "what's on this page", "whats on this page", "what is on this page",
      "what's on this board", "whats on this board", "what is on this board",
      "what's on the page", "whats on the page",
      "what's on the board", "whats on the board",
      "what do i have here", "whats here", "what's here",
      "describe this page", "describe this board",
      "page summary", "board summary",
      "what does this board contain", "what does this page contain",
      "tell me about this page", "tell me about this board",
      "what's on my board", "what's on my page"],
     "chat", "summarize_board"),

    # ── Canvas: diagrams ──
    (["draw diagram ", "create diagram ", "diagram about ", "make diagram ",
      "draw a diagram ", "create a diagram ", "make a diagram ",
      "diagram of ", "diagram for "],
     "canvas", "add_diagram"),

    # ── Canvas: compose ──
    (["write about ", "compose ", "write on canvas ",
      "write about", "compose about "],
     "canvas", "compose"),

    # ── Canvas: rebuild / organize ──
    (["rebuild canvas", "reset canvas", "rebuild board", "rebuild page",
      "organize page", "organize board", "organize canvas", "organize",
      "organise page", "organise board", "organise canvas", "organise",
      "clean up page", "clean up board", "clean up canvas", "clean up", "cleanup",
      "fix layout", "fix overlaps", "fix overlap",
      "reorganize", "reorganize page", "reorganise", "reorganise page"],
     "canvas", "rebuild"),

    # ── Theme ──
    (["dark mode", "dark theme", "set theme dark", "switch to dark", "go dark"],
     "settings", "set_dark"),
    (["light mode", "light theme", "set theme light", "switch to light", "go light"],
     "settings", "set_light"),

    # ── Settings: models ──
    (["set primary model "], "settings", "set_primary_model"),
    (["set secondary model "], "settings", "set_secondary_model"),
    (["set auto layout ", "turn auto layout "], "settings", "set_auto_layout"),
    (["set auto connect ", "turn auto connect "], "settings", "set_auto_connect"),
    (["increase similarity threshold"], "settings", "inc_threshold"),
    (["decrease similarity threshold"], "settings", "dec_threshold"),

    # ── Search ──
    (["search for ", "find ", "search ", "/search "],
     "query", "search"),

    # ── Manage ──
    (["create board ", "new board ", "create workspace ", "/board "],
     "manage", "create_board"),
    (["delete board ", "remove board "],
     "manage", "delete_board"),
    (["rename board "],
     "manage", "rename_board"),
]


def _detect_compound(lower: str, original: str) -> dict | None:
    """Detect compound commands like 'write about X and create diagram about Y'"""
    import re
    
    # Patterns: "write about X and draw/create diagram"
    # or "create diagram and write about X"
    compound_patterns = [
        (r"(?:write|compose)\s+(?:about\s+)?(.+?)\s+(?:and|&|,)\s+(?:draw|create|make)\s+(?:a\s+)?diagram",
         "compose_and_diagram"),
        (r"(?:draw|create|make)\s+(?:a\s+)?diagram\s+(?:about\s+)?(.+?)\s+(?:and|&|,)\s+(?:write|compose)\s+(?:about\s+)?(.+)",
         "diagram_and_compose"),
        (r"(?:write|compose)\s+(?:about\s+)?(.+?)\s+(?:and|&|,)\s+(?:draw|create|make)\s+(?:a\s+)?(?:architecture\s+)?diagram",
         "compose_and_diagram"),
    ]

    for pattern, cmd_type in compound_patterns:
        m = re.search(pattern, lower)
        if m:
            topic = m.group(1).strip()
            return {
                "intent": "canvas",
                "action": "compose_and_diagram",
                "params": {"topic": topic},
                "confidence": 0.95,
            }

    # Also catch: "write about X and create architecture diagram"
    if ("diagram" in lower and
        any(w in lower for w in ("write about", "compose about", "write on")) and
        any(w in lower for w in ("and", "&", ","))):
        # Extract the topic — everything between "about" and "and"
        m = re.search(r"(?:write|compose)\s+(?:about\s+)(.+?)(?:\s+and|\s*&|\s*,)", lower)
        if m:
            topic = m.group(1).strip()
            return {
                "intent": "canvas",
                "action": "compose_and_diagram",
                "params": {"topic": topic},
                "confidence": 0.90,
            }

    return None


async def classify(message: str, context: dict = None) -> dict:
    lower = message.lower().strip()

    # ── 0. Compound command detection ──
    compound = _detect_compound(lower, message)
    if compound:
        return compound

    # ── 1. Pattern match ──
    for triggers, intent, action in _RULES:
        for trig in triggers:
            is_prefix = trig.endswith(" ")
            bare = trig.rstrip()

            if is_prefix:
                if lower.startswith(bare):
                    remainder = message[len(bare):].strip().strip(":\"'")
                    return _result(intent, action, _params(remainder, action), 0.95)
            else:
                if lower == bare or lower.startswith(bare + " "):
                    remainder = message[len(bare):].strip().strip(":\"'")
                    return _result(intent, action, _params(remainder, action), 0.95)

    # ── 2. "open <board>" ──
    for prefix in ("open ", "go to ", "switch to "):
        if lower.startswith(prefix):
            ref = message[len(prefix):].strip()
            if ref.lower() not in ("settings",):
                return _result("navigate", "open_board", {"board_ref": ref}, 0.9)

    # ── 3. Board-context heuristic ──
    if context and context.get("workspace_id"):
        board_signals = [
            "this page", "this board", "on here", "on the page",
            "on the board", "the canvas", "this canvas",
            "my board", "my page", "do i have", "have i got",
        ]
        for sig in board_signals:
            if sig in lower:
                return _result("chat", "summarize_board", {"query": message}, 0.85)

    # ── 4. LLM fallback ──
    return await _llm_classify(message, context)


def _result(intent, action, params, confidence):
    return {"intent": intent, "action": action, "params": params,
            "confidence": confidence}


def _params(remainder: str, action: str) -> dict:
    if not remainder:
        return {}
    mapping = {
        "add_diagram": "topic",
        "compose": "topic",
        "compose_and_diagram": "topic",
        "search": "query",
        "create_board": "name",
        "delete_board": "board_ref",
    }
    if action == "rename_board" and " to " in remainder:
        old, new = remainder.split(" to ", 1)
        return {"board_ref": old.strip(), "new_name": new.strip()}
    key = mapping.get(action, "text")
    return {key: remainder}


async def _llm_classify(message: str, context: dict = None) -> dict:
    ctx_str = ""
    if context:
        if context.get("workspace_id"):
            ctx_str += f"\nViewing workspace: {context.get('workspace_name', 'unknown')}"
        ctx_str += f"\nItems: {context.get('item_count', 0)}"

    system = f"""Classify this message for a knowledge workspace app.
Return ONLY valid JSON:
{{"intent":"navigate|query|canvas|manage|settings|chat",
  "action":"action_name",
  "params":{{}},
  "confidence":0.0-1.0}}

Actions:
- navigate: open_settings, list_boards, open_board(board_ref)
- query: search(query)
- canvas: add_diagram(topic), compose(topic), compose_and_diagram(topic), rebuild
- manage: create_board(name), delete_board(board_ref), rename_board(board_ref,new_name)
- settings: set_dark, set_light, set_primary_model(text), set_secondary_model(text)
- chat: answer, summarize_board

If user asks to write AND create diagram about same topic → canvas/compose_and_diagram
If user asks about "this page/board/what's here" → chat/summarize_board
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
        return _result("chat", "answer", {}, 0.5)


def _parse_json(text: str) -> dict:
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