# === FILE: backend/app/services/processor.py ===

from app.agents.note_processor import note_processor_graph
from app.db.supabase import db
import logging

logger = logging.getLogger("mnemos.processor")


class NoteProcessor:

    async def process_note(
        self, note_id: str, raw_text: str,
        page_hint: str = None, viewport: dict = None
    ):
        try:
            await db.update_note(note_id, processing_status="processing")

            initial_state = {
                "note_id": note_id,
                "raw_text": raw_text,
                "page_hint": page_hint,
                "viewport": viewport,
                "title": None,
                "summary": None,
                "tags": [],
                "tasks": [],
                "entities": [],
                "content_type": "note",
                "embedding": None,
                "related_notes": [],
                "page_id": None,
                "page_name": None,
                "canvas_x": None,
                "canvas_y": None,
                "cluster_id": None,
                "errors": [],
                "status": "extracting",
            }

            result = await note_processor_graph.ainvoke(initial_state)

            if result.get("errors"):
                logger.warning(f"Note {note_id} processed with warnings: {result['errors']}")

        except Exception as e:
            logger.error(f"Processing graph failed for {note_id}: {e}")
            try:
                await db.update_note(note_id, processing_status="failed")
            except Exception:
                pass


processor = NoteProcessor()