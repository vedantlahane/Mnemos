import asyncio
from datetime import datetime, timedelta
from supabase import create_client
from app.config import settings

client = create_client(settings.supabase_url, settings.supabase_key)


class NotesDB:

    # ── Notes ─────────────────────────────────────────

    async def insert_note(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("notes").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_note(self, note_id: str, user_id: str = None, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()

        _uid = user_id
        _nid = note_id

        def _query():
            q = client.table("notes").update(updates).eq("id", _nid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(
            _query
        )
        return result.data[0] if result.data else {}

    async def get_note(self, note_id: str, user_id: str = None) -> dict | None:
        try:
            _uid = user_id
            _nid = note_id

            def _query():
                q = client.table("notes").select("*").eq("id", _nid)
                if _uid:
                    q = q.eq("user_id", _uid)
                return q.maybe_single().execute()

            result = await asyncio.to_thread(
                _query
            )
            return result.data
        except Exception:
            return None

    async def list_notes(
        self, page: int = 1, limit: int = 20, tag: str = None,
        page_id: str = None, user_id: str = None,
    ) -> dict:
        _tag = tag
        _page_id = page_id
        _page = page
        _limit = limit
        _user_id = user_id

        def _query():
            q = client.table("notes").select("*", count="exact")
            if _tag:
                q = q.contains("tags", [_tag])
            if _page_id:
                q = q.eq("page_id", _page_id)
            if _user_id:
                q = q.eq("user_id", _user_id)
            q = q.order("created_at", desc=True)
            q = q.range((_page - 1) * _limit, _page * _limit - 1)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return {"notes": result.data or [], "total": result.count or 0}

    async def delete_note(self, note_id: str, user_id: str = None) -> None:
        _uid = user_id
        _nid = note_id

        def _query():
            q = client.table("notes").delete().eq("id", _nid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        await asyncio.to_thread(
            _query
        )

    async def vector_search(
        self,
        embedding: list,
        limit: int = 10,
        threshold: float = 0.65,
    ) -> list:
        _emb = embedding
        _lim = limit
        _thr = threshold
        result = await asyncio.to_thread(
            lambda: client.rpc(
                "match_notes",
                {
                    "query_embedding": _emb,
                    "match_threshold": _thr,
                    "match_count": _lim,
                },
            ).execute()
        )
        return result.data or []

    async def vector_search_in_page(
        self,
        embedding: list,
        page_id: str,
        limit: int = 10,
        threshold: float = 0.65,
    ) -> list:
        _emb = embedding
        _pid = page_id
        _lim = limit
        _thr = threshold
        result = await asyncio.to_thread(
            lambda: client.rpc(
                "match_notes_in_page",
                {
                    "query_embedding": _emb,
                    "target_page_id": _pid,
                    "match_threshold": _thr,
                    "match_count": _lim,
                },
            ).execute()
        )
        return result.data or []

    async def get_stuck_notes(self, older_than_minutes: int = 5) -> list:
        cutoff = (
            datetime.utcnow() - timedelta(minutes=older_than_minutes)
        ).isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("id, raw_text")
            .in_("processing_status", ["pending", "processing"])
            .lt("created_at", cutoff)
            .execute()
        )
        return result.data or []

    async def get_all_tags(self, user_id: str = None) -> list[str]:
        _uid = user_id

        def _query():
            q = client.table("notes").select("tags")
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        all_tags: set[str] = set()
        for note in (result.data or []):
            all_tags.update(note.get("tags") or [])
        return sorted(list(all_tags))

    async def get_all_tags_with_counts(self, user_id: str = None) -> list[dict]:
        _uid = user_id

        def _query():
            q = client.table("notes").select("tags")
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        counts: dict[str, int] = {}
        for note in (result.data or []):
            for tag in (note.get("tags") or []):
                counts[tag] = counts.get(tag, 0) + 1
        return sorted(
            [{"name": k, "count": v} for k, v in counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )

    async def get_notes_for_page(self, page_id: str, user_id: str = None) -> list:
        _pid = page_id
        _uid = user_id

        def _query():
            q = client.table("notes").select("*").eq("page_id", _pid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.order("created_at", desc=True).execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def get_notes_with_embeddings(self, page_id: str) -> list:
        _pid = page_id
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select(
                "id, title, tags, embedding, canvas_x, canvas_y, "
                "cluster_id, centrality, is_bridge, summary, raw_text"
            )
            .eq("page_id", _pid)
            .not_.is_("embedding", "null")
            .execute()
        )
        return result.data or []

    async def get_all_notes_with_embeddings(self) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("id, title, tags, embedding, page_id, summary, raw_text")
            .not_.is_("embedding", "null")
            .execute()
        )
        return result.data or []

    async def count_notes(self, page_id: str = None, user_id: str = None) -> int:
        _pid = page_id
        _uid = user_id

        def _query():
            q = client.table("notes").select("id", count="exact")
            if _pid:
                q = q.eq("page_id", _pid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.count or 0

    # ── Pages ─────────────────────────────────────────

    async def insert_page(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("pages").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_page(self, page_id: str, user_id: str = None, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()

        _uid = user_id
        _pid = page_id

        def _query():
            q = client.table("pages").update(updates).eq("id", _pid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(
            _query
        )
        return result.data[0] if result.data else {}

    async def get_page(self, page_id: str, user_id: str = None) -> dict | None:
        try:
            _uid = user_id
            _pid = page_id

            def _query():
                q = client.table("pages").select("*").eq("id", _pid)
                if _uid:
                    q = q.eq("user_id", _uid)
                return q.maybe_single().execute()

            result = await asyncio.to_thread(
                _query
            )
            return result.data
        except Exception:
            return None

    async def get_page_by_name(self, name: str, user_id: str = None) -> dict | None:
        _name = name
        _uid = user_id
        try:
            def _query():
                q = client.table("pages").select("*").ilike("name", _name)
                if _uid:
                    q = q.eq("user_id", _uid)
                return q.maybe_single().execute()

            result = await asyncio.to_thread(
                _query
            )
            return result.data if result else None
        except Exception:
            return None

    async def list_pages(self, include_archived: bool = False, user_id: str = None) -> list:
        _inc = include_archived
        _uid = user_id

        def _query():
            q = client.table("pages").select("*").order("last_activity", desc=True)
            if not _inc:
                q = q.eq("is_archived", False)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def delete_page(self, page_id: str, user_id: str = None) -> None:
        uncat = await self.get_page_by_name("Uncategorized", user_id=user_id)
        _pid = page_id
        _uid = user_id
        if uncat:
            _uncat_id = uncat["id"]
            def _move_notes_query():
                q = client.table("notes").update(
                    {
                        "page_id": _uncat_id,
                        "updated_at": datetime.utcnow().isoformat(),
                    }
                ).eq("page_id", _pid)
                if _uid:
                    q = q.eq("user_id", _uid)
                return q.execute()

            await asyncio.to_thread(
                _move_notes_query
            )

        def _delete_page_query():
            q = client.table("pages").delete().eq("id", _pid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        await asyncio.to_thread(
            _delete_page_query
        )

    async def get_page_canvas(self, page_id: str, user_id: str = None) -> dict:
        page = await self.get_page(page_id, user_id=user_id)
        if not page:
            return {
                "page": {},
                "canvas_data": {},
                "notes": [],
                "edges": [],
                "elements": [],
                "clusters": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            }

        _pid = page_id
        _uid = user_id

        def _notes_query():
            q = client.table("notes").select("*").eq("page_id", _pid)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.order("created_at", desc=True).execute()

        notes = await asyncio.to_thread(_notes_query)

        note_ids = [n["id"] for n in (notes.data or [])]

        edges_data: list[dict] = []
        if note_ids:
            _nids = note_ids
            edges_source = await asyncio.to_thread(
                lambda: client.table("note_edges")
                .select("*")
                .in_("source_id", _nids)
                .execute()
            )
            edges_target = await asyncio.to_thread(
                lambda: client.table("note_edges")
                .select("*")
                .in_("target_id", _nids)
                .execute()
            )
            seen: set[str] = set()
            for e in (edges_source.data or []) + (edges_target.data or []):
                if e["id"] not in seen:
                    seen.add(e["id"])
                    edges_data.append(e)

        elements = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .select("*")
            .eq("page_id", _pid)
            .execute()
        )

        clusters = await asyncio.to_thread(
            lambda: client.table("clusters")
            .select("*")
            .eq("page_id", _pid)
            .execute()
        )

        return {
            "page": page,
            "canvas_data": page.get("canvas_data") or {},
            "notes": notes.data or [],
            "edges": edges_data,
            "elements": elements.data or [],
            "clusters": clusters.data or [],
            "viewport": page.get("viewport") or {"x": 0, "y": 0, "zoom": 1},
        }

    async def increment_page_note_count(self, page_id: str, user_id: str = None) -> None:
        page = await self.get_page(page_id, user_id=user_id)
        if page:
            new_count = (page.get("note_count") or 0) + 1
            await self.update_page(
                page_id,
                user_id=user_id,
                note_count=new_count,
                last_activity=datetime.utcnow().isoformat(),
            )

    async def decrement_page_note_count(self, page_id: str, user_id: str = None) -> None:
        page = await self.get_page(page_id, user_id=user_id)
        if page:
            new_count = max((page.get("note_count") or 0) - 1, 0)
            await self.update_page(page_id, user_id=user_id, note_count=new_count)

    # ── Edges ─────────────────────────────────────────

    async def insert_edge(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("note_edges").insert(kwargs).execute()
        )
        return result.data[0]

    async def delete_edge(self, edge_id: str) -> None:
        _eid = edge_id
        await asyncio.to_thread(
            lambda: client.table("note_edges")
            .delete()
            .eq("id", _eid)
            .execute()
        )

    async def get_edges_for_note(self, note_id: str) -> list:
        _nid = note_id
        source = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .eq("source_id", _nid)
            .execute()
        )
        target = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .eq("target_id", _nid)
            .execute()
        )
        seen: set[str] = set()
        edges: list[dict] = []
        for e in (source.data or []) + (target.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    async def get_edges_for_page(self, page_id: str) -> list:
        _pid = page_id
        note_ids_result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("id")
            .eq("page_id", _pid)
            .execute()
        )
        note_ids = [n["id"] for n in (note_ids_result.data or [])]
        if not note_ids:
            return []

        _nids = note_ids
        source = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .in_("source_id", _nids)
            .execute()
        )
        target = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .in_("target_id", _nids)
            .execute()
        )
        seen: set[str] = set()
        edges: list[dict] = []
        for e in (source.data or []) + (target.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    async def list_edges(
        self, page_id: str = None, note_id: str = None
    ) -> list:
        if note_id:
            return await self.get_edges_for_note(note_id)
        if page_id:
            return await self.get_edges_for_page(page_id)
        result = await asyncio.to_thread(
            lambda: client.table("note_edges").select("*").execute()
        )
        return result.data or []

    async def edge_exists(self, source_id: str, target_id: str) -> bool:
        _sid = source_id
        _tid = target_id
        r1 = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("id")
            .eq("source_id", _sid)
            .eq("target_id", _tid)
            .limit(1)
            .execute()
        )
        if r1.data:
            return True
        r2 = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("id")
            .eq("source_id", _tid)
            .eq("target_id", _sid)
            .limit(1)
            .execute()
        )
        return bool(r2.data)

    async def get_all_edges(self, user_id: str = None) -> list:
        if not user_id:
            result = await asyncio.to_thread(
                lambda: client.table("note_edges").select("*").execute()
            )
            return result.data or []

        _uid = user_id

        notes_result = await asyncio.to_thread(
            lambda: client.table("notes").select("id").eq("user_id", _uid).execute()
        )
        note_ids = [n["id"] for n in (notes_result.data or [])]
        if not note_ids:
            return []

        _nids = note_ids
        source = await asyncio.to_thread(
            lambda: client.table("note_edges").select("*").in_("source_id", _nids).execute()
        )
        target = await asyncio.to_thread(
            lambda: client.table("note_edges").select("*").in_("target_id", _nids).execute()
        )
        seen: set[str] = set()
        edges: list[dict] = []
        for e in (source.data or []) + (target.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    # ── Clusters ──────────────────────────────────────

    async def insert_cluster(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("clusters").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_cluster(self, cluster_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()
        _cid = cluster_id
        result = await asyncio.to_thread(
            lambda: client.table("clusters")
            .update(updates)
            .eq("id", _cid)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def list_clusters(self, page_id: str = None) -> list:
        _pid = page_id

        def _query():
            q = client.table("clusters").select("*")
            if _pid:
                q = q.eq("page_id", _pid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def delete_cluster(self, cluster_id: str) -> None:
        _cid = cluster_id
        await asyncio.to_thread(
            lambda: client.table("notes")
            .update(
                {"cluster_id": None, "updated_at": datetime.utcnow().isoformat()}
            )
            .eq("cluster_id", _cid)
            .execute()
        )
        await asyncio.to_thread(
            lambda: client.table("clusters")
            .delete()
            .eq("id", _cid)
            .execute()
        )

    async def delete_clusters_for_page(self, page_id: str) -> None:
        _pid = page_id
        notes = await self.get_notes_for_page(_pid)
        for n in notes:
            if n.get("cluster_id"):
                await self.update_note(n["id"], cluster_id=None)
        await asyncio.to_thread(
            lambda: client.table("clusters")
            .delete()
            .eq("page_id", _pid)
            .execute()
        )

    # ── Canvas Elements ───────────────────────────────

    async def insert_element(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("canvas_elements").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_element(self, element_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()
        _eid = element_id
        result = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .update(updates)
            .eq("id", _eid)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def get_element(self, element_id: str) -> dict | None:
        _eid = element_id
        try:
            result = await asyncio.to_thread(
                lambda: client.table("canvas_elements")
                .select("*")
                .eq("id", _eid)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def list_elements(self, page_id: str) -> list:
        _pid = page_id
        result = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .select("*")
            .eq("page_id", _pid)
            .execute()
        )
        return result.data or []

    async def delete_element(self, element_id: str) -> None:
        _eid = element_id
        await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .delete()
            .eq("id", _eid)
            .execute()
        )

    # ── Chat History ──────────────────────────────────

    async def insert_chat(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("chat_history").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_chat(self, chat_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()
        _cid = chat_id
        result = await asyncio.to_thread(
            lambda: client.table("chat_history")
            .update(updates)
            .eq("id", _cid)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def list_chats(self, limit: int = 20, user_id: str = None) -> list:
        _lim = limit
        _uid = user_id

        def _query():
            q = client.table("chat_history").select("*").order("updated_at", desc=True).limit(_lim)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def get_chat(self, chat_id: str) -> dict | None:
        _cid = chat_id
        try:
            result = await asyncio.to_thread(
                lambda: client.table("chat_history")
                .select("*")
                .eq("id", _cid)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def delete_chat(self, chat_id: str) -> None:
        _cid = chat_id
        await asyncio.to_thread(
            lambda: client.table("chat_history")
            .delete()
            .eq("id", _cid)
            .execute()
        )

    # ── Users ─────────────────────────────────────────

    async def upsert_user(
        self,
        google_id: str,
        email: str,
        name: str = None,
        avatar_url: str = None,
    ) -> dict:
        _gid = google_id
        _email = email
        _name = name
        _avatar = avatar_url

        # Check if user exists
        existing = await asyncio.to_thread(
            lambda: client.table("users")
            .select("*")
            .eq("google_id", _gid)
            .maybe_single()
            .execute()
        )

        if existing and existing.data:
            # Update existing
            user_id = existing.data["id"]
            updates = {"updated_at": datetime.utcnow().isoformat()}
            if _name:
                updates["name"] = _name
            if _avatar:
                updates["avatar_url"] = _avatar
            if _email:
                updates["email"] = _email
            _uid = user_id
            result = await asyncio.to_thread(
                lambda: client.table("users")
                .update(updates)
                .eq("id", _uid)
                .execute()
            )
            return result.data[0] if result.data else existing.data
        else:
            # Insert new
            result = await asyncio.to_thread(
                lambda: client.table("users")
                .insert({
                    "google_id": _gid,
                    "email": _email,
                    "name": _name,
                    "avatar_url": _avatar,
                })
                .execute()
            )
            return result.data[0]

    async def get_user(self, user_id: str) -> dict | None:
        _uid = user_id
        try:
            result = await asyncio.to_thread(
                lambda: client.table("users")
                .select("*")
                .eq("id", _uid)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def get_user_by_google_id(self, google_id: str) -> dict | None:
        _gid = google_id
        try:
            result = await asyncio.to_thread(
                lambda: client.table("users")
                .select("*")
                .eq("google_id", _gid)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    # ── Settings ──────────────────────────────────────

    async def get_settings(self, user_id: str = None) -> dict | None:
        _uid = user_id
        try:
            def _query():
                q = client.table("settings").select("*")
                if _uid:
                    q = q.eq("user_id", _uid)
                else:
                    q = q.is_("user_id", "null")
                return q.maybe_single().execute()

            result = await asyncio.to_thread(_query)
            return result.data
        except Exception:
            return None

    async def upsert_settings(self, user_id: str = None, **kwargs) -> dict:
        _uid = user_id
        existing = await self.get_settings(user_id=user_id)

        updates = {k: v for k, v in kwargs.items() if v is not None}
        updates["updated_at"] = datetime.utcnow().isoformat()

        if existing:
            _eid = existing["id"]
            result = await asyncio.to_thread(
                lambda: client.table("settings")
                .update(updates)
                .eq("id", _eid)
                .execute()
            )
            return result.data[0] if result.data else existing
        else:
            insert_data = {**updates}
            if _uid:
                insert_data["user_id"] = _uid
            result = await asyncio.to_thread(
                lambda: client.table("settings")
                .insert(insert_data)
                .execute()
            )
            return result.data[0]

    # ── Agent Runs ────────────────────────────────────

    async def insert_agent_run(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("agent_runs").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_agent_run(self, run_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        _rid = run_id
        result = await asyncio.to_thread(
            lambda: client.table("agent_runs")
            .update(updates)
            .eq("id", _rid)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def list_agent_runs(self, agent_type: str = None, limit: int = 20) -> list:
        _at = agent_type
        _lim = limit

        def _query():
            q = client.table("agent_runs").select("*").order("started_at", desc=True).limit(_lim)
            if _at:
                q = q.eq("agent_type", _at)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    # ── Stats ─────────────────────────────────────────

    async def get_global_stats(self, user_id: str = None) -> dict:
        _uid = user_id

        def _notes_query():
            q = client.table("notes").select("processing_status, tags, tasks, created_at", count="exact")
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        def _pages_query():
            q = client.table("pages").select("id", count="exact").eq("is_archived", False)
            if _uid:
                q = q.eq("user_id", _uid)
            return q.execute()

        notes_result = await asyncio.to_thread(_notes_query)
        pages_result = await asyncio.to_thread(_pages_query)

        total_notes = notes_result.count or 0
        total_pages = pages_result.count or 0

        all_tags: set[str] = set()
        total_tasks = 0
        status_counts: dict[str, int] = {}
        last_capture: str | None = None

        for note in (notes_result.data or []):
            all_tags.update(note.get("tags") or [])
            total_tasks += len(note.get("tasks") or [])
            status = note.get("processing_status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            created = note.get("created_at")
            if created and (last_capture is None or created > last_capture):
                last_capture = created

        return {
            "total_notes": total_notes,
            "total_pages": total_pages,
            "total_tags": len(all_tags),
            "total_tasks": total_tasks,
            "status_counts": status_counts,
            "last_capture": last_capture,
        }

    async def get_page_stats(self, page_id: str) -> dict:
        _pid = page_id
        notes = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("tags", count="exact")
            .eq("page_id", _pid)
            .execute()
        )

        edges = await self.get_edges_for_page(page_id)

        clusters = await asyncio.to_thread(
            lambda: client.table("clusters")
            .select("id", count="exact")
            .eq("page_id", _pid)
            .execute()
        )

        elements = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .select("id", count="exact")
            .eq("page_id", _pid)
            .execute()
        )

        tag_counts: dict[str, int] = {}
        for note in (notes.data or []):
            for tag in (note.get("tags") or []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

        return {
            "note_count": notes.count or 0,
            "edge_count": len(edges),
            "cluster_count": clusters.count or 0,
            "element_count": elements.count or 0,
            "tags": sorted(
                [{"name": k, "count": v} for k, v in tag_counts.items()],
                key=lambda x: x["count"],
                reverse=True,
            ),
        }


db = NotesDB()