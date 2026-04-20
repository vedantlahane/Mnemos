# === FILE: backend/app/services/capture.py ===

"""
Item processing pipeline.
Listens to ITEM_CREATED events.
Extract → Embed → Route → Place on canvas.
"""

from __future__ import annotations
import logging

from app.db.repo import repo
from app.services import search as search_svc
from app.services.placement import find_placement
from app.canvas import canvas_renderer
from app.llm import router as llm_router
from app.core.events import bus, Event, ITEM_CREATED, ITEM_READY, ITEM_PLACED
from app.core.config import settings

logger = logging.getLogger("mnemos.capture")


def register_handlers():
    """Called at startup to wire event handlers."""
    bus.on(ITEM_CREATED, _on_item_created)
    bus.on(ITEM_READY, _on_item_ready)


async def _on_item_created(event: Event):
    """Full processing pipeline triggered by capture."""
    item_id = event.data["item_id"]
    source_text = event.data["source_text"]
    board_hint = event.data.get("board_hint")
    workspace_id = event.data.get("workspace_id")
    owner_id = event.data.get("owner_id")

    try:
        await repo.update_item(item_id, status="processing")

        # 1. Extract structured data via LLM
        processed = await _extract(source_text, owner_id)
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

        # 3. Find related items and create connections
        if emb:
            await _connect(item_id, emb, source_text, owner_id)

        # 4. Route to workspace
        ws_id = await _route(item_id, source_text, processed,
                             board_hint, workspace_id, owner_id)

        await repo.update_item(item_id, status="ready")

        await bus.emit(Event(ITEM_READY, {
            "item_id": item_id,
            "workspace_id": ws_id,
            "owner_id": owner_id,
        }))

    except Exception as e:
        logger.error(f"Processing failed for {item_id}: {e}")
        try:
            await repo.update_item(item_id, status="error")
        except Exception:
            pass


async def _on_item_ready(event: Event):
    """Place item on canvas after processing is done."""
    item_id = event.data["item_id"]
    workspace_id = event.data.get("workspace_id")
    owner_id = event.data.get("owner_id")

    if not workspace_id:
        return

    try:
        item = await repo.get_item(item_id)
        if not item:
            return

        placements = await repo.get_placements(workspace_id)
        objects = await repo.get_canvas_objects(workspace_id)
        stored = await repo.get_canvas(workspace_id)
        user_drawn = canvas_renderer.extract_user_drawn(
            stored["scene"].get("elements", []),
        )

        # Find best related item for near-placement
        near_id = None
        connections = await repo.get_connections_for_item(item_id)
        if connections:
            placed_ids = {p["item_id"] for p in placements}
            for conn in connections:
                other = conn["to_id"] if conn["from_id"] == item_id else conn["from_id"]
                if other in placed_ids:
                    near_id = other
                    break

        # Smart placement — column-aware, gap-detecting
        placement = find_placement(
            placements=placements,
            objects=objects,
            user_elements=user_drawn,
            item_size=(settings.card_w, settings.card_h),
            near_item_id=near_id,
        )

        # Save placement (source of truth for position)
        await repo.upsert_placement(
            workspace_id, item_id,
            placement["x"], placement["y"],
            settings.card_w, settings.card_h,
        )

        # Rebuild scene from source of truth
        items = await repo.get_items_for_workspace(workspace_id, owner_id)
        placements = await repo.get_placements(workspace_id)
        objects = await repo.get_canvas_objects(workspace_id)

        scene = canvas_renderer.build_scene(
            items, placements, objects, user_drawn,
            theme=stored.get("theme", "dark"),
            background=stored.get("background", "#0e0e1a"),
        )

        new_version = stored["version"] + 1
        await repo.save_canvas(workspace_id, scene, new_version)
        await repo.log_op(
            workspace_id, new_version, "card_placed",
            actor="ai", data={"item_id": item_id,
                              "x": placement["x"], "y": placement["y"]},
        )

        # Notify frontend
        from app.services.broadcaster import broadcaster
        await broadcaster.notify(workspace_id, {
            "type": "canvas_updated",
            "version": new_version,
            "op": "card_placed",
            "item_id": item_id,
        })

    except Exception as e:
        logger.error(f"Canvas placement failed for {item_id}: {e}")


async def _extract(text: str, owner_id: str = None):
    try:
        return await llm_router.process_capture(text, user_id=owner_id)
    except Exception:
        from pydantic import BaseModel

        class FallbackCapture(BaseModel):
            title: str
            summary: str
            tags: list[str]
            entities: list[str]
            tasks: list[str]
            content_type: str

        return FallbackCapture(
            title=text[:60], summary=text[:280],
            tags=[], entities=[], tasks=[], content_type="note",
        )


async def _embed(text: str) -> list[float] | None:
    try:
        from app.services.embeddings import generate
        return await generate(text)
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return None


async def _connect(item_id: str, emb: list[float], text: str,
                   owner_id: str = None):
    try:
        related = await repo.vector_search(emb, limit=5, threshold=0.7)
        related = [r for r in related if r["id"] != item_id]
        for rel in related[:3]:
            classification = await llm_router.classify_edge(
                title_a="", content_a=text[:300],
                title_b=rel.get("title", ""),
                content_b=rel.get("source_text", "")[:300],
                user_id=owner_id,
            )
            await repo.create_connection(
                from_id=item_id, to_id=rel["id"],
                rel_type=classification.edge_type,
                label=classification.label,
                score=classification.confidence,
                created_by="system",
            )
    except Exception as e:
        logger.warning(f"Connection creation failed: {e}")


async def _route(item_id: str, text: str, processed,
                 board_hint: str, workspace_id: str,
                 owner_id: str) -> str | None:
    """Route item to a workspace and link it."""
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