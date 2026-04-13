from app.agents.note_processor import note_processor_graph
from app.db.supabase import db


class NoteProcessor:

    async def process_note(
        self, note_id: str, raw_text: str, page_hint: str = None
    ):
        try:
            await db.update_note(note_id, processing_status="processing")

            initial_state = {
                "note_id": note_id,
                "raw_text": raw_text,
                "page_hint": page_hint,
                "title": None,
                "summary": None,
                "tags": [],
                "tasks": [],
                "entities": [],
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

            # Run the LangGraph agent
            result = await note_processor_graph.ainvoke(initial_state)

            if result.get("errors"):
                print(f"Note {note_id} processed with warnings: {result['errors']}")

        except Exception as e:
            print(f"Processing graph failed for {note_id}: {e}")
            try:
                await db.update_note(note_id, processing_status="failed")
            except Exception:
                pass


processor = NoteProcessor()