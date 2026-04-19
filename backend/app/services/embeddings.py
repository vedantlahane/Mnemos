# === FILE: backend/app/services/embeddings.py ===

"""Embedding generation via Gemini."""

from google import genai
from google.genai import types
from app.core.config import settings
import logging

logger = logging.getLogger("mnemos.embeddings")

_client = genai.Client(api_key=settings.gemini_api_key)


async def generate(text: str) -> list[float]:
    if not text or not text.strip():
        return [0.0] * settings.embedding_dim
    result = _client.models.embed_content(
        model="gemini-embedding-001",
        contents=text[:8000],
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=settings.embedding_dim,
        ),
    )
    return result.embeddings[0].values


async def generate_query(text: str) -> list[float]:
    if not text or not text.strip():
        return [0.0] * settings.embedding_dim
    result = _client.models.embed_content(
        model="gemini-embedding-001",
        contents=text[:2000],
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=settings.embedding_dim,
        ),
    )
    return result.embeddings[0].values