from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from app.config import settings
from app.services.retry import with_retry
import json


def get_google_llm(model: str = None, temperature: float = 0.1) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model or settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=temperature,
        convert_system_message_to_human=True,
    )


@with_retry(max_retries=3, base_delay=2.0)
async def google_json_call(prompt: str, model: str = None) -> dict | list:
    llm = get_google_llm(model=model, temperature=0.1)
    messages = [
        SystemMessage(content="You are a JSON-only assistant. Return valid JSON with no markdown fences or extra text."),
        HumanMessage(content=prompt),
    ]
    response = await llm.ainvoke(messages)
    text = response.content.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    return json.loads(text)


@with_retry(max_retries=3, base_delay=2.0)
async def google_chat_call(
    system: str,
    messages: list[dict],
    model: str = None,
) -> str:
    llm = get_google_llm(model=model, temperature=0.3)
    lc_messages = [SystemMessage(content=system)]
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        else:
            lc_messages.append(AIMessage(content=content))
    response = await llm.ainvoke(lc_messages)
    return response.content