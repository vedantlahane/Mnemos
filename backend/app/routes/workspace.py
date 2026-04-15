# === FILE: backend/app/routes/workspace.py ===
"""Workspace overview and cross-cutting routes."""

from fastapi import APIRouter, Depends
from app.db.supabase import db
from app.services import cache as cache_svc
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/workspace/overview")
async def workspace_overview(user_id: str = Depends(get_optional_user_id)):
    async def _fetch():
        pages = await db.list_pages(user_id=user_id)
        total_notes = await db.count_notes(user_id=user_id)
        tags = await db.get_all_tags_with_counts(user_id=user_id)

        page_summaries = []
        for page in pages[:20]:
            count = await db.count_notes(page_id=page["id"], user_id=user_id)
            page_summaries.append({
                "id": page["id"], "name": page["name"],
                "icon": page.get("icon", "📄"), "color": page.get("color", "#6366f1"),
                "note_count": count, "layout_mode": page.get("layout_mode", "canvas"),
                "is_archived": page.get("is_archived", False),
                "updated_at": page.get("updated_at"),
            })

        return {
            "pages": page_summaries,
            "total_notes": total_notes,
            "total_pages": len(pages),
            "top_tags": tags[:20],
        }

    return await cache_svc.get_overview_cached(fetcher=_fetch)


@router.get("/workspace/stats")
async def workspace_stats(user_id: str = Depends(get_optional_user_id)):
    total_notes = await db.count_notes(user_id=user_id)
    pages = await db.list_pages(user_id=user_id)
    edges = await db.get_all_edges(user_id=user_id)
    stuck = await db.get_stuck_notes()
    cache_info = await cache_svc.cache_stats()

    return {
        "notes": total_notes,
        "pages": len(pages),
        "edges": len(edges),
        "stuck_notes": len(stuck),
        "cache": cache_info,
    }