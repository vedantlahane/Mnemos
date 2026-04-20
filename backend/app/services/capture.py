# === FILE: backend/app/services/capture.py ===

"""
Item processing pipeline.
Listens to ITEM_CREATED events.
Extract → Embed → Route → Place as TEXT BLOCK on canvas.

Items live in the knowledge layer (search, embeddings, connections).
Canvas objects live in the presentation layer (what you see).
"""

from __future__ import annotations
import asyncio
import logging

from app.db.repo import repo
from app.services.placement import find_placement_for_size
from app.canvas import canvas_renderer
from app.llm import router as llm_router
from app.core.events import bus, Event, ITEM_CREATED
from app.core.config import settings

logger = logging.getLogger("mnemos.capture")


def register_handlers():
    bus.on(ITEM_CREATED, _on_item_created)


async def _on_item_created(event: Event):
    item_id = event.data["item_id"]
    source_text = event.data["source_text"]
    source_title = event.data.get("source_title")
    source_url = event.data.get("source_url")
    board_hint = event.data.get("board_hint")
    workspace_id = event.data.get("workspace_id")
    owner_id = event.data.get("owner_id")

    try:
        # Fetch source context if not in event data
        if not source_title or not source_url:
            item_row = await repo.get_item(item_id)
            if item_row:
                source_title = source_title or item_row.get("source_title")
                source_url = source_url or item_row.get("source_url")

        await repo.update_item(item_id, status="processing")

        # 1. Extract structured metadata (1 LLM call)
        processed = await _extract(
            source_text, owner_id,
            source_title=source_title,
            source_url=source_url,
        )
        await repo.update_item(
            item_id,
            title=processed.title,
            summary=processed.summary,
            tags=processed.tags,
            entities=processed.entities,
            tasks=processed.tasks,
            content_type=processed.content_type,
        )

        # 2. Generate embedding (1 API call)
        emb = await _embed(source_text)
        if emb:
            await repo.upsert_embedding(item_id, emb)

        # 3. Lightweight connections — similarity only, no LLM
        if emb:
            await _connect_lightweight(item_id, emb)

        # 4. Route to workspace (1 LLM call only if no hint/workspace)
        ws_id = await _route(item_id, source_text, processed,
                             board_hint, workspace_id, owner_id)

        await repo.update_item(item_id, status="ready")

        # 5. Place as TEXT BLOCK on canvas (not a card)
        if ws_id:
            await _place_as_text_block(
                item_id=item_id,
                title=processed.title,
                source_text=source_text,
                workspace_id=ws_id,
                owner_id=owner_id,
            )

    except Exception as e:
        logger.error(f"Processing failed for {item_id}: {e}", exc_info=True)
        try:
            await repo.update_item(item_id, status="error")
        except Exception:
            pass


# ══════════════════════════════════════
# Canvas placement — TEXT BLOCK, not card
# ══════════════════════════════════════

async def _place_as_text_block(
    item_id: str,
    title: str,
    source_text: str,
    workspace_id: str,
    owner_id: str,
):
    """
    Create a canvas_object (kind="text") — the same thing
    compose/write-about produces. NOT a note card.
    
    The item stays in the knowledge layer for search.
    The canvas_object is what the user sees on the board.
    """
    from app.canvas.text_measure import measure_text
    from app.services.sync import handle_structural_rebuild
    from app.services.broadcaster import broadcaster

    # Format the captured text for canvas display
    formatted = _format_for_canvas(title, source_text)

    col_w = settings.sheet_width - settings.sheet_margin * 2
    m = measure_text(formatted, font_size=16, font_family=1,
                     max_width=col_w, max_lines=200)
    actual_h = m["height"] + 20

    # Parallel fetch for placement calculation
    placements, objects, stored = await asyncio.gather(
        repo.get_placements(workspace_id),
        repo.get_canvas_objects(workspace_id),
        repo.get_canvas(workspace_id),
    )

    all_items = await repo.get_items_for_workspace(workspace_id)
    managed_ids = canvas_renderer.collect_managed_ids(all_items, objects)
    user_drawn = canvas_renderer.extract_user_drawn(
        stored["scene"].get("elements", []), managed_ids,
    )

    placement = find_placement_for_size(
        placements=placements,
        objects=objects,
        user_elements=user_drawn,
        width=col_w,
        height=actual_h,
    )

    # Create as text block — same as compose does
    await repo.create_canvas_object(
        workspace_id=workspace_id,
        kind="text",
        origin="ai",
        x=placement["x"],
        y=placement["y"],
        w=col_w,
        h=actual_h,
        content=formatted,
        meta={
            "topic": title,
            "item_id": item_id,
            "source": "capture",
        },
    )

    # NO upsert_placement — item has no card, only a text block

    # Rebuild scene
    result = await handle_structural_rebuild(workspace_id, owner_id)

    await repo.log_op(
        workspace_id, result["version"], "text_placed",
        actor="ai", data={"item_id": item_id, "topic": title},
    )

    await broadcaster.notify(workspace_id, {
        "type": "canvas_updated",
        "version": result["version"],
        "op": "text_placed",
        "item_id": item_id,
    })

    logger.info(
        f"Item {item_id} placed as text block at "
        f"({placement['x']}, {placement['y']}) h={actual_h}"
    )


