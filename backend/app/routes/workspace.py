from fastapi import APIRouter, HTTPException, Depends, Query
from app.db.supabase import db
from app.services import embeddings
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/search")
async def semantic_search(
    q: str = Query(..., min_length=1, max_length=1000),
    limit: int = Query(10, ge=1, le=50),
    threshold: float = Query(0.55, ge=0.0, le=1.0),
    page_id: str = None,
    user_id: str = Depends(get_optional_user_id),
):
    try:
        query_emb = await embeddings.generate_query(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")

    if page_id:
        results = await db.vector_search_in_page(
            query_emb, page_id, limit=limit, threshold=threshold,
        )
    else:
        results = await db.vector_search(
            query_emb, limit=limit, threshold=threshold,
        )

    if user_id:
        results = [r for r in results if r.get("user_id") == user_id]

    return {
        "query": q,
        "results": results,
        "count": len(results),
    }


@router.get("/search/tags")
async def search_by_tag(
    tag: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_optional_user_id),
):
    result = await db.list_notes(page=page, limit=limit, tag=tag, user_id=user_id)
    return {
        "tag": tag,
        "notes": result["notes"],
        "total": result["total"],
    }