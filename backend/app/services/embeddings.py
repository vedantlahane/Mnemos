# === FILE: backend/app/services/embeddings.py ===

from google import genai
from app.config import settings
from app.services.retry import with_retry

client = genai.Client(api_key=settings.gemini_api_key)
EMBEDDING_MODEL = "gemini-embedding-001"


@with_retry(max_retries=3, base_delay=2.0)
async def generate(text: str) -> list[float]:
    text = text[:2000]
    result = await client.aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config={"task_type": "RETRIEVAL_DOCUMENT", "output_dimensionality": settings.embedding_dimensions},
    )
    return result.embeddings[0].values


@with_retry(max_retries=3, base_delay=2.0)
async def generate_query(text: str) -> list[float]:
    text = text[:500]
    result = await client.aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config={"task_type": "RETRIEVAL_QUERY", "output_dimensionality": settings.embedding_dimensions},
    )
    return result.embeddings[0].values