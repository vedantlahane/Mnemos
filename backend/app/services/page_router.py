"""Route notes to the correct page using LLM."""

from app.db.supabase import db
from app.llm import router as llm
import logging

logger = logging.getLogger("mnemos.router")


async def route_note(
    text: str, title: str = None, tags: list[str] = None,
    source_url: str = None, page_hint: str = None,
    user_id: str = None,
) -> dict:
    if page_hint:
        page = await db.get_page_by_name(page_hint, user_id=user_id)
        if page:
            return {"page_id": page["id"], "page_name": page["name"],
                    "confidence": 1.0, "reason": "User specified"}
        page = await db.insert_page(name=page_hint, user_id=user_id)
        return {"page_id": page["id"], "page_name": page["name"],
                "confidence": 1.0, "reason": f"Created '{page_hint}'"}

    pages = await db.list_pages(include_archived=False, user_id=user_id)
    non_uncat = [p for p in pages if p["name"] != "Uncategorized"]

    if not non_uncat:
        uncat = await _ensure_uncategorized(user_id)
        return {"page_id": uncat["id"], "page_name": "Uncategorized",
                "confidence": 0.5, "reason": "No pages exist"}

    pages_info_parts = []
    for p in pages:
        notes = await db.get_notes_for_page(p["id"], user_id=user_id)
        sample_titles = [n.get("title", "Untitled") for n in notes[:5]]
        sample_tags: set[str] = set()
        for n in notes[:10]:
            sample_tags.update(n.get("tags") or [])
        pages_info_parts.append(
            f"- {p['name']}: {p.get('description', '')} | "
            f"Notes: {', '.join(sample_titles)} | Tags: {', '.join(list(sample_tags)[:10])}"
        )

    try:
        result = await llm.route_to_page(
            title=title or "Untitled", tags=tags or [],
            content=text, source_url=source_url or "",
            pages_info="\n".join(pages_info_parts), user_id=user_id,
        )
    except Exception as e:
        logger.error(f"Routing LLM failed: {e}")
        uncat = await _ensure_uncategorized(user_id)
        return {"page_id": uncat["id"], "page_name": "Uncategorized",
                "confidence": 0.0, "reason": f"LLM failed: {e}"}

    page_name = result.get("page", "Uncategorized")
    confidence = float(result.get("confidence", 0.0))
    reason = result.get("reason", "")
    threshold = settings.page_route_confidence_threshold

    if page_name.startswith("NEW:"):
        new_name = page_name[4:].strip()
        if new_name and confidence >= threshold:
            page = await db.insert_page(name=new_name, description=reason, user_id=user_id)
            return {"page_id": page["id"], "page_name": new_name,
                    "confidence": confidence, "reason": reason}
        page_name = "Uncategorized"

    if confidence < threshold:
        page_name = "Uncategorized"

    page = await db.get_page_by_name(page_name, user_id=user_id)
    if not page:
        page = await _ensure_uncategorized(user_id)
        page_name = "Uncategorized"

    return {"page_id": page["id"], "page_name": page_name,
            "confidence": confidence, "reason": reason}


async def _ensure_uncategorized(user_id: str = None) -> dict:
    uncat = await db.get_page_by_name("Uncategorized", user_id=user_id)
    if not uncat:
        uncat = await db.insert_page(name="Uncategorized", user_id=user_id)
    return uncat


from app.config import settings