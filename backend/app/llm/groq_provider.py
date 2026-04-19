from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.config import settings
import logging

logger = logging.getLogger("mnemos.llm.groq")


def get_groq_llm(model: str = None, temperature: float = 0.3,
                  streaming: bool = True) -> ChatGroq:
    if not settings.groq_api_key:
        raise ValueError("Groq API key not configured")
    return ChatGroq(
        model=model or settings.groq_model,
        groq_api_key=settings.groq_api_key,
        temperature=temperature,
        streaming=streaming,
    )


async def groq_chat_call(system: str, messages: list[dict],
                         model: str = None) -> str:
    if not settings.groq_api_key:
        raise ValueError("Groq API key not configured")
    llm = get_groq_llm(model=model, streaming=False)
    lc_messages = [SystemMessage(content=system)]
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
    result = await llm.ainvoke(lc_messages)
    return result.content