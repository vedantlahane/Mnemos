# === FILE: backend/app/llm/google_provider.py ===

import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings
import logging

logger = logging.getLogger("mnemos.llm.google")

genai.configure(api_key=settings.gemini_api_key)


def get_google_llm(model: str = None, temperature: float = 0.3, streaming: bool = True) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model or settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=temperature,
        streaming=streaming,
    )


async def google_chat_call(system: str, messages: list[dict], model: str = None) -> str:
    """Direct Gemini API call (non-streaming)."""
    m = genai.GenerativeModel(
        model_name=model or settings.gemini_model,
        system_instruction=system,
    )
    history = []
    last_content = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            last_content = content
        else:
            history.append({"role": "model" if role == "assistant" else role, "parts": [content]})

    chat = m.start_chat(history=history if history else None)
    response = chat.send_message(last_content)
    return response.text


async def google_structured_call(system: str, prompt: str, response_schema: dict = None, model: str = None) -> str:
    """Call Gemini with optional JSON mode."""
    generation_config = {"temperature": 0.2}
    if response_schema:
        generation_config["response_mime_type"] = "application/json"

    m = genai.GenerativeModel(
        model_name=model or settings.gemini_model,
        system_instruction=system,
        generation_config=generation_config,
    )
    response = m.generate_content(prompt)
    return response.text