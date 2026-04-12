from fastapi import APIRouter
from app.models.schemas import ContextRequest
from app.services import embeddings
from app.db.supabase import db

router = APIRouter()

CONTEXT_CONFIG = {
    "similarity_threshold": 0.75,
    "max_results": 3,
    "min_text_length": 200,
    "excluded_domains": [
        "google.com",
        "google.com/search",
        "mail.google.com",
        "github.com/search",
        "localhost",
        "chrome://",
    ],
}


@router.post("/context")
async def check_context(payload: ContextRequest):
    for domain in CONTEXT_CONFIG["excluded_domains"]:
        if domain in payload.url:
            return {"related_notes": []}

    if len(payload.text) < CONTEXT_CONFIG["min_text_length"]:
        return {"related_notes": []}

    page_embedding = await embeddings.generate_query(payload.text[:1000])

    related = await db.vector_search(
        page_embedding,
        limit=CONTEXT_CONFIG["max_results"],
        threshold=CONTEXT_CONFIG["similarity_threshold"],
    )

    # Enrich with page info
    enriched = []
    for note in related:
        page_name = None
        page_id = note.get("page_id")
        if not page_id:
            # Fetch full note to get page_id (vector search may not return it)
            try:
                full_note = await db.get_note(note["id"])
                page_id = full_note.get("page_id") if full_note else None
            except Exception:
                pass

        if page_id:
            try:
                page = await db.get_page(page_id)
                if page:
                    page_name = page["name"]
            except Exception:
                pass

        enriched.append({
            **note,
            "page_id": page_id,
            "page_name": page_name,
        })

    return {"related_notes": enriched}