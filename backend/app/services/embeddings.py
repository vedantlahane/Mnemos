from google import genai
from google.genai import types
from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)


async def generate(text: str) -> list[float]:
    result = await client.aio.models.embed_content(
        model="gemini-embedding-001",
        contents=text[:2000],
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=768,
        ),
    )
    return result.embeddings[0].values


async def generate_query(text: str) -> list[float]:
    result = await client.aio.models.embed_content(
        model="gemini-embedding-001",
        contents=text[:500],
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=768,
        ),
    )
    return result.embeddings[0].values