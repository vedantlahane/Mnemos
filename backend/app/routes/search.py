from fastapi import APIRouter, Depends
from typing import Optional
from app.services import embeddings
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/search")
async def search_notes(
    q: str,
    limit: int = 10,
    page_id: Optional[str] = None,
    user_id: str = Depends(get_optional_user_id),
):
    query_embedding = await embeddings.generate_query(q)

    if page_id:
        page = await db.get_page(page_id, user_id=user_id)
        if not page:
            return {"query": q, "results": []}
        results = await db.vector_search_in_page(
            query_embedding, page_id, limit=limit, threshold=0.65
        )
    else:
        results = await db.vector_search(
            query_embedding, limit=limit, threshold=0.65
        )

    if user_id:
        results = [r for r in results if r.get("user_id") == user_id]

    return {"query": q, "results": results}


@router.post("/search/canvas")
async def search_canvas(payload: dict, user_id: str = Depends(get_optional_user_id)):
    """Text search within canvas elements for a page."""
    page_id = payload.get("page_id")
    query = payload.get("query", "").lower()

    if not page_id or not query:
        return {"results": []}

    # Search notes
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        return {"results": []}

    notes_result = await db.list_notes(page=1, limit=200, page_id=page_id, user_id=user_id)
    matching_notes = []
    for note in notes_result.get("notes", []):
        title = (note.get("title") or "").lower()
        raw = (note.get("raw_text") or "").lower()
        summary = (note.get("summary") or "").lower()
        tags = " ".join(note.get("tags") or []).lower()
        if query in title or query in raw or query in summary or query in tags:
            matching_notes.append({
                "type": "note",
                "id": note["id"],
                "title": note.get("title"),
                "canvas_x": note.get("canvas_x"),
                "canvas_y": note.get("canvas_y"),
            })

    # Search canvas elements
    elements = await db.list_elements(page_id)
    matching_elements = []
    for el in elements:
        content = (el.get("content") or "").lower()
        if query in content:
            matching_elements.append({
                "type": "element",
                "id": el["id"],
                "element_type": el["element_type"],
                "content": el.get("content"),
                "position_x": el.get("position_x"),
                "position_y": el.get("position_y"),
            })

    return {"results": matching_notes + matching_elements}