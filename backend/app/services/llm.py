from google import genai
from google.genai import types
from app.config import settings
from app.models.schemas import ProcessedCapture
from app.services.retry import with_retry

client = genai.Client(api_key=settings.gemini_api_key)

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


@with_retry(max_retries=3, base_delay=2.0)
async def process_capture(text: str) -> ProcessedCapture:
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=PROCESS_PROMPT.format(text=text[:3000]),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    return ProcessedCapture.model_validate_json(response.text)


@with_retry(max_retries=3, base_delay=2.0)
async def chat(
    question: str,
    context: str,
    history: list[dict],
) -> str:
    contents = []

    contents.append(
        types.Content(role="user", parts=[types.Part(text=CHAT_SYSTEM)])
    )
    contents.append(
        types.Content(
            role="model",
            parts=[types.Part(text="Understood. I'll answer only from your notes.")],
        )
    )

    for msg in history[-10:]:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(
            types.Content(role=role, parts=[types.Part(text=msg["content"])])
        )

    contents.append(
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text=f"Context from my notes:\n\n{context}\n\n---\n\nQuestion: {question}"
                )
            ],
        )
    )

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
    )
    return response.text