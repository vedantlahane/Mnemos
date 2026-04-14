# === FILE: backend/app/routes/search.py ===

from fastapi import APIRouter, Depends
from typing import Optional
from app.services import embeddings
from app.services.canvas_text_search import find_canvas_text_matches
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/search")
async def search_notes(
    q: str, limit: int = 10, page_id: Optional[str] = None,
    user_id: str = Depends(get_optional_user_id),
):
    query_embedding = await embeddings.generate_query(q)
    if page_id:
        page = await db.get_page(page_id, user_id=user_id)
        if not page:
            return {"query": q, "results": []}
        results = await db.vector_search_in_page(query_embedding, page_id, limit=limit, threshold=0.65)
    else:
        results = await db.vector_search(query_embedding, limit=limit, threshold=0.65)
    if user_id:
        results = [r for r in results if r.get("user_id") == user_id]
    return {"query": q, "results": results}


@router.post("/search/canvas")
async def search_canvas(payload: dict, user_id: str = Depends(get_optional_user_id)):
    page_id = payload.get("page_id")
    query = payload.get("query", "").lower()
    if not page_id or not query:
        return {"results": []}

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
                "type": "note", "id": note["id"], "title": note.get("title"),
                "canvas_x": note.get("canvas_x"), "canvas_y": note.get("canvas_y"),
            })

    elements = await db.list_elements(page_id)
    canvas_text_matches = find_canvas_text_matches(query, page.get("canvas_data") or {}, limit=10)

    seen_element_ids = set()
    matching_elements = []
    for el in elements:
        content = (el.get("content") or "").lower()
        if query in content:
            seen_element_ids.add(el["id"])
            matching_elements.append({
                "type": "element", "id": el["id"], "element_type": el["element_type"],
                "content": el.get("content"),
                "position_x": el.get("position_x"), "position_y": el.get("position_y"),
            })

    for match in canvas_text_matches:
        if match["id"] in seen_element_ids:
            continue
        matching_elements.append({
            "type": "element",
            "id": match["id"],
            "element_type": "text",
            "content": match.get("snippet"),
            "position_x": match.get("x"),
            "position_y": match.get("y"),
        })

    return {"results": matching_notes + matching_elements}