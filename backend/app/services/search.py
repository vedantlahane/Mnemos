# === FILE: backend/app/services/search.py ===

"""Semantic search across items."""

from app.db.repo import repo
from app.services.embeddings import generate_query
import logging

logger = logging.getLogger("mnemos.search")


async def semantic_search(
    query: str,
    owner_id: str = None,
    workspace_id: str = None,
    limit: int = 10,
    threshold: float = 0.55,
) -> list:
    emb = await generate_query(query)

    if workspace_id:
        results = await repo.vector_search_in_workspace(
            emb, workspace_id, limit=limit, threshold=threshold,
        )
    else:
        results = await repo.vector_search(
            emb, limit=limit, threshold=threshold,
        )

    if owner_id:
        results = [r for r in results if r.get("owner_id") == owner_id]

    return results