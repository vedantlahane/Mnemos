# === FILE: backend/app/llm/google_provider.py ===

from google import genai
from google.genai import types
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings
import logging

logger = logging.getLogger("mnemos.llm.google")

_client = None


def _get_client():
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key not configured")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def get_google_llm(model: str = None, temperature: float = 0.3,
                   streaming: bool = True) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model or settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=temperature,
        streaming=streaming,
    )


async def google_chat_call(system: str, messages: list[dict],
                           model: str = None) -> str:
    history = []
    last_content = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            last_content = content
        else:
            history.append(types.Content(
                role="model" if role == "assistant" else role,
                parts=[types.Part.from_text(content)],
            ))

    chat = _get_client().chats.create(
        model=model or settings.gemini_model,
        config=types.GenerateContentConfig(system_instruction=system),
    )
    if history:
        chat._history = history

    response = chat.send_message(last_content)
    return response.text

async def google_chat_stream(system: str, messages: list[dict],
                             model: str = None):
    history = []
    last_content = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            last_content = content
        else:
            history.append(types.Content(
                role="model" if role == "assistant" else role,
                parts=[types.Part.from_text(content)],
            ))

    chat = _get_client().chats.create(
        model=model or settings.gemini_model,
        config=types.GenerateContentConfig(system_instruction=system),
    )
    if history:
        chat._history = history

    response = chat.send_message_stream(last_content)
    for chunk in response:
        if chunk.text:
            yield chunk.text


async def google_structured_call(system: str, prompt: str,
                                 model: str = None) -> str:
    config = types.GenerateContentConfig(
        temperature=0.2,
        system_instruction=system,
        response_mime_type="application/json",
    )
    response = _get_client().models.generate_content(
        model=model or settings.gemini_model,
        contents=prompt,
        config=config,
    )
    return response.text