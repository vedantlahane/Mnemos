# === FILE: backend/app/services/curator.py ===
"""
Curator service — knowledge base health scanning.
"""

from datetime import datetime, timedelta, timezone
import logging
import numpy as np
from app.db.supabase import db
from app.config import settings

logger = logging.getLogger("mnemos.curator")


class Curator:

    async def full_scan(self, user_id: str = None) -> dict:
        notes_result = await db.list_notes(page=1, limit=settings.curator_max_comparison, user_id=user_id)
        all_notes = notes_result.get("notes", [])
        all_edges = await db.get_all_edges(user_id=user_id)

        duplicates = self._find_duplicates(all_notes)
        orphans = self._find_orphans(all_notes, all_edges)
        stale = self._find_stale(all_notes)
        cluster_issues = await self._find_cluster_issues(user_id=user_id)
        missing = self._find_missing_connections(all_notes, all_edges)

        # Auto-apply safe actions
        auto_applied = 0
        for m in missing[:5]:
            try:
                exists = await db.edge_exists(m["note_a"], m["note_b"])
                if not exists:
                    await db.insert_edge(
                        source_id=m["note_a"],
                        target_id=m["note_b"],
                        edge_type=m.get("suggested_type", "related"),
                        strength=m.get("similarity", 0.0),
                        created_by="curator",
                    )
                    auto_applied += 1
            except Exception as e:
                logger.debug(f"Auto-apply edge failed: {e}")

        needs_confirmation = []
        for d in duplicates:
            needs_confirmation.append({
                "action_type": "merge_notes",
                "params": {"note_a": d["note_a"], "note_b": d["note_b"]},
                "reason": f"Notes are {d['similarity']:.0%} similar",
            })
        for s in stale:
            needs_confirmation.append({
                "action_type": "delete_note",
                "params": {"note_id": s["note_id"]},
                "reason": f"Note is {s['days_old']} days old with no references",
            })

        return {
            "potential_duplicates": duplicates,
            "orphan_notes": orphans,
            "stale_notes": stale,
            "cluster_issues": cluster_issues,
            "missing_connections": missing,
            "auto_applied": auto_applied,
            "needs_confirmation": needs_confirmation,
        }

    async def apply_action(self, action_type: str, params: dict, user_id: str = None) -> dict:
        if action_type == "merge_notes":
            return await self._merge_notes(params["note_a"], params["note_b"], user_id=user_id)
        elif action_type == "delete_note":
            note = await db.get_note(params["note_id"], user_id=user_id)
            if not note:
                return {"status": "error", "detail": "Note not found"}
            if note.get("page_id"):
                await db.decrement_page_note_count(note["page_id"], user_id=user_id)
                try:
                    from app.services.excalidraw_scene import remove_note_from_canvas
                    await remove_note_from_canvas(note["page_id"], params["note_id"])
                except Exception:
                    pass
            await db.delete_note(params["note_id"], user_id=user_id)
            return {"status": "deleted", "note_id": params["note_id"]}
        elif action_type == "add_edge":
            edge = await db.insert_edge(**params)
            return {"status": "edge_created", "edge": edge}
        elif action_type == "connect_orphan":
            note = await db.get_note(params["note_id"], user_id=user_id)
            if note and note.get("embedding"):
                related = await db.vector_search(note["embedding"], limit=3, threshold=0.65)
                created = 0
                for r in related:
                    if r["id"] != params["note_id"]:
                        exists = await db.edge_exists(params["note_id"], r["id"])
                        if not exists:
                            await db.insert_edge(
                                source_id=params["note_id"],
                                target_id=r["id"],
                                edge_type="related",
                                strength=r.get("similarity", 0.0),
                                created_by="curator",
                            )
                            created += 1
                return {"status": "connected", "edges_created": created}
            return {"status": "no_embedding"}
        else:
            return {"status": "unknown_action"}

    def _find_duplicates(self, notes: list) -> list:
        duplicates = []
        notes_with_emb = [n for n in notes if n.get("embedding")]
        cap = min(len(notes_with_emb), settings.curator_max_comparison)

        for i in range(cap):
            emb_a = np.array(notes_with_emb[i]["embedding"])
            norm_a = np.linalg.norm(emb_a)
            if norm_a == 0:
                continue
            for j in range(i + 1, cap):
                emb_b = np.array(notes_with_emb[j]["embedding"])
                norm_b = np.linalg.norm(emb_b)
                if norm_b == 0:
                    continue
                sim = float(np.dot(emb_a, emb_b) / (norm_a * norm_b))
                if sim > settings.curator_duplicate_threshold:
                    duplicates.append({
                        "note_a": notes_with_emb[i]["id"],
                        "note_b": notes_with_emb[j]["id"],
                        "similarity": sim,
                        "suggestion": "merge",
                        "reason": (
                            f"'{notes_with_emb[i].get('title', 'Untitled')}' and "
                            f"'{notes_with_emb[j].get('title', 'Untitled')}' are {sim:.0%} similar"
                        ),
                    })
            if len(duplicates) >= 20:
                break
        return duplicates[:20]

    def _find_orphans(self, notes: list, edges: list) -> list:
        connected: set[str] = set()
        for e in edges:
            connected.add(e["source_id"])
            connected.add(e["target_id"])
        orphans = []
        for n in notes:
            if n["id"] not in connected and n.get("processing_status") == "done":
                orphans.append({
                    "note_id": n["id"],
                    "title": n.get("title") or "Untitled",
                    "suggestion": "connect_orphan",
                    "reason": "Note has no connections to other notes",
                })
        return orphans[:30]

    def _find_stale(self, notes: list) -> list:
        stale = []
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=settings.curator_stale_days)

        for n in notes:
            created_str = n.get("created_at", "")
            if not created_str:
                continue
            try:
                created_str_clean = created_str.replace("Z", "+00:00")
                if "+" not in created_str_clean and "-" not in created_str_clean[10:]:
                    created_str_clean += "+00:00"
                created = datetime.fromisoformat(created_str_clean)
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                continue

            if created < cutoff:
                related = n.get("related_note_ids") or []
                if not related:
                    days_old = (now - created).days
                    stale.append({
                        "note_id": n["id"],
                        "title": n.get("title") or "Untitled",
                        "days_old": days_old,
                    })
        return stale[:20]

    async def _find_cluster_issues(self, user_id: str = None) -> list:
        issues = []
        pages = await db.list_pages(user_id=user_id)
        for page in pages:
            clusters = await db.list_clusters(page_id=page["id"])
            for cluster in clusters:
                notes_result = await db.list_notes(page=1, limit=100, page_id=page["id"], user_id=user_id)
                cluster_notes = [n for n in notes_result.get("notes", []) if n.get("cluster_id") == cluster["id"]]
                if len(cluster_notes) > 15:
                    issues.append({
                        "cluster_id": cluster["id"],
                        "issue": "too_large",
                        "size": len(cluster_notes),
                        "suggestion": f"Split cluster '{cluster['label']}' ({len(cluster_notes)} notes)",
                    })
                elif len(cluster_notes) == 0:
                    issues.append({
                        "cluster_id": cluster["id"],
                        "issue": "empty",
                        "size": 0,
                        "suggestion": f"Remove empty cluster '{cluster['label']}'",
                    })
        return issues

    def _find_missing_connections(self, notes: list, edges: list) -> list:
        edge_pairs: set[tuple[str, str]] = set()
        for e in edges:
            pair = tuple(sorted([e["source_id"], e["target_id"]]))
            edge_pairs.add(pair)

        missing = []
        notes_with_emb = [n for n in notes if n.get("embedding")]
        cap = min(len(notes_with_emb), settings.curator_max_comparison)

        for i in range(cap):
            emb_a = np.array(notes_with_emb[i]["embedding"])
            norm_a = np.linalg.norm(emb_a)
            if norm_a == 0:
                continue
            for j in range(i + 1, min(cap, i + 20)):
                pair = tuple(sorted([notes_with_emb[i]["id"], notes_with_emb[j]["id"]]))
                if pair in edge_pairs:
                    continue
                emb_b = np.array(notes_with_emb[j]["embedding"])
                norm_b = np.linalg.norm(emb_b)
                if norm_b == 0:
                    continue
                sim = float(np.dot(emb_a, emb_b) / (norm_a * norm_b))
                if sim > settings.curator_missing_edge_threshold:
                    missing.append({
                        "note_a": notes_with_emb[i]["id"],
                        "note_b": notes_with_emb[j]["id"],
                        "similarity": sim,
                        "suggested_type": "related",
                        "reason": (
                            f"'{notes_with_emb[i].get('title', 'Untitled')}' and "
                            f"'{notes_with_emb[j].get('title', 'Untitled')}' are "
                            f"{sim:.0%} similar but have no edge"
                        ),
                    })
            if len(missing) >= 20:
                break
        return missing[:20]

    async def _merge_notes(self, note_a_id: str, note_b_id: str, user_id: str = None) -> dict:
        note_a = await db.get_note(note_a_id, user_id=user_id)
        note_b = await db.get_note(note_b_id, user_id=user_id)
        if not note_a or not note_b:
            return {"status": "error", "detail": "Note not found"}

        merged_text = f"{note_a['raw_text']}\n\n---\n\n{note_b['raw_text']}"
        merged_tags = list(set((note_a.get("tags") or []) + (note_b.get("tags") or [])))
        merged_tasks = list(set((note_a.get("tasks") or []) + (note_b.get("tasks") or [])))
        merged_entities = list(set((note_a.get("entities") or []) + (note_b.get("entities") or [])))

        await db.update_note(
            note_a_id, user_id=user_id,
            raw_text=merged_text,
            tags=merged_tags,
            tasks=merged_tasks,
            entities=merged_entities,
        )

        b_edges = await db.get_edges_for_note(note_b_id)
        for edge in b_edges:
            other_id = edge["target_id"] if edge["source_id"] == note_b_id else edge["source_id"]
            if other_id != note_a_id:
                exists = await db.edge_exists(note_a_id, other_id)
                if not exists:
                    try:
                        await db.insert_edge(
                            source_id=note_a_id,
                            target_id=other_id,
                            edge_type=edge["edge_type"],
                            strength=edge.get("strength", 0.0),
                            created_by="curator",
                        )
                    except Exception:
                        pass

        if note_b.get("page_id"):
            await db.decrement_page_note_count(note_b["page_id"], user_id=user_id)
            try:
                from app.services.excalidraw_scene import remove_note_from_canvas
                await remove_note_from_canvas(note_b["page_id"], note_b_id)
            except Exception:
                pass

        await db.delete_note(note_b_id, user_id=user_id)

        # Re-sync merged note on canvas
        try:
            if note_a.get("page_id"):
                from app.services.excalidraw_scene import sync_note_to_canvas
                updated_a = await db.get_note(note_a_id)
                if updated_a:
                    await sync_note_to_canvas(
                        updated_a["page_id"], updated_a,
                        x=updated_a.get("canvas_x"),
                        y=updated_a.get("canvas_y"),
                    )
        except Exception:
            pass

        return {"status": "merged", "kept": note_a_id, "deleted": note_b_id}


curator = Curator()