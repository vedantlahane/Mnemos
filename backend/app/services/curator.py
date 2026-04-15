# === FILE: backend/app/services/curator.py ===

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

        # Fetch embeddings for notes that need them
        notes_with_emb = []
        for n in all_notes:
            emb = await db.get_embedding(n["id"])
            if emb:
                notes_with_emb.append({**n, "embedding": emb})

        duplicates = self._find_duplicates(notes_with_emb)
        orphans = self._find_orphans(all_notes, all_edges)
        stale = self._find_stale(all_notes)
        region_issues = await self._find_region_issues(user_id=user_id)
        missing = self._find_missing_connections(notes_with_emb, all_edges)

        auto_applied = 0
        for m in missing[:5]:
            edge = await db.insert_edge_if_not_exists(
                source_id=m["note_a"], target_id=m["note_b"],
                edge_type=m.get("suggested_type", "related"),
                strength=m.get("similarity", 0.0), created_by="curator",
            )
            if edge:
                auto_applied += 1

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
            "region_issues": region_issues,
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
                try:
                    from app.services.scene_manager import scene_manager
                    await scene_manager.remove_note_card(note["page_id"], params["note_id"])
                except Exception:
                    pass
            await db.delete_note(params["note_id"], user_id=user_id)
            return {"status": "deleted", "note_id": params["note_id"]}
        elif action_type == "connect_orphan":
            emb = await db.get_embedding(params["note_id"])
            if emb:
                related = await db.vector_search(emb, limit=3, threshold=0.65)
                created = 0
                for r in related:
                    if r["id"] != params["note_id"]:
                        edge = await db.insert_edge_if_not_exists(
                            source_id=params["note_id"], target_id=r["id"],
                            edge_type="related", strength=r.get("similarity", 0.0),
                            created_by="curator",
                        )
                        if edge:
                            created += 1
                return {"status": "connected", "edges_created": created}
            return {"status": "no_embedding"}
        return {"status": "unknown_action"}

    def _find_duplicates(self, notes: list) -> list:
        duplicates = []
        cap = min(len(notes), settings.curator_max_comparison)
        for i in range(cap):
            emb_a = np.array(notes[i]["embedding"])
            norm_a = np.linalg.norm(emb_a)
            if norm_a == 0:
                continue
            for j in range(i + 1, cap):
                emb_b = np.array(notes[j]["embedding"])
                norm_b = np.linalg.norm(emb_b)
                if norm_b == 0:
                    continue
                sim = float(np.dot(emb_a, emb_b) / (norm_a * norm_b))
                if sim > settings.curator_duplicate_threshold:
                    duplicates.append({
                        "note_a": notes[i]["id"], "note_b": notes[j]["id"],
                        "similarity": sim, "suggestion": "merge",
                        "reason": f"'{notes[i].get('title', 'Untitled')}' and '{notes[j].get('title', 'Untitled')}' are {sim:.0%} similar",
                    })
            if len(duplicates) >= 20:
                break
        return duplicates[:20]

    def _find_orphans(self, notes: list, edges: list) -> list:
        connected: set[str] = set()
        for e in edges:
            connected.add(e["source_id"])
            connected.add(e["target_id"])
        return [
            {"note_id": n["id"], "title": n.get("title") or "Untitled",
             "suggestion": "connect_orphan", "reason": "No connections"}
            for n in notes
            if n["id"] not in connected and n.get("processing_status") == "done"
        ][:30]

    def _find_stale(self, notes: list) -> list:
        stale = []
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=settings.curator_stale_days)
        for n in notes:
            created_str = n.get("created_at", "")
            if not created_str:
                continue
            try:
                cleaned = created_str.replace("Z", "+00:00")
                if "+" not in cleaned[10:] and "-" not in cleaned[10:]:
                    cleaned += "+00:00"
                created = datetime.fromisoformat(cleaned)
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                continue
            if created < cutoff:
                stale.append({"note_id": n["id"], "title": n.get("title") or "Untitled",
                              "days_old": (now - created).days})
        return stale[:20]

    async def _find_region_issues(self, user_id: str = None) -> list:
        issues = []
        pages = await db.list_pages(user_id=user_id)
        for page in pages:
            regions = await db.list_regions(page["id"])
            for region in regions:
                members = await db.get_elements_in_region(region["id"])
                count = len(members)
                if count > 15:
                    issues.append({"region_id": region["id"], "issue": "too_large", "size": count,
                                   "suggestion": f"Split '{region['label']}' ({count} elements)"})
                elif count == 0:
                    issues.append({"region_id": region["id"], "issue": "empty", "size": 0,
                                   "suggestion": f"Remove empty '{region['label']}'"})
        return issues

    def _find_missing_connections(self, notes: list, edges: list) -> list:
        edge_pairs = {tuple(sorted([e["source_id"], e["target_id"]])) for e in edges}
        missing = []
        cap = min(len(notes), settings.curator_max_comparison)
        for i in range(cap):
            emb_a = np.array(notes[i]["embedding"])
            norm_a = np.linalg.norm(emb_a)
            if norm_a == 0:
                continue
            for j in range(i + 1, min(cap, i + 20)):
                pair = tuple(sorted([notes[i]["id"], notes[j]["id"]]))
                if pair in edge_pairs:
                    continue
                emb_b = np.array(notes[j]["embedding"])
                norm_b = np.linalg.norm(emb_b)
                if norm_b == 0:
                    continue
                sim = float(np.dot(emb_a, emb_b) / (norm_a * norm_b))
                if sim > settings.curator_missing_edge_threshold:
                    missing.append({
                        "note_a": notes[i]["id"], "note_b": notes[j]["id"],
                        "similarity": sim, "suggested_type": "related",
                        "reason": f"'{notes[i].get('title', 'Untitled')}' ↔ '{notes[j].get('title', 'Untitled')}' ({sim:.0%})",
                    })
            if len(missing) >= 20:
                break
        return missing[:20]

    async def _merge_notes(self, note_a_id: str, note_b_id: str, user_id: str = None) -> dict:
        note_a = await db.get_note(note_a_id, user_id=user_id)
        note_b = await db.get_note(note_b_id, user_id=user_id)
        if not note_a or not note_b:
            return {"status": "error", "detail": "Note not found"}

        await db.update_note(note_a_id, user_id=user_id,
            raw_text=f"{note_a['raw_text']}\n\n---\n\n{note_b['raw_text']}",
            tags=list(set((note_a.get("tags") or []) + (note_b.get("tags") or []))),
            tasks=list(set((note_a.get("tasks") or []) + (note_b.get("tasks") or []))),
            entities=list(set((note_a.get("entities") or []) + (note_b.get("entities") or []))),
        )

        # Transfer edges
        b_edges = await db.get_edges_for_note(note_b_id)
        for edge in b_edges:
            other_id = edge["target_id"] if edge["source_id"] == note_b_id else edge["source_id"]
            if other_id != note_a_id:
                await db.insert_edge_if_not_exists(
                    source_id=note_a_id, target_id=other_id,
                    edge_type=edge["edge_type"], strength=edge.get("strength", 0.0),
                    created_by="curator",
                )

        # Remove from canvas
        if note_b.get("page_id"):
            try:
                from app.services.scene_manager import scene_manager
                await scene_manager.remove_note_card(note_b["page_id"], note_b_id)
            except Exception:
                pass

        await db.delete_note(note_b_id, user_id=user_id)

        # Re-sync kept note
        if note_a.get("page_id"):
            try:
                from app.services.scene_manager import scene_manager
                updated_a = await db.get_note(note_a_id)
                if updated_a:
                    pos = await db.get_note_position(updated_a["page_id"], note_a_id)
                    x = float(pos["x"]) if pos and pos.get("x") else 400
                    y = float(pos["y"]) if pos and pos.get("y") else 400
                    await scene_manager.upsert_note_card(updated_a["page_id"], updated_a, x, y)
            except Exception:
                pass

        return {"status": "merged", "kept": note_a_id, "deleted": note_b_id}


curator = Curator()