# === FILE: backend/app/services/embeddings.py (COMPLETE) ===

import google.generativeai as genai
from app.config import settings
import logging

logger = logging.getLogger("mnemos.embeddings")

genai.configure(api_key=settings.gemini_api_key)


async def generate(text: str) -> list[float]:
    """Generate embedding for content (storage)."""
    if not text or not text.strip():
        return [0.0] * settings.embedding_dimensions
    try:
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text[:8000],
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=settings.embedding_dimensions,
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        raise


async def generate_query(text: str) -> list[float]:
    """Generate embedding for search query."""
    if not text or not text.strip():
        return [0.0] * settings.embedding_dimensions
    try:
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text[:2000],
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=settings.embedding_dimensions,
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Query embedding failed: {e}")
        raise


async def generate_batch(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Generate embeddings for multiple texts."""
    if not texts:
        return []
    results = []
    # Gemini supports batch but we chunk to avoid limits
    batch_size = 20
    for i in range(0, len(texts), batch_size):
        batch = [t[:8000] for t in texts[i:i + batch_size] if t and t.strip()]
        if not batch:
            continue
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=batch,
                task_type=task_type,
                output_dimensionality=settings.embedding_dimensions,
            )
            results.extend(result["embedding"])
        except Exception as e:
            logger.error(f"Batch embedding failed at chunk {i}: {e}")
            # Fill with zeros for failed items
            results.extend([[0.0] * settings.embedding_dimensions] * len(batch))
    return results