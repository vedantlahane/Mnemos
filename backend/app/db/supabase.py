import asyncio
from datetime import datetime, timedelta
from supabase import create_client
from app.config import settings

client = create_client(settings.supabase_url, settings.supabase_key)


class NotesDB:

    # ── Notes (existing, modified) ────────────────────

    async def insert_note(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("notes").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_note(self, note_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .update(updates)
            .eq("id", note_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def get_note(self, note_id: str) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("*")
            .eq("id", note_id)
            .single()
            .execute()
        )
        return result.data

    async def list_notes(
        self, page: int = 1, limit: int = 20, tag: str = None, page_id: str = None
    ) -> dict:
        def _query():
            query = client.table("notes").select("*", count="exact")
            if tag:
                query = query.contains("tags", [tag])
            if page_id:
                query = query.eq("page_id", page_id)
            query = query.order("created_at", desc=True)
            query = query.range((page - 1) * limit, page * limit - 1)
            return query.execute()

        result = await asyncio.to_thread(_query)
        return {"notes": result.data, "total": result.count}

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
        result = await asyncio.to_thread(
            lambda: client.rpc(
                "match_notes",
                {
                    "query_embedding": embedding,
                    "match_threshold": threshold,
                    "match_count": limit,
                },
            ).execute()
        )
        return result.data

    async def vector_search_in_page(
        self,
        embedding: list,
        page_id: str,
        limit: int = 10,
        threshold: float = 0.65,
    ) -> list:
        result = await asyncio.to_thread(
            lambda: client.rpc(
                "match_notes_in_page",
                {
                    "query_embedding": embedding,
                    "target_page_id": page_id,
                    "match_threshold": threshold,
                    "match_count": limit,
                },
            ).execute()
        )
        return result.data

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
        return result.data

    async def get_all_tags(self) -> list[str]:
        result = await asyncio.to_thread(
            lambda: client.table("notes").select("tags").execute()
        )
        all_tags = set()
        for note in result.data:
            all_tags.update(note.get("tags", []))
        return sorted(list(all_tags))

    async def get_all_tags_with_counts(self) -> list[dict]:
        result = await asyncio.to_thread(
            lambda: client.table("notes").select("tags").execute()
        )
        counts = {}
        for note in result.data:
            for tag in note.get("tags", []):
                counts[tag] = counts.get(tag, 0) + 1
        return sorted(
            [{"name": k, "count": v} for k, v in counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )

    async def get_notes_for_page(self, page_id: str) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("*")
            .eq("page_id", page_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data

    async def get_notes_with_embeddings(self, page_id: str) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("id, title, tags, embedding, canvas_x, canvas_y, cluster_id, centrality, is_bridge")
            .eq("page_id", page_id)
            .not_.is_("embedding", "null")
            .execute()
        )
        return result.data

    # ── Pages ─────────────────────────────────────────

    async def insert_page(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("pages").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_page(self, page_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("pages")
            .update(updates)
            .eq("id", page_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def get_page(self, page_id: str) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("pages")
            .select("*")
            .eq("id", page_id)
            .single()
            .execute()
        )
        return result.data

    async def get_page_by_name(self, name: str) -> dict | None:
        result = await asyncio.to_thread(
            lambda: client.table("pages")
            .select("*")
            .ilike("name", name)
            .maybe_single()
            .execute()
        )
        return result.data

    async def list_pages(self, include_archived: bool = False) -> list:
        def _query():
            query = client.table("pages").select("*").order("last_activity", desc=True)
            if not include_archived:
                query = query.eq("is_archived", False)
            return query.execute()

        result = await asyncio.to_thread(_query)
        return result.data

    async def delete_page(self, page_id: str) -> None:
        uncat = await self.get_page_by_name("Uncategorized")
        if uncat:
            await asyncio.to_thread(
                lambda: client.table("notes")
                .update({"page_id": uncat["id"], "updated_at": datetime.utcnow().isoformat()})
                .eq("page_id", page_id)
                .execute()
            )
        await asyncio.to_thread(
            lambda: client.table("pages").delete().eq("id", page_id).execute()
        )

    async def get_page_canvas(self, page_id: str) -> dict:
        page = await self.get_page(page_id)

        notes = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("*")
            .eq("page_id", page_id)
            .order("created_at", desc=True)
            .execute()
        )

        note_ids = [n["id"] for n in notes.data]

        edges_data = []
        if note_ids:
            edges_source = await asyncio.to_thread(
                lambda: client.table("note_edges")
                .select("*")
                .in_("source_id", note_ids)
                .execute()
            )
            edges_target = await asyncio.to_thread(
                lambda: client.table("note_edges")
                .select("*")
                .in_("target_id", note_ids)
                .execute()
            )
            seen = set()
            for e in edges_source.data + edges_target.data:
                if e["id"] not in seen:
                    seen.add(e["id"])
                    edges_data.append(e)

        elements = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .select("*")
            .eq("page_id", page_id)
            .execute()
        )

        clusters = await asyncio.to_thread(
            lambda: client.table("clusters")
            .select("*")
            .eq("page_id", page_id)
            .execute()
        )

        return {
            "page": page,
            "notes": notes.data,
            "edges": edges_data,
            "elements": elements.data,
            "clusters": clusters.data,
            "viewport": page.get("viewport", {"x": 0, "y": 0, "zoom": 1}),
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
        await asyncio.to_thread(
            lambda: client.table("note_edges")
            .delete()
            .eq("id", edge_id)
            .execute()
        )

    async def get_edges_for_note(self, note_id: str) -> list:
        source = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .eq("source_id", note_id)
            .execute()
        )
        target = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .eq("target_id", note_id)
            .execute()
        )
        seen = set()
        edges = []
        for e in source.data + target.data:
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    async def get_edges_for_page(self, page_id: str) -> list:
        note_ids_result = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("id")
            .eq("page_id", page_id)
            .execute()
        )
        note_ids = [n["id"] for n in note_ids_result.data]
        if not note_ids:
            return []

        source = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .in_("source_id", note_ids)
            .execute()
        )
        target = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("*")
            .in_("target_id", note_ids)
            .execute()
        )
        seen = set()
        edges = []
        for e in source.data + target.data:
            if e["id"] not in seen:
                seen.add(e["id"])
                edges.append(e)
        return edges

    async def list_edges(self, page_id: str = None, note_id: str = None) -> list:
        if note_id:
            return await self.get_edges_for_note(note_id)
        if page_id:
            return await self.get_edges_for_page(page_id)
        result = await asyncio.to_thread(
            lambda: client.table("note_edges").select("*").execute()
        )
        return result.data

    async def edge_exists(self, source_id: str, target_id: str) -> bool:
        r1 = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("id")
            .eq("source_id", source_id)
            .eq("target_id", target_id)
            .execute()
        )
        if r1.data:
            return True
        r2 = await asyncio.to_thread(
            lambda: client.table("note_edges")
            .select("id")
            .eq("source_id", target_id)
            .eq("target_id", source_id)
            .execute()
        )
        return bool(r2.data)

    async def get_all_edges(self) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("note_edges").select("*").execute()
        )
        return result.data

    # ── Clusters ──────────────────────────────────────

    async def insert_cluster(self, **kwargs) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("clusters").insert(kwargs).execute()
        )
        return result.data[0]

    async def update_cluster(self, cluster_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("clusters")
            .update(updates)
            .eq("id", cluster_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def list_clusters(self, page_id: str = None) -> list:
        def _query():
            query = client.table("clusters").select("*")
            if page_id:
                query = query.eq("page_id", page_id)
            return query.execute()

        result = await asyncio.to_thread(_query)
        return result.data

    async def delete_cluster(self, cluster_id: str) -> None:
        await asyncio.to_thread(
            lambda: client.table("notes")
            .update({"cluster_id": None, "updated_at": datetime.utcnow().isoformat()})
            .eq("cluster_id", cluster_id)
            .execute()
        )
        await asyncio.to_thread(
            lambda: client.table("clusters")
            .delete()
            .eq("id", cluster_id)
            .execute()
        )

    async def delete_clusters_for_page(self, page_id: str) -> None:
        await asyncio.to_thread(
            lambda: client.table("clusters")
            .delete()
            .eq("page_id", page_id)
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
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .update(updates)
            .eq("id", element_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def list_elements(self, page_id: str) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .select("*")
            .eq("page_id", page_id)
            .execute()
        )
        return result.data

    async def delete_element(self, element_id: str) -> None:
        await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .delete()
            .eq("id", element_id)
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
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = await asyncio.to_thread(
            lambda: client.table("chat_history")
            .update(updates)
            .eq("id", chat_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    async def list_chats(self, limit: int = 20) -> list:
        result = await asyncio.to_thread(
            lambda: client.table("chat_history")
            .select("*")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data

    async def get_chat(self, chat_id: str) -> dict:
        result = await asyncio.to_thread(
            lambda: client.table("chat_history")
            .select("*")
            .eq("id", chat_id)
            .single()
            .execute()
        )
        return result.data

    async def delete_chat(self, chat_id: str) -> None:
        await asyncio.to_thread(
            lambda: client.table("chat_history")
            .delete()
            .eq("id", chat_id)
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

        all_tags = set()
        total_tasks = 0
        status_counts = {}
        last_capture = None

        for note in notes_result.data:
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
        notes = await asyncio.to_thread(
            lambda: client.table("notes")
            .select("tags", count="exact")
            .eq("page_id", page_id)
            .execute()
        )

        edges = await self.get_edges_for_page(page_id)

        clusters = await asyncio.to_thread(
            lambda: client.table("clusters")
            .select("id", count="exact")
            .eq("page_id", page_id)
            .execute()
        )

        elements = await asyncio.to_thread(
            lambda: client.table("canvas_elements")
            .select("id", count="exact")
            .eq("page_id", page_id)
            .execute()
        )

        tag_counts = {}
        for note in notes.data:
            for tag in note.get("tags") or []:
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