# ══════════════════════════════════════
# Text formatting for canvas
# ══════════════════════════════════════

def _format_for_canvas(title: str, source_text: str) -> str:
    """
    Format captured text into a clean text block for the canvas.
    
    Produces the same style as compose:
    - UPPERCASE title header
    - Clean body text, no markdown
    - Proper paragraph breaks
    """
    from app.services.composition import strip_markdown

    clean = strip_markdown(source_text.strip())
    header = (title or "").strip().upper()

    # Don't duplicate title if text already starts with it
    if header:
        first_line = clean.split("\n")[0].strip().upper()
        if first_line.startswith(header[:20]) or header.startswith(first_line[:20]):
            return clean

    if header:
        return f"{header}\n\n{clean}"

    return clean


# ══════════════════════════════════════
# Pipeline stages
# ══════════════════════════════════════

async def _extract(text: str, owner_id: str = None,
                   source_title: str = None, source_url: str = None):
    try:
        return await llm_router.process_capture(
            text, user_id=owner_id,
            source_title=source_title,
            source_url=source_url,
        )
    except Exception:
        from pydantic import BaseModel

        class FallbackCapture(BaseModel):
            title: str
            summary: str
            tags: list[str]
            entities: list[str]
            tasks: list[str]
            content_type: str

        fallback_title = source_title or text[:60]
        return FallbackCapture(
            title=fallback_title, summary=text[:280],
            tags=[], entities=[], tasks=[], content_type="note",
        )


async def _embed(text: str) -> list[float] | None:
    try:
        from app.services.embeddings import generate
        return await generate(text)
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return None


async def _connect_lightweight(item_id: str, emb: list[float]) -> str | None:
    """
    Connections using vector similarity only — zero LLM calls.
    Edge classification can run later as background enrichment.
    """
    best_near = None
    try:
        related = await repo.vector_search(emb, limit=5, threshold=0.7)
        related = [r for r in related if r["id"] != item_id]

        for i, rel in enumerate(related[:3]):
            sim = rel.get("similarity", 0.7)
            await repo.create_connection(
                from_id=item_id, to_id=rel["id"],
                rel_type="related",
                label=None,
                score=sim,
                created_by="system",
            )
            if i == 0:
                best_near = rel["id"]

    except Exception as e:
        logger.warning(f"Lightweight connection failed: {e}")

    return best_near


async def _route(item_id: str, text: str, processed,
                 board_hint: str, workspace_id: str,
                 owner_id: str) -> str | None:
    try:
        from app.services.workspace_router import route_item
        ws_id = await route_item(
            text=text, title=processed.title,
            tags=processed.tags, board_hint=board_hint,
            current_workspace_id=workspace_id,
            owner_id=owner_id,
        )
        if ws_id:
            await repo.link_item_to_workspace(ws_id, item_id, added_by="system")
            return ws_id
    except Exception as e:
        logger.warning(f"Routing failed: {e}")

    try:
        inbox = await repo.get_workspace_by_slug("inbox", owner_id=owner_id)
        if inbox:
            await repo.link_item_to_workspace(inbox["id"], item_id, added_by="system")
            return inbox["id"]
    except Exception:
        pass
    return None