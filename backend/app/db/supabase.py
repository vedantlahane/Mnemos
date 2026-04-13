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

    async def update_note(self, note_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .update(updates)
            .eq("id", note_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def get_note(self, note_id: str) -> dict | None:
        try:
            result = await asyncio.to_thread(
                lambda: client.table("notes")
                .select("*")
                .eq("id", note_id)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def list_notes(
        self, page: int = 1, limit: int = 20, tag: str = None, page_id: str = None
    ) -> dict:
        _tag = tag
        _page_id = page_id
        _page = page
        _limit = limit

        def _query():
            q = client.table("notes").select("*", count="exact")
            if _tag:
                q = q.contains("tags", [_tag])
            if _page_id:
                q = q.eq("page_id", _page_id)
            q = q.order("created_at", desc=True)
            q = q.range((_page - 1) * _limit, _page * _limit - 1)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return {"notes": result.data or [], "total": result.count or 0}

    async def delete_note(self, note_id: str) -> None:
        await asyncio.to_thread(
            lambda: client.table("notes")
            .delete()
            .eq("id", note_id)
            .execute()
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

    async def get_all_tags(self) -> list[str]:
        result = await asyncio.to_thread(
            lambda: client.table("notes").select("tags").execute()
        )
        all_tags: set[str] = set()
        for note in (result.data or []):
            all_tags.update(note.get("tags") or [])
        return sorted(list(all_tags))

    async def get_all_tags_with_counts(self) -> list[dict]:
        result = await asyncio.to_thread(
            lambda: client.table("notes").select("tags").execute()
        )
        counts: dict[str, int] = {}
        for note in (result.data or []):
            for tag in (note.get("tags") or []):
                counts[tag] = counts.get(tag, 0) + 1
        return sorted(
            [{"name": k, "count": v} for k, v in counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )

    async def get_notes_for_page(self, page_id: str) -> list:
        _pid = page_id
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("*")
            .eq("page_id", _pid)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    async def get_notes_with_embeddings(self, page_id: str) -> list:
        _pid = page_id
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select(
                "id, title, tags, embedding, canvas_x, canvas_y, cluster_id, centrality, is_bridge"
            )
            .eq("page_id", _pid)
            .not_.is_("embedding", "null")
            .execute()
        )
        return result.data or []

    # ── Pages ─────────────────────────────────────────

    async def insert_page(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("pages").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_page(self, page_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("pages")
            .update(updates)
            .eq("id", page_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def get_page(self, page_id: str) -> dict | None:
        try:
            result = await asyncio.to_thread(
                lambda: client.table("pages")
                .select("*")
                .eq("id", page_id)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def get_page_by_name(self, name: str) -> dict | None:
        _name = name
        try:
            result = await asyncio.to_thread(
                lambda: client.table("pages")
                .select("*")
                .ilike("name", _name)
                .maybe_single()
                .execute()
            )
            return result.data if result else None
        except Exception:
            return None

    async def list_pages(self, include_archived: bool = False) -> list:
        _inc = include_archived

        def _query():
            q = client.table("pages").select("*").order("last_activity", desc=True)
            if not _inc:
                q = q.eq("is_archived", False)
            return q.execute()

        result = await asyncio.to_thread(_query)
        return result.data or []

    async def delete_page(self, page_id: str) -> None:
        uncat = await self.get_page_by_name("Uncategorized")
        _pid = page_id
        if uncat:
            _uncat_id = uncat["id"]
            await asyncio.to_thread(
                lambda: client.table("notes")
                .update(
                    {
                        "page_id": _uncat_id,
                        "updated_at": datetime.utcnow().isoformat(),
                    }
                )
                .eq("page_id", _pid)
                .execute()
            )
        await asyncio.to_thread(
            lambda: client.table("pages").delete().eq("id", _pid).execute()
        )

    async def get_page_canvas(self, page_id: str) -> dict:
        page = await self.get_page(page_id)
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
        notes = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("*")
            .eq("page_id", _pid)
            .order("created_at", desc=True)
            .execute()
        )

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

    async def increment_page_note_count(self, page_id: str) -> None:
        page = await self.get_page(page_id)
        if page:
            new_count = (page.get("note_count") or 0) + 1
            await self.update_page(
                page_id,
                note_count=new_count,
                last_activity=datetime.utcnow().isoformat(),
            )

    async def decrement_page_note_count(self, page_id: str) -> None:
        page = await self.get_page(page_id)
        if page:
            new_count = max((page.get("note_count") or 0) - 1, 0)
            await self.update_page(page_id, note_count=new_count)

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

    async def get_all_edges(self) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("note_edges").select("*").execute()
        )
        return result.data or []

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
        # First unset cluster_id on notes
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

    async def list_chats(self, limit: int = 20) -> list:
        _lim = limit
        result = await asyncio.to_thread(
            lambda: client.table("chat_history")
            .select("*")
            .order("updated_at", desc=True)
            .limit(_lim)
            .execute()
        )
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

    # ── Stats ─────────────────────────────────────────

    async def get_global_stats(self) -> dict:
        notes_result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("processing_status, tags, tasks, created_at", count="exact")
            .execute()
        )

        pages_result = await asyncio.to_thread(
            lambda: client.table("pages")
            .select("id", count="exact")
            .eq("is_archived", False)
            .execute()
        )

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