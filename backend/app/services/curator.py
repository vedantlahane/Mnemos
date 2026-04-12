import json
from datetime import datetime, timedelta
import numpy as np
from app.db.supabase import db
from app.services import llm


class Curator:

    async def full_scan(self) -> dict:
        """Scan entire knowledge base for maintenance issues."""
        notes_result = await db.list_notes(page=1, limit=500)
        all_notes = notes_result.get("notes", [])
        all_edges = await db.get_all_edges()

        duplicates = await self._find_duplicates(all_notes)
        orphans = self._find_orphans(all_notes, all_edges)
        stale = self._find_stale(all_notes)
        cluster_issues = await self._find_cluster_issues()
        missing = await self._find_missing_connections(all_notes, all_edges)

        # Build findings summary for LLM
        findings = {
            "duplicates": len(duplicates),
            "orphans": len(orphans),
            "stale": len(stale),
            "cluster_issues": len(cluster_issues),
            "missing_connections": len(missing),
        }

        # Auto-apply safe actions
        auto_applied = 0
        needs_confirmation = []

        # Auto-add missing edges (low risk)
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
            except Exception:
                pass

        # Queue risky actions for confirmation
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

    async def apply_action(self, action_type: str, params: dict) -> dict:
        """Apply a curator action."""
        if action_type == "merge_notes":
            return await self._merge_notes(params["note_a"], params["note_b"])
        elif action_type == "delete_note":
            await db.delete_note(params["note_id"])
            return {"status": "deleted", "note_id": params["note_id"]}
        elif action_type == "add_edge":
            edge = await db.insert_edge(**params)
            return {"status": "edge_created", "edge": edge}
        elif action_type == "connect_orphan":
            # Find related notes for orphan and create edges
            note = await db.get_note(params["note_id"])
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

    async def _find_duplicates(self, notes: list) -> list:
        """Find note pairs with very high similarity."""
        duplicates = []
        notes_with_emb = [n for n in notes if n.get("embedding")]

        for i, note_a in enumerate(notes_with_emb):
            emb_a = np.array(note_a["embedding"])
            for j in range(i + 1, len(notes_with_emb)):
                note_b = notes_with_emb[j]
                emb_b = np.array(note_b["embedding"])
                sim = float(np.dot(emb_a, emb_b) / (np.linalg.norm(emb_a) * np.linalg.norm(emb_b) + 1e-9))
                if sim > 0.92:
                    duplicates.append({
                        "note_a": note_a["id"],
                        "note_b": note_b["id"],
                        "similarity": sim,
                        "suggestion": "merge",
                        "reason": f"'{note_a.get('title', 'Untitled')}' and '{note_b.get('title', 'Untitled')}' are {sim:.0%} similar",
                    })
        return duplicates

    def _find_orphans(self, notes: list, edges: list) -> list:
        """Find notes with no edges."""
        connected = set()
        for e in edges:
            connected.add(e["source_id"])
            connected.add(e["target_id"])

        orphans = []
        for n in notes:
            if n["id"] not in connected and n.get("processing_status") == "done":
                orphans.append({
                    "note_id": n["id"],
                    "title": n.get("title", "Untitled"),
                    "suggestion": "connect_orphan",
                    "reason": "Note has no connections to other notes",
                })
        return orphans

    def _find_stale(self, notes: list) -> list:
        """Find notes older than 30 days with no references."""
        stale = []
        cutoff = datetime.utcnow() - timedelta(days=30)
        for n in notes:
            created = n.get("created_at", "")
            if created and created < cutoff.isoformat():
                related = n.get("related_note_ids") or []
                if not related:
                    days_old = (datetime.utcnow() - datetime.fromisoformat(created.replace("Z", "+00:00").replace("+00:00", ""))).days
                    stale.append({
                        "note_id": n["id"],
                        "title": n.get("title", "Untitled"),
                        "days_old": days_old,
                    })
        return stale

    async def _find_cluster_issues(self) -> list:
        """Find clusters that are too large or very similar."""
        issues = []
        pages = await db.list_pages()

        for page in pages:
            clusters = await db.list_clusters(page_id=page["id"])
            for cluster in clusters:
                # Count notes in cluster
                notes = await db.list_notes(page=1, limit=100, page_id=page["id"])
                cluster_notes = [n for n in notes.get("notes", []) if n.get("cluster_id") == cluster["id"]]
                if len(cluster_notes) > 15:
                    issues.append({
                        "cluster_id": cluster["id"],
                        "issue": "too_large",
                        "size": len(cluster_notes),
                        "suggestion": f"Split cluster '{cluster['label']}' ({len(cluster_notes)} notes)",
                    })
        return issues

    async def _find_missing_connections(self, notes: list, edges: list) -> list:
        """Find note pairs with high similarity but no edge."""
        edge_pairs = set()
        for e in edges:
            pair = tuple(sorted([e["source_id"], e["target_id"]]))
            edge_pairs.add(pair)

        missing = []
        notes_with_emb = [n for n in notes if n.get("embedding")]

        for i, note_a in enumerate(notes_with_emb):
            emb_a = np.array(note_a["embedding"])
            for j in range(i + 1, min(len(notes_with_emb), i + 20)):
                note_b = notes_with_emb[j]
                pair = tuple(sorted([note_a["id"], note_b["id"]]))
                if pair in edge_pairs:
                    continue
                emb_b = np.array(note_b["embedding"])
                sim = float(np.dot(emb_a, emb_b) / (np.linalg.norm(emb_a) * np.linalg.norm(emb_b) + 1e-9))
                if sim > 0.8:
                    missing.append({
                        "note_a": note_a["id"],
                        "note_b": note_b["id"],
                        "similarity": sim,
                        "suggested_type": "related",
                        "reason": f"'{note_a.get('title', 'Untitled')}' and '{note_b.get('title', 'Untitled')}' are {sim:.0%} similar but have no edge",
                    })
        return missing[:20]  # Cap at 20

    async def _merge_notes(self, note_a_id: str, note_b_id: str) -> dict:
        """Merge two notes: keep A, append B's content, delete B."""
        note_a = await db.get_note(note_a_id)
        note_b = await db.get_note(note_b_id)
        if not note_a or not note_b:
            return {"status": "error", "detail": "Note not found"}

        merged_text = f"{note_a['raw_text']}\n\n---\n\n{note_b['raw_text']}"
        merged_tags = list(set((note_a.get("tags") or []) + (note_b.get("tags") or [])))
        merged_tasks = list(set((note_a.get("tasks") or []) + (note_b.get("tasks") or [])))
        merged_entities = list(set((note_a.get("entities") or []) + (note_b.get("entities") or [])))

        await db.update_note(
            note_a_id,
            raw_text=merged_text,
            tags=merged_tags,
            tasks=merged_tasks,
            entities=merged_entities,
        )

        # Move B's edges to A
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

        await db.delete_note(note_b_id)
        return {"status": "merged", "kept": note_a_id, "deleted": note_b_id}


curator = Curator()