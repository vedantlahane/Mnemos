import google.generativeai as genai
from app.config import settings
from app.models.schemas import ProcessedCapture

genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel("gemini-2.0-flash")

PROCESS_PROMPT = """Analyze this text and return JSON only:
{{
    "title": "concise title, max 10 words",
    "summary": "2-3 sentence summary capturing key points",
    "tags": ["3-5 lowercase tags"],
    "tasks": ["any actionable items found, empty array if none"],
    "entities": ["key people, tools, companies, concepts mentioned"]
}}

Text:
{text}"""

CHAT_SYSTEM = """You are a personal knowledge assistant. Answer based ONLY on
the user's notes provided in the context. If the notes don't contain enough
information, say so honestly. Cite which notes you're drawing from by
mentioning their titles."""


async def process_capture(text: str) -> ProcessedCapture:
    response = await model.generate_content_async(
        PROCESS_PROMPT.format(text=text[:3000]),
        generation_config={"response_mime_type": "application/json"},
    )
    return ProcessedCapture.model_validate_json(response.text)


async def chat(
    question: str,
    context: str,
    history: list[dict],
) -> str:
    messages = []

    messages.append({"role": "user", "parts": [CHAT_SYSTEM]})
    messages.append(
        {"role": "model", "parts": ["Understood. I'll answer only from your notes."]}
    )

    for msg in history[-10:]:
        role = "user" if msg["role"] == "user" else "model"
        messages.append({"role": role, "parts": [msg["content"]]})

    messages.append(
        {
            "role": "user",
            "parts": [
                f"Context from my notes:\n\n{context}\n\n---\n\nQuestion: {question}"
            ],
        }
    )

    response = await model.generate_content_async(messages)
    return response.text