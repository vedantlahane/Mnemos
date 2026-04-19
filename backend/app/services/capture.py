"""
Capture pipeline — processes a note end-to-end.
Extract → Embed → Route → Place on canvas.
"""

from __future__ import annotations
import logging

from app.db.supabase import db
from app.services import embeddings
from app.services.placement import find_placement
from app.services import operations as ops_svc
from app.excalidraw.scene import normalize_scene
from app.excalidraw import scene_manager
from app.llm import router as llm

logger = logging.getLogger("mnemos.capture")


async def process_note(
    note_id: str,
    raw_text: str,
    page_hint: str = None,
    viewport: dict = None,
):
    """Full note processing pipeline."""
    try:
        await db.update_note(note_id, processing_status="processing")

        # 1. Extract structured data
        processed = await _extract(raw_text)
        await db.update_note(
            note_id,
            title=processed.title,
            summary=processed.summary,
            tags=processed.tags,
            tasks=processed.tasks,
            entities=processed.entities,
            content_type=processed.content_type,
        )

        # 2. Generate embedding
        emb = None
        try:
            emb = await embeddings.generate(raw_text)
            await db.upsert_embedding(note_id, emb)
        except Exception as e:
            logger.warning(f"Embedding failed for {note_id[:8]}: {e}")

        # 3. Find related notes & create edges
        if emb:
            try:
                related = await db.vector_search(emb, limit=5, threshold=0.7)
                related = [r for r in related if r["id"] != note_id]
                for rel in related[:3]:
                    await _create_edge(note_id, rel, raw_text)
            except Exception as e:
                logger.warning(f"Edge creation failed: {e}")

        # 4. Route to page
        page_id = await _route(note_id, raw_text, processed, page_hint)

        # 5. Place on canvas
        if page_id:
            await _place_on_canvas(note_id, page_id, viewport)

        await db.update_note(note_id, processing_status="done")

    except Exception as e:
        logger.error(f"Processing failed for {note_id}: {e}")
        try:
            await db.update_note(note_id, processing_status="failed")
        except Exception:
            pass


async def _extract(raw_text: str):
    try:
        return await llm.process_capture(raw_text)
    except Exception:
        from app.models.schemas import ProcessedCapture
        return ProcessedCapture(
            title=raw_text[:60], summary=raw_text[:280],
            tags=[], tasks=[], entities=[], content_type="note",
        )


async def _route(note_id: str, raw_text: str, processed, page_hint: str) -> str | None:
    try:
        from app.services.page_router import route_note
        routing = await route_note(
            text=raw_text, title=processed.title,
            tags=processed.tags, page_hint=page_hint,
        )
        page_id = routing["page_id"]
        await db.update_note(note_id, page_id=page_id)
        return page_id
    except Exception as e:
        logger.warning(f"Routing failed: {e}")
        try:
            uncat = await db.get_page_by_name("Uncategorized")
            if uncat:
                await db.update_note(note_id, page_id=uncat["id"])
                return uncat["id"]
        except Exception:
            pass
    return None


async def _create_edge(note_id: str, related: dict, raw_text: str):
    try:
        classification = await llm.classify_edge(
            title_a="", content_a=raw_text[:300],
            title_b=related.get("title", ""), content_b=related.get("raw_text", "")[:300],
        )
        await db.insert_edge_if_not_exists(
            source_id=note_id, target_id=related["id"],
            edge_type=classification.edge_type,
            label=classification.label,
            strength=classification.confidence,
            created_by="processor",
        )
    except Exception:
        await db.insert_edge_if_not_exists(
            source_id=note_id, target_id=related["id"],
            edge_type="related",
            strength=related.get("similarity", 0.0),
            created_by="processor",
        )


async def _place_on_canvas(note_id: str, page_id: str, viewport: dict = None):
    note = await db.get_note(note_id)
    if not note:
        return

    stored = await db.get_scene(page_id)
    scene = normalize_scene(stored["scene"])
    current_version = stored["version"]

    placement = await find_placement(
        page_id, scene, note=note,
        viewport=viewport, strategy="auto",
    )

    scene, element_ids = scene_manager.upsert_note_card(
        scene, note, placement.x, placement.y,
    )

    new_version = current_version + 1
    await db.save_scene(page_id, scene, new_version)

    # Update note with canvas position and element IDs
    await db.update_note(
        note_id,
        canvas_x=placement.x,
        canvas_y=placement.y,
        element_ids=element_ids,
    )

    await ops_svc.log_and_notify(
        page_id, new_version, "add_note_card",
        actor="ai", element_ids=element_ids,
        payload={"note_id": note_id, "x": placement.x, "y": placement.y},
    )