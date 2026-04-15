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
        updated = result.data[0] if result.data else {}

        # Centralized cache invalidation so all write paths (routes/services/agents)
        # keep page + canvas reads fresh.
        if updated:
            try:
                from app.services import cache as cache_svc

                await cache_svc.invalidate_page(page_id)
                if any(key in updates for key in ["name", "description", "icon", "color", "is_archived", "last_activity", "note_count"]):
                    await cache_svc.invalidate_overview()
            except Exception:
                pass

        return updated

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

    async def get_page_canvas(self, page_id: str, user_id: str = None, view_mode: str = "canvas") -> dict:
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

        preferred_scene_key = "notebook_data" if view_mode == "notebook" else "canvas_data"
        scene_data = page.get(preferred_scene_key) or {}

        # Backward-compatible read path: if notebook scene hasn't been persisted yet,
        # use the canvas scene so existing pages still render content in notebook mode.
        if view_mode == "notebook":
            has_notebook_elements = (
                isinstance(scene_data, dict)
                and isinstance(scene_data.get("elements"), list)
                and len(scene_data.get("elements") or []) > 0
            )
            if not has_notebook_elements:
                scene_data = page.get("canvas_data") or {}

        return {
            "page": page,
            "canvas_data": scene_data,
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

    # ── Document Flow Blocks ─────────────────────────

    async def ensure_page_document(self, page_id: str, user_id: str = None) -> dict | None:
        page = await self.get_page(page_id, user_id=user_id)
        if not page:
            return None

        _pid = page_id
        existing = await asyncio.to_thread(
            lambda: client.table("page_documents")
            .select("*")
            .eq("page_id", _pid)
            .maybe_single()
            .execute()
        )
        if existing and existing.data:
            return existing.data

        result = await asyncio.to_thread(
            lambda: client.table("page_documents")
            .insert(
                {
                    "page_id": _pid,
                    "user_id": page.get("user_id"),
                    "content_width": page.get("content_width") or 840,
                }
            )
            .execute()
        )
        return result.data[0] if result.data else None

    async def update_page_document(self, page_id: str, user_id: str = None, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}

        existing = await self.ensure_page_document(page_id, user_id=user_id)
        if not existing:
            return {}

        updates["updated_at"] = datetime.utcnow().isoformat()
        _pid = page_id

        result = await asyncio.to_thread(
            lambda: client.table("page_documents")
            .update(updates)
            .eq("page_id", _pid)
            .execute()
        )
        updated = result.data[0] if result.data else {}

        # Keep page-level width aligned with document width for viewport/layout APIs.
        if "content_width" in updates:
            try:
                await self.update_page(page_id, user_id=user_id, content_width=updates["content_width"])
            except Exception:
                pass

        return updated

    async def list_page_blocks(self, page_id: str, include_deleted: bool = False) -> list:
        _pid = page_id
        _inc = include_deleted

        def _query():
            q = client.table("page_blocks").select("*").eq("page_id", _pid).order("order_key")
            if not _inc:
                q = q.eq("is_deleted", False)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def get_page_block(self, block_id: str) -> dict | None:
        _bid = block_id
        try:
            result = await asyncio.to_thread(
                lambda: client.table("page_blocks")
                .select("*")
                .eq("id", _bid)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def get_next_block_order_key(
        self,
        page_id: str,
        prev_block_id: str | None = None,
        next_block_id: str | None = None,
    ) -> float:
        _pid = page_id
        _prev = prev_block_id
        _next = next_block_id

        try:
            result = await asyncio.to_thread(
                lambda: client.rpc(
                    "mnemos_next_order_key",
                    {
                        "p_page_id": _pid,
                        "p_prev_block_id": _prev,
                        "p_next_block_id": _next,
                    },
                ).execute()
            )
            if result and result.data is not None:
                if isinstance(result.data, list) and result.data:
                    return float(result.data[0])
                return float(result.data)
        except Exception:
            pass

        blocks = await self.list_page_blocks(page_id, include_deleted=True)
        by_id = {str(b.get("id")): b for b in blocks if b.get("id") is not None}

        prev_key = None
        next_key = None
        if _prev and _prev in by_id:
            prev_key = float(by_id[_prev].get("order_key") or 0)
        if _next and _next in by_id:
            next_key = float(by_id[_next].get("order_key") or 0)

        if prev_key is None and next_key is None:
            max_key = max((float(b.get("order_key") or 0) for b in blocks), default=0.0)
            return max_key + 1000.0
        if prev_key is None:
            return float(next_key) - 1000.0
        if next_key is None:
            return float(prev_key) + 1000.0
        if next_key <= prev_key:
            return float(prev_key) + 0.000001
        return (float(prev_key) + float(next_key)) / 2.0

    async def rebalance_page_blocks(self, page_id: str) -> None:
        _pid = page_id
        try:
            await asyncio.to_thread(
                lambda: client.rpc(
                    "mnemos_rebalance_page_blocks",
                    {"p_page_id": _pid},
                ).execute()
            )
            return
        except Exception:
            pass

        # Fallback if RPC is unavailable: deterministic reindex in application layer.
        blocks = await self.list_page_blocks(page_id, include_deleted=True)
        for idx, block in enumerate(blocks, start=1):
            await asyncio.to_thread(
                lambda bid=block["id"], key=float(idx * 1000): client.table("page_blocks")
                .update({"order_key": key, "updated_at": datetime.utcnow().isoformat()})
                .eq("id", bid)
                .execute()
            )

    async def move_page_block(
        self,
        block_id: str,
        prev_block_id: str | None = None,
        next_block_id: str | None = None,
        order_key: float | None = None,
    ) -> dict:
        existing = await self.get_page_block(block_id)
        if not existing:
            return {}

        page_id = existing.get("page_id")
        if not page_id:
            return {}

        if order_key is None:
            order_key = await self.get_next_block_order_key(
                str(page_id),
                prev_block_id=prev_block_id,
                next_block_id=next_block_id,
            )

        # If order keys are too dense, rebalance then recompute.
        if prev_block_id and next_block_id:
            blocks = {str(b.get("id")): b for b in await self.list_page_blocks(str(page_id), include_deleted=True)}
            prev_key = float((blocks.get(str(prev_block_id)) or {}).get("order_key") or 0)
            next_key = float((blocks.get(str(next_block_id)) or {}).get("order_key") or 0)
            if next_key > prev_key and (next_key - prev_key) < 0.00001:
                await self.rebalance_page_blocks(str(page_id))
                order_key = await self.get_next_block_order_key(
                    str(page_id),
                    prev_block_id=prev_block_id,
                    next_block_id=next_block_id,
                )

        return await self.update_page_block(block_id, order_key=order_key)

    async def insert_page_block(self, **kwargs) -> dict:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        page_id = payload.get("page_id")
        if not page_id:
            raise ValueError("page_id is required")

        await self.ensure_page_document(page_id)

        prev_block_id = payload.pop("prev_block_id", None)
        next_block_id = payload.pop("next_block_id", None)

        if payload.get("order_key") is None:
            payload["order_key"] = await self.get_next_block_order_key(
                page_id,
                prev_block_id=prev_block_id,
                next_block_id=next_block_id,
            )

        result = await asyncio.to_thread(
            lambda: client.table("page_blocks").insert(payload).execute()
        )
        return result.data[0]

    async def update_page_block(self, block_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}

        existing = await self.get_page_block(block_id)
        if not existing:
            return {}

        version_sensitive_keys = {
            "text_content",
            "attrs",
            "metadata",
            "provenance",
            "line_start",
            "line_end",
            "char_start",
            "char_end",
            "block_type",
        }
        if any(k in updates for k in version_sensitive_keys):
            updates["version"] = int(existing.get("version") or 1) + 1

        updates["updated_at"] = datetime.utcnow().isoformat()
        _bid = block_id
        result = await asyncio.to_thread(
            lambda: client.table("page_blocks")
            .update(updates)
            .eq("id", _bid)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def delete_page_block(self, block_id: str, hard_delete: bool = False) -> None:
        _bid = block_id
        if hard_delete:
            await asyncio.to_thread(
                lambda: client.table("page_blocks")
                .delete()
                .eq("id", _bid)
                .execute()
            )
            return

        await asyncio.to_thread(
            lambda: client.table("page_blocks")
            .update(
                {
                    "is_deleted": True,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )
            .eq("id", _bid)
            .execute()
        )

    async def list_block_references(self, page_id: str, block_id: str = None) -> list:
        _pid = page_id
        _bid = block_id

        def _query():
            q = client.table("block_references").select("*").eq("page_id", _pid).order("created_at")
            if _bid:
                q = q.eq("block_id", _bid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def insert_block_reference(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("block_references").insert(kwargs).execute()
        )
        return result.data[0]

    async def delete_block_reference(self, reference_id: str) -> None:
        _rid = reference_id
        await asyncio.to_thread(
            lambda: client.table("block_references")
            .delete()
            .eq("id", _rid)
            .execute()
        )

    async def list_inline_embeds(self, page_id: str, block_id: str = None) -> list:
        _pid = page_id
        _bid = block_id

        def _query():
            q = client.table("inline_embeds").select("*").eq("page_id", _pid).order("created_at")
            if _bid:
                q = q.eq("block_id", _bid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def insert_inline_embed(self, **kwargs) -> dict:
        self._validate_inline_embed_targets(kwargs)
        result = await asyncio.to_thread(
            lambda: client.table("inline_embeds").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_inline_embed(self, embed_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}

        existing = await asyncio.to_thread(
            lambda: client.table("inline_embeds")
            .select("*")
            .eq("id", embed_id)
            .maybe_single()
            .execute()
        )
        merged = dict(existing.data or {})
        merged.update(updates)
        self._validate_inline_embed_targets(merged)

        updates["updated_at"] = datetime.utcnow().isoformat()

        _eid = embed_id
        result = await asyncio.to_thread(
            lambda: client.table("inline_embeds")
            .update(updates)
            .eq("id", _eid)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def delete_inline_embed(self, embed_id: str) -> None:
        _eid = embed_id
        await asyncio.to_thread(
            lambda: client.table("inline_embeds")
            .delete()
            .eq("id", _eid)
            .execute()
        )

    async def list_canvas_bindings(
        self,
        page_id: str,
        block_id: str = None,
        element_id: str = None,
    ) -> list:
        _pid = page_id
        _bid = block_id
        _eid = element_id

        def _query():
            q = client.table("canvas_bindings").select("*").eq("page_id", _pid).order("created_at")
            if _bid:
                q = q.eq("block_id", _bid)
            if _eid:
                q = q.eq("element_id", _eid)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def get_canvas_binding(self, binding_id: str) -> dict | None:
        _id = binding_id
        try:
            result = await asyncio.to_thread(
                lambda: client.table("canvas_bindings")
                .select("*")
                .eq("id", _id)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def insert_canvas_binding(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("canvas_bindings").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_canvas_binding(self, binding_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()

        _id = binding_id
        result = await asyncio.to_thread(
            lambda: client.table("canvas_bindings")
            .update(updates)
            .eq("id", _id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def delete_canvas_binding(self, binding_id: str) -> None:
        _id = binding_id
        await asyncio.to_thread(
            lambda: client.table("canvas_bindings")
            .delete()
            .eq("id", _id)
            .execute()
        )

    def _validate_inline_embed_targets(self, payload: dict) -> None:
        target_keys = [
            "target_page_id",
            "target_note_id",
            "target_block_id",
            "target_element_id",
            "url",
        ]
        count = sum(1 for key in target_keys if payload.get(key))
        if count == 0:
            raise ValueError("inline embed requires one target: page/note/block/element/url")
        if count > 1:
            raise ValueError("inline embed must point to exactly one target")

    async def insert_page_revision(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("page_revisions").insert(kwargs).execute()
        )
        return result.data[0]

    async def list_page_revisions(self, page_id: str, limit: int = 20) -> list:
        _pid = page_id
        _lim = limit
        result = await asyncio.to_thread(
            lambda: client.table("page_revisions")
            .select("*")
            .eq("page_id", _pid)
            .order("created_at", desc=True)
            .limit(_lim)
            .execute()
        )
        return result.data or []

    async def insert_page_operation_log(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("page_operation_log").insert(kwargs).execute()
        )
        return result.data[0]

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