# === FILE: backend/app/routes/workspace.py ===

from fastapi import APIRouter, Depends
from app.db.supabase import db
from app.services import cache as cache_svc
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/workspace/overview")
async def workspace_overview(user_id: str = Depends(get_optional_user_id)):
    async def _fetch():
        stats = await db.get_global_stats(user_id=user_id)
        pages = await db.list_pages(include_archived=False, user_id=user_id)
        recent_notes_result = await db.list_notes(page=1, limit=5, user_id=user_id)
        tags = await db.get_all_tags_with_counts(user_id=user_id)
        return {
            "stats": stats,
            "pages": pages[:20],
            "recent_notes": recent_notes_result.get("notes", []),
            "top_tags": tags[:15],
        }

    # Try cache first
    result = await cache_svc.get_overview_cached(_fetch)
    if result:
        return result
    return await _fetch()


@router.get("/workspace/export")
async def export_workspace(user_id: str = Depends(get_optional_user_id)):
    pages = await db.list_pages(include_archived=True, user_id=user_id)
    all_notes_result = await db.list_notes(page=1, limit=10000, user_id=user_id)
    edges = await db.get_all_edges(user_id=user_id)
    tags = await db.get_all_tags_with_counts(user_id=user_id)
    return {
        "pages": pages,
        "notes": all_notes_result.get("notes", []),
        "edges": edges,
        "tags": tags,
        "exported_at": __import__("datetime").datetime.utcnow().isoformat(),
    }