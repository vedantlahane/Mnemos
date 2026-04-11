from fastapi import APIRouter
from app.services import embeddings
from app.db.supabase import db

router = APIRouter()


@router.get("/search")
async def search_notes(q: str, limit: int = 10):
    query_embedding = await embeddings.generate_query(q)
    results = await db.vector_search(
        query_embedding, limit=limit, threshold=0.65
    )
    return {"query": q, "results": results}