# === FILE: backend/app/routes/search.py ===

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from app.db.supabase import db
from app.services import embeddings
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/search")
async def search_notes(
    q: str, page_id: Optional[str] = None, limit: int = 10,
    threshold: float = 0.55, user_id: str = Depends(get_optional_user_id),
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    try:
        emb = await embeddings.generate_query(q.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")

    if page_id:
        results = await db.vector_search_in_page(emb, page_id, limit=limit, threshold=threshold)
    else:
        results = await db.vector_search(emb, limit=limit, threshold=threshold)

    if user_id:
        results = [r for r in results if r.get("user_id") == user_id]

    return {"results": results, "count": len(results), "query": q}


@router.get("/search/tags")
async def search_by_tags(tags: str, user_id: str = Depends(get_optional_user_id)):
    """Search notes by comma-separated tags."""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if not tag_list:
        raise HTTPException(status_code=400, detail="Tags required")

    # Search for first tag, then filter
    results = await db.list_notes(page=1, limit=50, tag=tag_list[0], user_id=user_id)
    notes = results.get("notes", [])

    if len(tag_list) > 1:
        notes = [
            n for n in notes
            if all(t in (n.get("tags") or []) for t in tag_list)
        ]

    return {"results": notes, "count": len(notes), "tags": tag_list}