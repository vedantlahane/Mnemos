"""
LLM Router: picks the best provider for each task.
- Fast tasks (extraction, routing, edges) → Groq (fast inference)
- Complex tasks (chat, analysis, summaries) → Google Gemini (better reasoning)
- Falls back automatically if one provider fails.
"""

from app.config import settings
from app.llm.google_provider import google_json_call, google_chat_call
from app.llm.groq_provider import groq_json_call, groq_chat_call
from app.llm import prompts
from app.models.schemas import ProcessedCapture, EdgeClassification


def _has_groq() -> bool:
    return bool(settings.groq_api_key)


# ── Fast JSON tasks → Groq primary, Google fallback ──

async def process_capture(text: str) -> ProcessedCapture:
    prompt = prompts.PROCESS_PROMPT.format(text=text[:3000])
    try:
        if _has_groq():
            result = await groq_json_call(prompt)
        else:
            result = await google_json_call(prompt)
    except Exception as e:
        print(f"Primary LLM failed for process_capture: {e}")
        result = await google_json_call(prompt)
    return ProcessedCapture.model_validate(result)


async def classify_edge(
    title_a: str, content_a: str, title_b: str, content_b: str
) -> EdgeClassification:
    prompt = prompts.EDGE_CLASSIFICATION_PROMPT.format(
        title_a=title_a, content_a=content_a[:1000],
        title_b=title_b, content_b=content_b[:1000],
    )
    try:
        if _has_groq():
            result = await groq_json_call(prompt)
        else:
            result = await google_json_call(prompt)
    except Exception as e:
        print(f"Primary LLM failed for classify_edge: {e}")
        result = await google_json_call(prompt)
    return EdgeClassification.model_validate(result)


async def route_to_page(
    title: str, tags: list, content: str, source_url: str, pages_info: str
) -> dict:
    prompt = prompts.PAGE_ROUTING_PROMPT.format(
        title=title or "Untitled",
        tags=", ".join(tags) if tags else "none",
        content=content[:1500],
        source_url=source_url or "none",
        pages_info=pages_info,
    )
    try:
        if _has_groq():
            return await groq_json_call(prompt)
        return await google_json_call(prompt)
    except Exception as e:
        print(f"Primary LLM failed for route_to_page: {e}")
        return await google_json_call(prompt)


async def name_cluster(notes_info: str) -> dict:
    prompt = prompts.CLUSTER_NAMING_PROMPT.format(notes_info=notes_info)
    try:
        if _has_groq():
            return await groq_json_call(prompt)
        return await google_json_call(prompt)
    except Exception as e:
        print(f"Primary LLM failed for name_cluster: {e}")
        return await google_json_call(prompt)


# ── Complex reasoning tasks → Google primary, Groq fallback ──

async def chat(
    question: str, context: str, history: list, page_context: str = None
) -> str:
    system = prompts.CHAT_SYSTEM
    if page_context:
        system += f"\n\nThe user is currently viewing the '{page_context}' page. Prioritize notes from this page."

    messages = []
    for msg in (history or [])[-10:]:
        messages.append({"role": msg.get("role", "user"), "content": msg["content"]})
    messages.append({
        "role": "user",
        "content": f"Context from notes:\n{context}\n\nQuestion: {question}",
    })

    try:
        return await google_chat_call(system, messages)
    except Exception as e:
        print(f"Google chat failed: {e}")
        if _has_groq():
            return await groq_chat_call(system, messages)
        raise


async def generate_follow_ups(question: str, answer: str) -> list[str]:
    prompt = prompts.FOLLOW_UP_PROMPT.format(
        question=question, answer=answer[:1500]
    )
    try:
        result = await google_json_call(prompt)
        return result if isinstance(result, list) else []
    except Exception:
        try:
            if _has_groq():
                result = await groq_json_call(prompt)
                return result if isinstance(result, list) else []
        except Exception:
            pass
        return []


async def analyze_gaps(topic: str, notes_info: str) -> dict:
    prompt = prompts.GAP_ANALYSIS_PROMPT.format(
        topic=topic, notes_info=notes_info
    )
    try:
        return await google_json_call(prompt)
    except Exception as e:
        print(f"Google gap analysis failed: {e}")
        if _has_groq():
            return await groq_json_call(prompt)
        raise


async def generate_reading_path(topic: str, notes_info: str) -> list:
    prompt = prompts.READING_PATH_PROMPT.format(
        topic=topic, notes_info=notes_info
    )
    try:
        result = await google_json_call(prompt)
        return result if isinstance(result, list) else []
    except Exception as e:
        print(f"Google reading path failed: {e}")
        if _has_groq():
            result = await groq_json_call(prompt)
            return result if isinstance(result, list) else []
        raise


async def generate_page_summary(page_name: str, notes_info: str) -> dict:
    prompt = prompts.PAGE_SUMMARY_PROMPT.format(
        page_name=page_name, notes_info=notes_info
    )
    try:
        return await google_json_call(prompt)
    except Exception as e:
        print(f"Google page summary failed: {e}")
        if _has_groq():
            return await groq_json_call(prompt)
        raise


async def ai_position_note(
    title: str, tags: list, summary: str,
    existing_notes: str, width: int, height: int,
) -> dict:
    prompt = prompts.AI_POSITION_PROMPT.format(
        title=title or "Untitled",
        tags=", ".join(tags) if tags else "none",
        summary=summary or "",
        existing_notes=existing_notes,
        width=width, height=height,
    )
    try:
        if _has_groq():
            return await groq_json_call(prompt)
        return await google_json_call(prompt)
    except Exception as e:
        print(f"AI position failed: {e}")
        return await google_json_call(prompt)


async def decide_command_intent(
    question: str,
    context_type: str,
    page_name: str | None,
    available_commands: list[str],
) -> dict:
    prompt = prompts.INTENT_ROUTER_PROMPT.format(
        question=(question or "")[:1000],
        context_type=context_type or "home",
        page_name=page_name or "none",
        available_commands="\n".join(f"- {c}" for c in available_commands),
    )

    def _normalize(result: dict) -> dict:
        mode = str(result.get("mode") or "chat").lower()
        if mode not in {"command", "chat"}:
            mode = "chat"

        command = str(result.get("command") or "").strip()
        args = str(result.get("args") or "").strip()
        reason = str(result.get("reason") or "").strip()
        confidence_raw = result.get("confidence", 0.0)
        try:
            confidence = float(confidence_raw)
        except Exception:
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        if mode == "command" and command not in set(available_commands):
            mode = "chat"
            command = ""
            args = ""
            confidence = min(confidence, 0.49)

        return {
            "mode": mode,
            "command": command,
            "args": args,
            "confidence": confidence,
            "reason": reason,
        }

    try:
        if _has_groq():
            result = await groq_json_call(prompt)
        else:
            result = await google_json_call(prompt)
        if isinstance(result, dict):
            return _normalize(result)
    except Exception as e:
        print(f"Intent routing primary failed: {e}")

    try:
        result = await google_json_call(prompt)
        if isinstance(result, dict):
            return _normalize(result)
    except Exception as e:
        print(f"Intent routing fallback failed: {e}")

    return {
        "mode": "chat",
        "command": "",
        "args": "",
        "confidence": 0.0,
        "reason": "intent-router-fallback",
    }