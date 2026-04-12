from app.db.supabase import db
from app.services import llm, embeddings
from app.services.page_router import route_note


class NoteProcessor:

    async def process_note(self, note_id: str, raw_text: str, page_hint: str = None):
        try:
            await db.update_note(note_id, processing_status="processing")

            title = None
            summary = None
            tags = []
            tasks = []
            entities = []

            # ── Step 1: LLM summarize + tag + extract (EXISTING) ──
            try:
                processed = await llm.process_capture(raw_text)
                title = processed.title
                summary = processed.summary
                tags = processed.tags
                tasks = processed.tasks
                entities = processed.entities
            except Exception as e:
                print(f"LLM processing failed for {note_id}: {e}")
                title = raw_text[:50] + "..."
                summary = "Processing failed — raw text preserved"

            await db.update_note(
                note_id,
                title=title,
                summary=summary,
                tags=tags,
                tasks=tasks,
                entities=entities,
            )

            # ── Step 2: Generate embedding (EXISTING) ──
            embedding = None
            try:
                embedding = await embeddings.generate(raw_text)
                await db.update_note(note_id, embedding=embedding)
            except Exception as e:
                print(f"Embedding failed for {note_id}: {e}")

            # ── Step 3: Vector search → find related (EXISTING) ──
            related_ids = []
            related_notes = []
            if embedding:
                try:
                    related = await db.vector_search(embedding, limit=5, threshold=0.7)
                    related_notes = [r for r in related if r["id"] != note_id]
                    related_ids = [r["id"] for r in related_notes]
                    await db.update_note(note_id, related_note_ids=related_ids)
                except Exception as e:
                    print(f"Related search failed for {note_id}: {e}")

            # ── Step 4: Route to page (NEW) ──
            page_id = None
            try:
                source_url = None
                note_data = await db.get_note(note_id)
                if note_data:
                    source_url = note_data.get("source_url")

                routing = await route_note(
                    text=raw_text,
                    title=title,
                    tags=tags,
                    source_url=source_url,
                    page_hint=page_hint,
                )
                page_id = routing["page_id"]
                await db.update_note(note_id, page_id=page_id)
                print(f"Routed {note_id} → {routing['page_name']} ({routing['confidence']:.0%}): {routing['reason']}")
            except Exception as e:
                print(f"Page routing failed for {note_id}: {e}")
                # Fallback to Uncategorized
                try:
                    uncat = await db.get_page_by_name("Uncategorized")
                    if uncat:
                        page_id = uncat["id"]
                        await db.update_note(note_id, page_id=page_id)
                except Exception:
                    pass

            # ── Step 5: Classify edge types (NEW) ──
            if related_notes:
                try:
                    for related in related_notes[:3]:  # Limit to top 3 to save LLM calls
                        already = await db.edge_exists(note_id, related["id"])
                        if already:
                            continue
                        try:
                            classification = await llm.classify_edge(
                                title_a=title or "Untitled",
                                content_a=raw_text,
                                title_b=related.get("title", "Untitled"),
                                content_b=related.get("raw_text", ""),
                            )
                            await db.insert_edge(
                                source_id=note_id,
                                target_id=related["id"],
                                edge_type=classification.edge_type,
                                label=classification.label,
                                strength=classification.confidence,
                                created_by="processor",
                            )
                        except Exception as e:
                            print(f"Edge classification failed for {note_id}↔{related['id']}: {e}")
                            # Fallback: create a basic "related" edge
                            try:
                                await db.insert_edge(
                                    source_id=note_id,
                                    target_id=related["id"],
                                    edge_type="related",
                                    strength=related.get("similarity", 0.0),
                                    created_by="processor",
                                )
                            except Exception:
                                pass
                except Exception as e:
                    print(f"Edge creation failed for {note_id}: {e}")

            # ── Step 6 & 7: Canvas position + cluster assignment (NEW) ──
            if page_id:
                try:
                    from app.services.cartographer import cartographer
                    placement = await cartographer.place_single_note(note_id, page_id)
                    if placement:
                        await db.update_note(
                            note_id,
                            canvas_x=placement["x"],
                            canvas_y=placement["y"],
                            cluster_id=placement.get("cluster_id"),
                        )
                except Exception as e:
                    print(f"Canvas placement failed for {note_id}: {e}")
                    # Fallback: random position
                    import random
                    await db.update_note(
                        note_id,
                        canvas_x=random.uniform(100, 1800),
                        canvas_y=random.uniform(100, 1300),
                    )

            # ── Step 8: Update page stats (NEW) ──
            if page_id:
                try:
                    await db.increment_page_note_count(page_id)
                except Exception as e:
                    print(f"Page stats update failed for {note_id}: {e}")

            await db.update_note(note_id, processing_status="done")

        except Exception as e:
            print(f"Processing failed for {note_id}: {e}")
            try:
                await db.update_note(note_id, processing_status="failed")
            except Exception:
                pass


processor = NoteProcessor()