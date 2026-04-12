from app.db.supabase import db
from app.services import llm


async def route_note(
    text: str,
    title: str = None,
    tags: list[str] = None,
    source_url: str = None,
    page_hint: str = None,
) -> dict:
    """
    Decides which page a note belongs to.
    Returns: {"page_id": str, "page_name": str, "confidence": float, "reason": str}
    """

    # If user specified a page, use it
    if page_hint:
        page = await db.get_page_by_name(page_hint)
        if page:
            return {
                "page_id": page["id"],
                "page_name": page["name"],
                "confidence": 1.0,
                "reason": "User specified page",
            }
        # User typed a page that doesn't exist — create it
        page = await db.insert_page(name=page_hint)
        return {
            "page_id": page["id"],
            "page_name": page["name"],
            "confidence": 1.0,
            "reason": f"Created new page '{page_hint}' per user request",
        }

    # Fetch all pages with context
    pages = await db.list_pages(include_archived=False)

    # If only Uncategorized exists, route there
    non_uncat = [p for p in pages if p["name"] != "Uncategorized"]
    if not non_uncat:
        uncat = await db.get_page_by_name("Uncategorized")
        return {
            "page_id": uncat["id"],
            "page_name": "Uncategorized",
            "confidence": 0.5,
            "reason": "No topic pages exist yet",
        }

    # Build pages info for LLM
    pages_info_parts = []
    for p in pages:
        notes = await db.get_notes_for_page(p["id"])
        sample_titles = [n.get("title", "Untitled") for n in notes[:5]]
        sample_tags = set()
        for n in notes[:10]:
            sample_tags.update(n.get("tags") or [])
        pages_info_parts.append(
            f"- {p['name']}: {p.get('description', 'No description')} | "
            f"Sample notes: {', '.join(sample_titles)} | "
            f"Tags: {', '.join(list(sample_tags)[:10])}"
        )
    pages_info = "\n".join(pages_info_parts)

    # Ask LLM
    try:
        result = await llm.route_to_page(
            title=title or "Untitled",
            tags=tags or [],
            content=text,
            source_url=source_url or "",
            pages_info=pages_info,
        )
    except Exception as e:
        print(f"Page routing LLM error: {e}")
        uncat = await db.get_page_by_name("Uncategorized")
        return {
            "page_id": uncat["id"],
            "page_name": "Uncategorized",
            "confidence": 0.0,
            "reason": f"Routing failed: {e}",
        }

    page_name = result.get("page", "Uncategorized")
    confidence = result.get("confidence", 0.0)
    reason = result.get("reason", "")

    # Handle NEW:name
    if page_name.startswith("NEW:"):
        new_name = page_name[4:].strip()
        if new_name and confidence >= 0.75:
            page = await db.insert_page(name=new_name, description=reason)
            return {
                "page_id": page["id"],
                "page_name": new_name,
                "confidence": confidence,
                "reason": reason,
            }
        # Not confident enough for new page
        page_name = "Uncategorized"

    # Low confidence → Uncategorized
    if confidence < 0.75:
        page_name = "Uncategorized"

    # Find the page
    page = await db.get_page_by_name(page_name)
    if not page:
        page = await db.get_page_by_name("Uncategorized")
        page_name = "Uncategorized"

    return {
        "page_id": page["id"],
        "page_name": page_name,
        "confidence": confidence,
        "reason": reason,
    }