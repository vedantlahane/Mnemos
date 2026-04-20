# === FILE: backend/app/routes/extension.py ===

"""
Endpoints consumed by the Chrome extension.
All AI-automated: capture → extract → embed → route → place as text block.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.auth.dependencies import get_optional_user_id
from app.db.repo import repo
from app.services import search as search_svc
from app.core.events import bus, Event, ITEM_CREATED
import logging

logger = logging.getLogger("mnemos.extension")

router = APIRouter()


class CaptureRequest(BaseModel):
    text: str
    source_url: str = ""
    source_title: str = ""
    page_title: str = ""
    capture_type: str = "manual"
    page_hint: Optional[str] = None
    custom_command: Optional[str] = None


class ContextRequest(BaseModel):
    url: str
    text: str = ""


@router.post("/capture")
async def capture(payload: CaptureRequest,
                  user_id: str = Depends(get_optional_user_id)):
    source_text = payload.text.strip()
    if payload.custom_command:
        source_text = f"{payload.custom_command}\n\n{source_text}"

    resolved_title = payload.source_title or payload.page_title or None

    item = await repo.create_item(
        source_text=source_text,
        source_url=payload.source_url or None,
        source_title=resolved_title,
        source_type="extension",
        owner_id=user_id,
        status="pending",
    )

    # Pass ALL source context in the event — avoids re-fetching in capture.py
    await bus.emit(Event(ITEM_CREATED, {
        "item_id": item["id"],
        "source_text": source_text,
        "source_title": resolved_title,
        "source_url": payload.source_url or None,
        "board_hint": payload.page_hint,
        "workspace_id": None,  # AI decides
        "owner_id": user_id,
    }))

    return {"success": True, "note_id": item["id"]}


@router.post("/context")
async def check_context(payload: ContextRequest,
                        user_id: str = Depends(get_optional_user_id)):
    query = payload.text[:1000] if payload.text else payload.url
    if not query or not query.strip():
        return {"related_notes": []}

    try:
        results = await search_svc.semantic_search(
            query=query, owner_id=user_id,
            limit=5, threshold=0.55,
        )

        related = []
        for r in results:
            workspaces = await repo.get_workspaces_for_item(r["id"])
            page_name = workspaces[0]["display_name"] if workspaces else "Inbox"

            related.append({
                "id": r["id"],
                "title": r.get("title") or "Untitled",
                "summary": r.get("summary") or "",
                "page_name": page_name,
                "similarity": r.get("similarity", 0),
            })

        return {"related_notes": related}
    except Exception as e:
        logger.warning(f"Context check failed: {e}")
        return {"related_notes": []}


@router.get("/pages")
async def list_pages(user_id: str = Depends(get_optional_user_id)):
    workspaces = await repo.list_workspaces(owner_id=user_id)
    pages = []
    for ws in workspaces:
        items = await repo.get_items_for_workspace(ws["id"], user_id)
        pages.append({
            "id": ws["id"],
            "name": ws["display_name"],
            "icon": ws.get("icon", "📄"),
            "note_count": len(items),
        })
    return {"pages": pages}


@router.get("/notes")
async def list_notes(page: int = 1, limit: int = 20,
                     user_id: str = Depends(get_optional_user_id)):
    result = await repo.list_items(owner_id=user_id, page=page, limit=limit)
    notes = [
        {
            "id": i["id"],
            "title": i.get("title") or "Untitled",
            "summary": i.get("summary") or "",
            "tags": i.get("tags", []),
            "status": i.get("status"),
            "created_at": i.get("created_at"),
        }
        for i in result["items"]
    ]
    return {"notes": notes, "total": result["total"]}