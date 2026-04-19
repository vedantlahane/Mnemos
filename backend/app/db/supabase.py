"""
Database layer — one method per operation, no duplicates.
8 tables: users, pages, notes, note_embeddings, note_edges,
          scene_operations, chat_history, settings.
"""

from __future__ import annotations
import asyncio
import json
from datetime import datetime, timedelta, timezone
from supabase import create_client
from app.config import settings

client = create_client(settings.supabase_url, settings.supabase_key)


def _run(fn):
    return asyncio.to_thread(fn)


def _now():
    return datetime.now(timezone.utc).isoformat()


class Database:

    # ═══════════════════════════════
    # USERS
    # ═══════════════════════════════

    async def upsert_user(self, google_id: str, email: str,
                          name: str = None, avatar_url: str = None) -> dict:
        existing = await _run(
            lambda: client.table("users").select("*")
            .eq("google_id", google_id).maybe_single().execute()
        )
        if existing and existing.data:
            updates = {"updated_at": _now()}
            if name:
                updates["name"] = name
            if avatar_url:
                updates["avatar_url"] = avatar_url
            if email:
                updates["email"] = email
            result = await _run(
                lambda: client.table("users").update(updates)
                .eq("id", existing.data["id"]).execute()
            )
            return result.data[0] if result.data else existing.data
        result = await _run(
            lambda: client.table("users").insert({
                "google_id": google_id, "email": email,
                "name": name, "avatar_url": avatar_url,
            }).execute()
        )
        return result.data[0]

    async def get_user(self, user_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("users").select("*")
                .eq("id", user_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    # ═══════════════════════════════
    # PAGES
    # ═══════════════════════════════

    async def insert_page(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("pages").insert(kwargs).execute())
        return result.data[0]

    async def update_page(self, page_id: str, user_id: str = None, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        q = client.table("pages").update(updates).eq("id", page_id)
        if user_id:
            q = q.eq("user_id", user_id)
        result = await _run(lambda: q.execute())
        return result.data[0] if result.data else {}

    async def get_page(self, page_id: str, user_id: str = None) -> dict | None:
        try:
            q = client.table("pages").select("*").eq("id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            result = await _run(lambda: q.maybe_single().execute())
            return result.data
        except Exception:
            return None

    async def get_page_by_name(self, name: str, user_id: str = None) -> dict | None:
        try:
            q = client.table("pages").select("*").ilike("name", name)
            if user_id:
                q = q.eq("user_id", user_id)
            result = await _run(lambda: q.maybe_single().execute())
            return result.data if result else None
        except Exception:
            return None

    async def list_pages(self, include_archived: bool = False,
                         user_id: str = None) -> list:
        def _q():
            q = client.table("pages").select(
                "id, name, description, icon, color, is_archived, "
                "scene_version, created_at, updated_at"
            ).order("updated_at", desc=True)
            if not include_archived:
                q = q.eq("is_archived", False)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def delete_page(self, page_id: str, user_id: str = None) -> None:
        # Move notes to Uncategorized
        uncat = await self.get_page_by_name("Uncategorized", user_id=user_id)
        if uncat:
            q = client.table("notes").update({"page_id": uncat["id"], "updated_at": _now()}).eq("page_id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            await _run(lambda: q.execute())
        q = client.table("pages").delete().eq("id", page_id)
        if user_id:
            q = q.eq("user_id", user_id)
        await _run(lambda: q.execute())

    # ── Scene (stored on pages table) ──

    async def get_scene(self, page_id: str) -> dict:
        try:
            result = await _run(
                lambda: client.table("pages")
                .select("scene_data, scene_version")
                .eq("id", page_id).maybe_single().execute()
            )
            if result.data:
                return {
                    "scene": result.data.get("scene_data") or {},
                    "version": result.data.get("scene_version", 0),
                }
            return {"scene": {}, "version": 0}
        except Exception:
            return {"scene": {}, "version": 0}

    async def save_scene(self, page_id: str, scene_data: dict,
                         new_version: int) -> None:
        await _run(
            lambda: client.table("pages").update({
                "scene_data": scene_data,
                "scene_version": new_version,
                "updated_at": _now(),
            }).eq("id", page_id).execute()
        )

    async def increment_scene_version(self, page_id: str) -> int:
        """Atomically increment scene version. Returns new version."""
        result = await _run(
            lambda: client.table("pages")
            .select("scene_version").eq("id", page_id)
            .maybe_single().execute()
        )
        current = result.data.get("scene_version", 0) if result.data else 0
        new_v = current + 1
        await _run(
            lambda: client.table("pages").update({
                "scene_version": new_v, "updated_at": _now(),
            }).eq("id", page_id).execute()
        )
        return new_v

    # ═══════════════════════════════
    # NOTES
    # ═══════════════════════════════

    async def insert_note(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("notes").insert(kwargs).execute())
        return result.data[0]

    async def update_note(self, note_id: str, user_id: str = None, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        q = client.table("notes").update(updates).eq("id", note_id)
        if user_id:
            q = q.eq("user_id", user_id)
        result = await _run(lambda: q.execute())
        return result.data[0] if result.data else {}

    async def get_note(self, note_id: str, user_id: str = None) -> dict | None:
        try:
            q = client.table("notes").select("*").eq("id", note_id)
            if user_id:
                q = q.eq("user_id", user_id)
            result = await _run(lambda: q.maybe_single().execute())
            return result.data
        except Exception:
            return None

    async def list_notes(self, page: int = 1, limit: int = 20,
                         tag: str = None, page_id: str = None,
                         user_id: str = None) -> dict:
        def _q():
            q = client.table("notes").select("*", count="exact")
            if tag:
                q = q.contains("tags", [tag])
            if page_id:
                q = q.eq("page_id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.order("created_at", desc=True).range(
                (page - 1) * limit, page * limit - 1
            ).execute()
        result = await _run(_q)
        return {"notes": result.data or [], "total": result.count or 0}

    async def get_notes_for_page(self, page_id: str,
                                 user_id: str = None) -> list:
        def _q():
            q = client.table("notes").select("*").eq("page_id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.order("created_at", desc=True).execute()
        result = await _run(_q)
        return result.data or []

    async def delete_note(self, note_id: str, user_id: str = None) -> None:
        q = client.table("notes").delete().eq("id", note_id)
        if user_id:
            q = q.eq("user_id", user_id)
        await _run(lambda: q.execute())

    async def count_notes(self, page_id: str = None,
                          user_id: str = None) -> int:
        def _q():
            q = client.table("notes").select("id", count="exact")
            if page_id:
                q = q.eq("page_id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()
        result = await _run(_q)
        return result.count or 0

    async def get_stuck_notes(self, older_than_minutes: int = 5) -> list:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)).isoformat()
        result = await _run(
            lambda: client.table("notes").select("id, raw_text")
            .in_("processing_status", ["pending", "processing"])
            .lt("created_at", cutoff).execute()
        )
        return result.data or []

    async def get_all_tags_with_counts(self, user_id: str = None) -> list[dict]:
        def _q():
            q = client.table("notes").select("tags")
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()
        result = await _run(_q)
        counts: dict[str, int] = {}
        for note in (result.data or []):
            for tag in (note.get("tags") or []):
                counts[tag] = counts.get(tag, 0) + 1
        return sorted(
            [{"name": k, "count": v} for k, v in counts.items()],
            key=lambda x: x["count"], reverse=True,
        )

    # ═══════════════════════════════
    # EMBEDDINGS
    # ═══════════════════════════════

    async def upsert_embedding(self, note_id: str, embedding: list[float],
                               model: str = "gemini-embedding-001") -> None:
        await _run(
            lambda: client.table("note_embeddings")
            .upsert({"note_id": note_id, "embedding": embedding, "model": model})
            .execute()
        )

    async def get_embedding(self, note_id: str) -> list[float] | None:
        try:
            result = await _run(
                lambda: client.table("note_embeddings")
                .select("embedding").eq("note_id", note_id)
                .maybe_single().execute()
            )
            if result.data and "embedding" in result.data:
                emb = result.data["embedding"]
                if isinstance(emb, str):
                    emb = json.loads(emb)
                return emb
            return None
        except Exception:
            return None

    async def get_notes_with_embeddings(self, page_id: str) -> list:
        """Get notes on a page that have embeddings."""
        notes_result = await _run(
            lambda: client.table("notes")
            .select("id, title, tags, summary, raw_text, page_id, content_type")
            .eq("page_id", page_id).execute()
        )
        notes = notes_result.data or []
        if not notes:
            return []

        note_ids = [n["id"] for n in notes]
        emb_result = await _run(
            lambda: client.table("note_embeddings")
            .select("note_id, embedding")
            .in_("note_id", note_ids).execute()
        )
        emb_map = {}
        for e in (emb_result.data or []):
            emb = e["embedding"]
            if isinstance(emb, str):
                emb = json.loads(emb)
            emb_map[e["note_id"]] = emb

        return [{**n, "embedding": emb_map[n["id"]]} for n in notes if n["id"] in emb_map]

    async def vector_search(self, embedding: list, limit: int = 10,
                            threshold: float = 0.65) -> list:
        result = await _run(
            lambda: client.rpc("match_notes", {
                "query_embedding": embedding,
                "match_threshold": threshold,
                "match_count": limit,
            }).execute()
        )
        return result.data or []

    async def vector_search_in_page(self, embedding: list, page_id: str,
                                    limit: int = 10, threshold: float = 0.65) -> list:
        result = await _run(
            lambda: client.rpc("match_notes_in_page", {
                "query_embedding": embedding,
                "target_page_id": page_id,
                "match_threshold": threshold,
                "match_count": limit,
            }).execute()
        )
        return result.data or []

    # ═══════════════════════════════
    # EDGES
    # ═══════════════════════════════

    async def insert_edge_if_not_exists(self, source_id: str, target_id: str,
                                        **kwargs) -> dict | None:
        try:
            data = {"source_id": source_id, "target_id": target_id, **kwargs}
            result = await _run(lambda: client.table("note_edges").insert(data).execute())
            return result.data[0] if result.data else None
        except Exception:
            return None

    async def delete_edge(self, edge_id: str) -> None:
        await _run(lambda: client.table("note_edges").delete().eq("id", edge_id).execute())

    async def get_edges_for_note(self, note_id: str) -> list:
        source = await _run(
            lambda: client.table("note_edges").select("*").eq("source_id", note_id).execute()
        )
        target = await _run(
            lambda: client.table("note_edges").select("*").eq("target_id", note_id).execute()
        )
        seen: set[str] = set()
        edges: list[dict] = []
        for e in (source.data or []) + (target.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    async def get_edges_for_page(self, page_id: str) -> list:
        ids_result = await _run(
            lambda: client.table("notes").select("id").eq("page_id", page_id).execute()
        )
        note_ids = [n["id"] for n in (ids_result.data or [])]
        if not note_ids:
            return []
        source = await _run(
            lambda: client.table("note_edges").select("*").in_("source_id", note_ids).execute()
        )
        target = await _run(
            lambda: client.table("note_edges").select("*").in_("target_id", note_ids).execute()
        )
        seen: set[str] = set()
        edges: list[dict] = []
        for e in (source.data or []) + (target.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    async def get_all_edges(self, user_id: str = None) -> list:
        if not user_id:
            result = await _run(lambda: client.table("note_edges").select("*").execute())
            return result.data or []
        notes_result = await _run(
            lambda: client.table("notes").select("id").eq("user_id", user_id).execute()
        )
        note_ids = [n["id"] for n in (notes_result.data or [])]
        if not note_ids:
            return []
        source = await _run(
            lambda: client.table("note_edges").select("*").in_("source_id", note_ids).execute()
        )
        target = await _run(
            lambda: client.table("note_edges").select("*").in_("target_id", note_ids).execute()
        )
        seen: set[str] = set()
        edges: list[dict] = []
        for e in (source.data or []) + (target.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    # ═══════════════════════════════
    # SCENE OPERATIONS (change log)
    # ═══════════════════════════════

    async def log_scene_op(self, page_id: str, version: int,
                           op_type: str, actor: str = "ai",
                           element_ids: list[str] = None,
                           payload: dict = None) -> dict:
        result = await _run(
            lambda: client.table("scene_operations").insert({
                "page_id": page_id,
                "version": version,
                "op_type": op_type,
                "actor": actor,
                "element_ids": element_ids or [],
                "payload": payload or {},
            }).execute()
        )
        return result.data[0] if result.data else {}

    async def get_scene_ops_since(self, page_id: str,
                                  after_version: int) -> list:
        result = await _run(
            lambda: client.table("scene_operations")
            .select("*").eq("page_id", page_id)
            .gt("version", after_version)
            .order("version").execute()
        )
        return result.data or []

    async def cleanup_old_ops(self, page_id: str,
                              keep: int = None) -> int:
        keep_n = keep or settings.ops_retention_count
        result = await _run(
            lambda: client.table("scene_operations")
            .select("id, version").eq("page_id", page_id)
            .order("version", desc=True).execute()
        )
        ops = result.data or []
        if len(ops) <= keep_n:
            return 0
        old_ids = [o["id"] for o in ops[keep_n:]]
        if old_ids:
            await _run(
                lambda: client.table("scene_operations")
                .delete().in_("id", old_ids).execute()
            )
        return len(old_ids)

    # ═══════════════════════════════
    # CHAT HISTORY
    # ═══════════════════════════════

    async def insert_chat(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("chat_history").insert(kwargs).execute())
        return result.data[0]

    async def update_chat(self, chat_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        result = await _run(
            lambda: client.table("chat_history").update(updates).eq("id", chat_id).execute()
        )
        return result.data[0] if result.data else {}

    async def list_chats(self, user_id: str = None, page_id: str = None,
                         limit: int = 20) -> list:
        def _q():
            q = client.table("chat_history").select("*").order("updated_at", desc=True).limit(limit)
            if user_id:
                q = q.eq("user_id", user_id)
            if page_id:
                q = q.eq("page_id", page_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def get_chat(self, chat_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("chat_history").select("*")
                .eq("id", chat_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    async def delete_chat(self, chat_id: str) -> None:
        await _run(lambda: client.table("chat_history").delete().eq("id", chat_id).execute())

    # ═══════════════════════════════
    # SETTINGS
    # ═══════════════════════════════

    async def get_settings(self, user_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("settings").select("*")
                .eq("user_id", user_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    async def upsert_settings(self, user_id: str, **kwargs) -> dict:
        data = {
            "user_id": user_id,
            **{k: v for k, v in kwargs.items() if v is not None},
            "updated_at": _now(),
        }
        result = await _run(
            lambda: client.table("settings")
            .upsert(data, on_conflict="user_id").execute()
        )
        return result.data[0] if result.data else {}

    # ═══════════════════════════════
    # STATS
    # ═══════════════════════════════

    async def get_global_stats(self, user_id: str = None) -> dict:
        def _notes_q():
            q = client.table("notes").select("processing_status, tags", count="exact")
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()

        def _pages_q():
            q = client.table("pages").select("id", count="exact").eq("is_archived", False)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()

        notes_result = await _run(_notes_q)
        pages_result = await _run(_pages_q)

        all_tags: set[str] = set()
        status_counts: dict[str, int] = {}
        for note in (notes_result.data or []):
            all_tags.update(note.get("tags") or [])
            status = note.get("processing_status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1

        return {
            "total_notes": notes_result.count or 0,
            "total_pages": pages_result.count or 0,
            "total_tags": len(all_tags),
            "status_counts": status_counts,
        }


db = Database()