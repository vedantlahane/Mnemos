import asyncio
import google.generativeai as genai
from app.config import settings

genai.configure(api_key=settings.gemini_api_key)


async def generate(text: str) -> list[float]:
    result = await asyncio.to_thread(
        lambda: genai.embed_content(
            model="models/text-embedding-004",
            content=text[:2000],
            task_type="retrieval_document",
        )
    )
    return result["embedding"]


async def generate_query(text: str) -> list[float]:
    result = await asyncio.to_thread(
        lambda: genai.embed_content(
            model="models/text-embedding-004",
            content=text[:500],
            task_type="retrieval_query",
        )
    )
    return result["embedding"]