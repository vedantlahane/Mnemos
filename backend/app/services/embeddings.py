from google import genai
from google.genai import types
from app.config import settings
import logging

logger = logging.getLogger("mnemos.embeddings")

client = genai.Client(api_key=settings.gemini_api_key)

async def generate(text: str) -> list[float]:
    if not text or not text.strip():
        return [0.0] * settings.embedding_dimensions
    try:
        result = client.models.embed_content(
            model="gemini-embedding-001",
            contents=text[:8000],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=settings.embedding_dimensions,
            )
        )
        return result.embeddings[0].values
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        raise

async def generate_query(text: str) -> list[float]:
    if not text or not text.strip():
        return [0.0] * settings.embedding_dimensions
    try:
        result = client.models.embed_content(
            model="gemini-embedding-001",
            contents=text[:2000],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=settings.embedding_dimensions,
            )
        )
        return result.embeddings[0].values
    except Exception as e:
        logger.error(f"Query embedding failed: {e}")
        raise

async def generate_batch(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    if not texts:
        return []
    results = []
    batch_size = 20
    for i in range(0, len(texts), batch_size):
        batch = [t[:8000] for t in texts[i:i + batch_size] if t and t.strip()]
        if not batch:
            continue
        try:
            result = client.models.embed_content(
                model="gemini-embedding-001",
                contents=batch,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=settings.embedding_dimensions,
                )
            )
            for emb in result.embeddings:
                results.append(emb.values)
        except Exception as e:
            logger.error(f"Batch embedding failed at chunk {i}: {e}")
            results.extend([[0.0] * settings.embedding_dimensions] * len(batch))
    return results