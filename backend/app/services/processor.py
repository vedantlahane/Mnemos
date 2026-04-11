from app.services import llm, embeddings
from app.db.supabase import db


class NoteProcessor:

    async def process_note(self, note_id: str, raw_text: str):
        try:
            await db.update_note(note_id, processing_status="processing")

            # Step 1: LLM processing
            title = raw_text[:50] + "..."
            summary = None
            tags = []
            tasks = []
            entities = []

            try:
                processed = await llm.process_capture(raw_text)
                title = processed.title
                summary = processed.summary
                tags = processed.tags
                tasks = processed.tasks
                entities = processed.entities
            except Exception as e:
                print(f"LLM processing failed for {note_id}: {e}")
                summary = "Processing failed — raw text preserved"

            await db.update_note(
                note_id,
                title=title,
                summary=summary,
                tags=tags,
                tasks=tasks,
                entities=entities,
            )

            # Step 2: Embedding
            embedding = None
            try:
                raw_embedding = await embeddings.generate(raw_text)
                embedding = list(raw_embedding)  # Force plain Python list
                print(f"Embedding generated for {note_id}: {len(embedding)} dimensions")
                await db.update_note(note_id, embedding=embedding)
                print(f"Embedding saved for {note_id}")
            except Exception as e:
                print(f"EMBEDDING ERROR for {note_id}: {type(e).__name__}: {e}")

            # Step 3: Find related notes
            if embedding:
                try:
                    related = await db.vector_search(
                        embedding, limit=5, threshold=0.7
                    )
                    related_ids = [
                        r["id"] for r in related if r["id"] != note_id
                    ]
                    await db.update_note(
                        note_id, related_note_ids=related_ids
                    )
                except Exception as e:
                    print(f"Relation search failed for {note_id}: {e}")

            await db.update_note(note_id, processing_status="done")

        except Exception as e:
            print(f"Processing completely failed for {note_id}: {e}")
            await db.update_note(note_id, processing_status="failed")


processor = NoteProcessor()