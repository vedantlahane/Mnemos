# === FILE: backend/app/services/capture.py ===

"""
Item processing pipeline.
Listens to ITEM_CREATED events.
Extract → Embed → Route → Place on canvas.

OPTIMIZED: Edge classification deferred, data passed through pipeline.
"""

from __future__ import annotations
import asyncio
import logging

from app.db.repo import repo
from app.services.placement import find_placement
from app.canvas import canvas_renderer
from app.llm import router as llm_router
from app.core.events import bus, Event, ITEM_CREATED, ITEM_READY, ITEM_PLACED
from app.core.config import settings

logger = logging.getLogger("mnemos.capture")


def register_handlers():
    bus.on(ITEM_CREATED, _on_item_created)
    bus.on(ITEM_READY, _on_item_ready)


async def _on_item_created(event: Event):
    item_id = event.data["item_id"]
    source_text = event.data["source_text"]
    board_hint = event.data.get("board_hint")
    workspace_id = event.data.get("workspace_id")
    owner_id = event.data.get("owner_id")

    try:
        # Single fetch for source context — reuse throughout pipeline
        item_row = await repo.get_item(item_id)
        source_title = item_row.get("source_title") if item_row else None
        source_url = item_row.get("source_url") if item_row else None

        await repo.update_item(item_id, status="processing")

        # 1. Extract structured data (with source context for better titles)
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

        # 2. Generate embedding
        emb = await _embed(source_text)
        if emb:
            await repo.upsert_embedding(item_id, emb)

        # 3. Lightweight connections — similarity score only, NO LLM calls
        #    Edge classification runs later as background enrichment
        near_id = None
        if emb:
            near_id = await _connect_lightweight(item_id, emb)

        # 4. Route to workspace (optimized — avoids N+1 queries)
        ws_id = await _route(item_id, source_text, processed,
                             board_hint, workspace_id, owner_id)

        await repo.update_item(item_id, status="ready")

        await bus.emit(Event(ITEM_READY, {
            "item_id": item_id,
            "workspace_id": ws_id,
            "owner_id": owner_id,
            "near_item_id": near_id,  # pass through to avoid re-fetching
        }))

    except Exception as e:
        logger.error(f"Processing failed for {item_id}: {e}", exc_info=True)
        try:
            await repo.update_item(item_id, status="error")
        except Exception:
            pass


async def _on_item_ready(event: Event):
    item_id = event.data["item_id"]
    workspace_id = event.data.get("workspace_id")
    owner_id = event.data.get("owner_id")
    near_id = event.data.get("near_item_id")

    if not workspace_id:
        logger.warning(f"Item {item_id} ready but no workspace_id — skipping placement")
        return

    try:
        # Parallel fetch — all four queries at once
        item_fut = repo.get_item(item_id)
        placements_fut = repo.get_placements(workspace_id)
        objects_fut = repo.get_canvas_objects(workspace_id)
        stored_fut = repo.get_canvas(workspace_id)

        item, placements, objects, stored = await asyncio.gather(
            item_fut, placements_fut, objects_fut, stored_fut,
        )

        if not item:
            logger.warning(f"Item {item_id} not found for placement")
            return

        all_items = await repo.get_items_for_workspace(workspace_id)
        managed_ids = canvas_renderer.collect_managed_ids(all_items, objects)
        user_drawn = canvas_renderer.extract_user_drawn(
            stored["scene"].get("elements", []), managed_ids,
        )

        # Measure actual card height
        from app.canvas.text_measure import measure_text

        col_w = settings.sheet_width - settings.sheet_margin * 2
        title = item.get("title") or "Untitled"
        summary = item.get("summary") or item.get("source_text", "")[:500]

        title_m = measure_text(title, 20, 1, col_w, 2)
        summary_m = measure_text(summary, 14, 1, col_w, 20)
        actual_h = title_m["height"] + 12 + summary_m["height"] + 30

        # Use near_id from pipeline (avoids extra DB fetch for connections)
        placement = find_placement(
            placements=placements,
            objects=objects,
            user_elements=user_drawn,
            item_size=(col_w, actual_h),
            near_item_id=near_id,
        )

        await repo.upsert_placement(
            workspace_id, item_id,
            placement["x"], placement["y"],
            col_w, actual_h,
        )

        from app.services.sync import handle_structural_rebuild
        result = await handle_structural_rebuild(workspace_id, owner_id)

        await repo.log_op(
            workspace_id, result["version"], "card_placed",
            actor="ai", data={"item_id": item_id},
        )

        from app.services.broadcaster import broadcaster
        await broadcaster.notify(workspace_id, {
            "type": "canvas_updated",
            "version": result["version"],
            "op": "card_placed",
            "item_id": item_id,
        })

        logger.info(f"Item {item_id} placed at ({placement['x']}, {placement['y']}) h={actual_h}")

    except Exception as e:
        logger.error(f"Canvas placement failed for {item_id}: {e}", exc_info=True)


# ══════════════════════════════════════
# Pipeline stages
# ══════════════════════════════════════

async def _extract(text: str, owner_id: str = None,
                   source_title: str = None, source_url: str = None):
    """Extract structured data — passes source context for better titles."""
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

        # Use source_title as fallback instead of raw text slice
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
    Create connections using ONLY vector similarity — no LLM calls.
    Returns the closest related item ID (for near-placement).

    Edge classification is deferred to background enrichment.
    """
    best_near = None
    try:
        related = await repo.vector_search(emb, limit=5, threshold=0.7)
        related = [r for r in related if r["id"] != item_id]

        for i, rel in enumerate(related[:3]):
            sim = rel.get("similarity", 0.7)
            await repo.create_connection(
                from_id=item_id, to_id=rel["id"],
                rel_type="related",          # default — classified later
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

    # Fallback to inbox
    try:
        inbox = await repo.get_workspace_by_slug("inbox", owner_id=owner_id)
        if inbox:
            await repo.link_item_to_workspace(inbox["id"], item_id, added_by="system")
            return inbox["id"]
    except Exception:
        pass
    return None