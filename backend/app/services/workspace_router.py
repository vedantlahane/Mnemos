# === FILE: backend/app/services/workspace_router.py ===

"""Route items to workspaces using LLM.

OPTIMIZED: Removed N+1 per-workspace item fetch.
Uses workspace names + descriptions only for routing.
"""

from app.db.repo import repo
from app.llm import router as llm_router
from app.core.config import settings
import logging

logger = logging.getLogger("mnemos.ws_router")


async def route_item(
    text: str,
    title: str = None,
    tags: list[str] = None,
    board_hint: str = None,
    current_workspace_id: str = None,
    owner_id: str = None,
) -> str | None:
    """Returns workspace_id to place the item in."""

    # Explicit hint wins — no LLM needed
    if board_hint:
        ws = await repo.get_workspace_by_slug(
            board_hint.lower().replace(" ", "-"), owner_id=owner_id,
        )
        if ws:
            return ws["id"]
        ws = await repo.create_workspace(
            slug=board_hint.lower().replace(" ", "-"),
            display_name=board_hint,
            owner_id=owner_id,
        )
        return ws["id"]

    # If user is viewing a workspace, default there — no LLM needed
    if current_workspace_id:
        return current_workspace_id

    # LLM routing — only when we genuinely don't know where to put it
    workspaces = await repo.list_workspaces(owner_id=owner_id)
    non_inbox = [w for w in workspaces if w["slug"] != "inbox"]

    if not non_inbox:
        inbox = await _ensure_inbox(owner_id)
        return inbox["id"]

    # ── FIX: Build context from workspace metadata ONLY ──
    # Old code fetched items for EVERY workspace (N+1 queries).
    # Workspace name + description is enough for routing.
    ws_info_parts = []
    for w in workspaces:
        desc = w.get("description", "") or ""
        ws_info_parts.append(
            f"- {w['display_name']}: {desc}"
        )

    try:
        result = await llm_router.route_to_page(
            title=title or "Untitled",
            tags=tags or [],
            content=text[:500],  # Cap content sent to LLM
            source_url="",
            pages_info="\n".join(ws_info_parts),
            user_id=owner_id,
        )
    except Exception as e:
        logger.error(f"Routing LLM failed: {e}")
        inbox = await _ensure_inbox(owner_id)
        return inbox["id"]

    ws_name = result.get("page", "Inbox")
    confidence = float(result.get("confidence", 0.0))

    if ws_name.startswith("NEW:"):
        new_name = ws_name[4:].strip()
        if new_name and confidence >= settings.route_confidence:
            ws = await repo.create_workspace(
                slug=new_name.lower().replace(" ", "-"),
                display_name=new_name,
                description=result.get("reason", ""),
                owner_id=owner_id,
            )
            return ws["id"]
        ws_name = "Inbox"

    if confidence < settings.route_confidence:
        ws_name = "Inbox"

    ws = await repo.get_workspace_by_slug(
        ws_name.lower().replace(" ", "-"), owner_id=owner_id,
    )
    if not ws:
        ws = await _ensure_inbox(owner_id)

    return ws["id"]


async def _ensure_inbox(owner_id: str = None) -> dict:
    inbox = await repo.get_workspace_by_slug("inbox", owner_id=owner_id)
    if not inbox:
        inbox = await repo.create_workspace(
            slug="inbox", display_name="Inbox",
            owner_id=owner_id,
        )
    return inbox