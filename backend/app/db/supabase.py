# === FILE: backend/app/db/supabase.py ===

import asyncio
from datetime import datetime, timedelta, timezone
from supabase import create_client
from app.config import settings

client = create_client(settings.supabase_url, settings.supabase_key)


def _run(fn):
    return asyncio.to_thread(fn)


def _now():
    return datetime.now(timezone.utc).isoformat()


class Database:

    # ═══════════════════════════════════════
    # NOTES
    # ═══════════════════════════════════════

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

    async def list_notes(
        self, page: int = 1, limit: int = 20,
        tag: str = None, page_id: str = None, user_id: str = None,
    ) -> dict:
        def _q():
            q = client.table("notes").select("*", count="exact")
            if tag:
                q = q.contains("tags", [tag])
            if page_id:
                q = q.eq("page_id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.order("created_at", desc=True).range((page - 1) * limit, page * limit - 1).execute()
        result = await _run(_q)
        return {"notes": result.data or [], "total": result.count or 0}

    async def delete_note(self, note_id: str, user_id: str = None) -> None:
        q = client.table("notes").delete().eq("id", note_id)
        if user_id:
            q = q.eq("user_id", user_id)
        await _run(lambda: q.execute())

    async def get_notes_for_page(self, page_id: str, user_id: str = None) -> list:
        def _q():
            q = client.table("notes").select("*").eq("page_id", page_id)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.order("created_at", desc=True).execute()
        result = await _run(_q)
        return result.data or []

    async def count_notes(self, page_id: str = None, user_id: str = None) -> int:
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
            lambda: client.table("notes")
            .select("id, raw_text")
            .in_("processing_status", ["pending", "processing"])
            .lt("created_at", cutoff)
            .execute()
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

    # ═══════════════════════════════════════
    # EMBEDDINGS (separate table)
    # ═══════════════════════════════════════

    async def upsert_embedding(self, note_id: str, embedding: list[float], model: str = "gemini-embedding-001") -> None:
        await _run(
            lambda: client.table("note_embeddings")
            .upsert({"note_id": note_id, "embedding": embedding, "model": model})
            .execute()
        )

    async def get_embedding(self, note_id: str) -> list[float] | None:
        try:
            result = await _run(
                lambda: client.table("note_embeddings")
                .select("embedding")
                .eq("note_id", note_id)
                .maybe_single()
                .execute()
            )
            return result.data["embedding"] if result.data else None
        except Exception:
            return None

    async def get_notes_with_embeddings(self, page_id: str) -> list:
        result = await _run(
            lambda: client.table("notes")
            .select("id, title, tags, summary, raw_text, page_id, content_type")
            .eq("page_id", page_id)
            .execute()
        )
        notes = result.data or []
        # Join embeddings
        note_ids = [n["id"] for n in notes]
        if not note_ids:
            return []
        emb_result = await _run(
            lambda: client.table("note_embeddings")
            .select("note_id, embedding")
            .in_("note_id", note_ids)
            .execute()
        )
        emb_map = {e["note_id"]: e["embedding"] for e in (emb_result.data or [])}
        return [
            {**n, "embedding": emb_map[n["id"]]}
            for n in notes if n["id"] in emb_map
        ]

    async def get_all_notes_with_embeddings(self) -> list:
        result = await _run(
            lambda: client.table("note_embeddings")
            .select("note_id, embedding")
            .execute()
        )
        if not result.data:
            return []
        note_ids = [e["note_id"] for e in result.data]
        emb_map = {e["note_id"]: e["embedding"] for e in result.data}
        notes_result = await _run(
            lambda: client.table("notes")
            .select("id, title, tags, summary, raw_text, page_id")
            .in_("id", note_ids)
            .execute()
        )
        return [
            {**n, "embedding": emb_map[n["id"]]}
            for n in (notes_result.data or []) if n["id"] in emb_map
        ]

    async def vector_search(self, embedding: list, limit: int = 10, threshold: float = 0.65) -> list:
        result = await _run(
            lambda: client.rpc("match_notes", {
                "query_embedding": embedding,
                "match_threshold": threshold,
                "match_count": limit,
            }).execute()
        )
        return result.data or []

    async def vector_search_in_page(
        self, embedding: list, page_id: str, limit: int = 10, threshold: float = 0.65
    ) -> list:
        result = await _run(
            lambda: client.rpc("match_notes_in_page", {
                "query_embedding": embedding,
                "target_page_id": page_id,
                "match_threshold": threshold,
                "match_count": limit,
            }).execute()
        )
        return result.data or []

    # ═══════════════════════════════════════
    # PAGES
    # ═══════════════════════════════════════

    async def insert_page(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("pages").insert(kwargs).execute())
        page = result.data[0]
        # Create empty scene
        await _run(lambda: client.table("page_scenes").insert({
            "page_id": page["id"],
            "scene_data": {"elements": [], "appState": {"viewBackgroundColor": "#0e0e1a", "theme": "dark"}, "files": {}},
        }).execute())
        # Create visual context
        await _run(lambda: client.table("page_visual_context").insert({
            "page_id": page["id"],
        }).execute())
        return page

    async def update_page(self, page_id: str, user_id: str = None, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        q = client.table("pages").update(updates).eq("id", page_id)
        if user_id:
            q = q.eq("user_id", user_id)
        result = await _run(lambda: q.execute())
        updated = result.data[0] if result.data else {}
        if updated:
            try:
                from app.services import cache as cache_svc
                await cache_svc.invalidate_page(page_id)
            except Exception:
                pass
        return updated

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

    async def list_pages(self, include_archived: bool = False, user_id: str = None) -> list:
        def _q():
            q = client.table("pages").select("*").order("updated_at", desc=True)
            if not include_archived:
                q = q.eq("is_archived", False)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def delete_page(self, page_id: str, user_id: str = None) -> None:
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

    # ═══════════════════════════════════════
    # SCENES (separate from pages)
    # ═══════════════════════════════════════

    async def get_scene(self, page_id: str, mode: str = "canvas") -> dict:
        try:
            result = await _run(
                lambda: client.table("page_scenes")
                .select("*")
                .eq("page_id", page_id)
                .maybe_single()
                .execute()
            )
            if result.data:
                data = result.data.get("scene_data") or {"elements": [], "appState": {}, "files": {}}
                if "elements" in data and "canvas" not in data:
                    if mode == "canvas": return data
                    return {"elements": [], "appState": {}, "files": {}}
                return data.get(mode, {"elements": [], "appState": {}, "files": {}})
            return {"elements": [], "appState": {}, "files": {}}
        except Exception:
            return {"elements": [], "appState": {}, "files": {}}

    async def save_scene(self, page_id: str, scene_data: dict, mode: str = "canvas") -> None:
        result = await _run(
            lambda: client.table("page_scenes")
            .select("*")
            .eq("page_id", page_id)
            .maybe_single()
            .execute()
        )
        current = result.data.get("scene_data") if result.data else None
        if not current:
            current = {}
        if "elements" in current and "canvas" not in current:
            current = {"canvas": current}
            
        current[mode] = scene_data

        await _run(
            lambda: client.table("page_scenes")
            .upsert({
                "page_id": page_id,
                "scene_data": current,
                "version": 1,  # TODO: increment
                "updated_at": _now(),
            })
            .execute()
        )

    async def get_scene_version(self, page_id: str) -> int:
        try:
            result = await _run(
                lambda: client.table("page_scenes")
                .select("version")
                .eq("page_id", page_id)
                .maybe_single()
                .execute()
            )
            return result.data.get("version", 1) if result.data else 1
        except Exception:
            return 1

    # ═══════════════════════════════════════
    # VISUAL CONTEXT
    # ═══════════════════════════════════════

    async def get_visual_context(self, page_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("page_visual_context")
                .select("*")
                .eq("page_id", page_id)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    async def upsert_visual_context(self, page_id: str, **kwargs) -> dict:
        data = {"page_id": page_id, **{k: v for k, v in kwargs.items() if v is not None}, "updated_at": _now()}
        result = await _run(
            lambda: client.table("page_visual_context").upsert(data).execute()
        )
        return result.data[0] if result.data else {}

    # ═══════════════════════════════════════
    # USER VIEWPORTS
    # ═══════════════════════════════════════

    async def get_viewport(self, user_id: str, page_id: str) -> dict:
        if not user_id:
            return {"scroll_x": 0, "scroll_y": 0, "zoom": 1.0}
        try:
            result = await _run(
                lambda: client.table("user_viewports")
                .select("*")
                .eq("user_id", user_id)
                .eq("page_id", page_id)
                .maybe_single()
                .execute()
            )
            if result.data:
                return result.data
            return {"scroll_x": 0, "scroll_y": 0, "zoom": 1.0}
        except Exception:
            return {"scroll_x": 0, "scroll_y": 0, "zoom": 1.0}

    async def save_viewport(self, user_id: str, page_id: str, scroll_x: float, scroll_y: float, zoom: float) -> None:
        if not user_id:
            return
        await _run(
            lambda: client.table("user_viewports")
            .upsert({
                "user_id": user_id, "page_id": page_id,
                "scroll_x": scroll_x, "scroll_y": scroll_y,
                "zoom": zoom, "updated_at": _now(),
            })
            .execute()
        )

    # ═══════════════════════════════════════
    # ELEMENT REGISTRY
    # ═══════════════════════════════════════

    async def upsert_element_registry(self, page_id: str, element_id: str, **kwargs) -> dict:
        data = {
            "page_id": page_id, "element_id": element_id,
            **{k: v for k, v in kwargs.items() if v is not None},
            "updated_at": _now(),
        }
        result = await _run(
            lambda: client.table("canvas_element_registry").upsert(data, on_conflict="page_id,element_id").execute()
        )
        return result.data[0] if result.data else {}

    async def get_element_registry(self, page_id: str, element_id: str = None, note_id: str = None) -> list:
        def _q():
            q = client.table("canvas_element_registry").select("*").eq("page_id", page_id)
            if element_id:
                q = q.eq("element_id", element_id)
            if note_id:
                q = q.eq("note_id", note_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def delete_element_registry(self, page_id: str, element_id: str) -> None:
        await _run(
            lambda: client.table("canvas_element_registry")
            .delete()
            .eq("page_id", page_id)
            .eq("element_id", element_id)
            .execute()
        )

    async def get_elements_in_region(self, region_id: str) -> list:
        result = await _run(
            lambda: client.table("canvas_element_registry")
            .select("*")
            .eq("region_id", region_id)
            .execute()
        )
        return result.data or []

    async def get_note_position(self, page_id: str, note_id: str) -> dict | None:
        entries = await self.get_element_registry(page_id, note_id=note_id)
        if entries:
            e = entries[0]
            return {"x": e.get("cached_x"), "y": e.get("cached_y"), "w": e.get("cached_width"), "h": e.get("cached_height")}
        return None

    # ═══════════════════════════════════════
    # REGIONS (replaces clusters)
    # ═══════════════════════════════════════

    async def insert_region(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("canvas_regions").insert(kwargs).execute())
        return result.data[0]

    async def update_region(self, region_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        result = await _run(
            lambda: client.table("canvas_regions").update(updates).eq("id", region_id).execute()
        )
        return result.data[0] if result.data else {}

    async def list_regions(self, page_id: str) -> list:
        result = await _run(
            lambda: client.table("canvas_regions").select("*").eq("page_id", page_id).execute()
        )
        return result.data or []

    async def delete_region(self, region_id: str) -> None:
        # Unlink elements
        await _run(
            lambda: client.table("canvas_element_registry")
            .update({"region_id": None, "updated_at": _now()})
            .eq("region_id", region_id)
            .execute()
        )
        await _run(lambda: client.table("canvas_regions").delete().eq("id", region_id).execute())

    async def delete_regions_for_page(self, page_id: str) -> None:
        await _run(
            lambda: client.table("canvas_element_registry")
            .update({"region_id": None, "updated_at": _now()})
            .eq("page_id", page_id)
            .not_.is_("region_id", "null")
            .execute()
        )
        await _run(lambda: client.table("canvas_regions").delete().eq("page_id", page_id).execute())

    # ═══════════════════════════════════════
    # EDGES
    # ═══════════════════════════════════════

    async def insert_edge(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("note_edges").insert(kwargs).execute())
        return result.data[0]

    async def insert_edge_if_not_exists(self, source_id: str, target_id: str, **kwargs) -> dict | None:
        """Insert edge, return None if already exists (uses UNIQUE constraint)."""
        try:
            data = {"source_id": source_id, "target_id": target_id, **kwargs}
            result = await _run(lambda: client.table("note_edges").insert(data).execute())
            return result.data[0] if result.data else None
        except Exception:
            # Unique constraint violation = edge exists
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
        note_ids_result = await _run(
            lambda: client.table("notes").select("id").eq("page_id", page_id).execute()
        )
        note_ids = [n["id"] for n in (note_ids_result.data or [])]
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

    # ═══════════════════════════════════════
    # DOCUMENT FLOW
    # ═══════════════════════════════════════

    async def ensure_page_document(self, page_id: str, user_id: str = None) -> dict | None:
        page = await self.get_page(page_id, user_id=user_id)
        if not page:
            return None
        existing = await _run(
            lambda: client.table("page_documents")
            .select("*").eq("page_id", page_id).maybe_single().execute()
        )
        if existing and existing.data:
            return existing.data
        result = await _run(
            lambda: client.table("page_documents")
            .insert({"page_id": page_id, "user_id": page.get("user_id")})
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
        updates["updated_at"] = _now()
        result = await _run(
            lambda: client.table("page_documents").update(updates).eq("page_id", page_id).execute()
        )
        return result.data[0] if result.data else {}

    async def list_page_blocks(self, page_id: str, include_deleted: bool = False) -> list:
        def _q():
            q = client.table("page_blocks").select("*").eq("page_id", page_id).order("order_key")
            if not include_deleted:
                q = q.eq("is_deleted", False)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def get_page_block(self, block_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("page_blocks").select("*").eq("id", block_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    async def get_next_block_order_key(self, page_id: str, prev_block_id: str = None, next_block_id: str = None) -> float:
        try:
            result = await _run(
                lambda: client.rpc("mnemos_next_order_key", {
                    "p_page_id": page_id,
                    "p_prev_block_id": prev_block_id,
                    "p_next_block_id": next_block_id,
                }).execute()
            )
            if result and result.data is not None:
                if isinstance(result.data, list) and result.data:
                    return float(result.data[0])
                return float(result.data)
        except Exception:
            pass
        blocks = await self.list_page_blocks(page_id, include_deleted=True)
        by_id = {str(b.get("id")): b for b in blocks if b.get("id") is not None}
        prev_key = float((by_id.get(str(prev_block_id)) or {}).get("order_key") or 0) if prev_block_id else None
        next_key = float((by_id.get(str(next_block_id)) or {}).get("order_key") or 0) if next_block_id else None
        if prev_key is None and next_key is None:
            max_key = max((float(b.get("order_key") or 0) for b in blocks), default=0.0)
            return max_key + 1000.0
        if prev_key is None:
            return float(next_key) - 1000.0
        if next_key is None:
            return float(prev_key) + 1000.0
        return (float(prev_key) + float(next_key)) / 2.0

    async def rebalance_page_blocks(self, page_id: str) -> None:
        try:
            await _run(lambda: client.rpc("mnemos_rebalance_page_blocks", {"p_page_id": page_id}).execute())
            return
        except Exception:
            pass
        blocks = await self.list_page_blocks(page_id, include_deleted=True)
        for idx, block in enumerate(blocks, start=1):
            bid = block["id"]
            key = float(idx * 1000)
            await _run(
                lambda b=bid, k=key: client.table("page_blocks")
                .update({"order_key": k, "updated_at": _now()}).eq("id", b).execute()
            )

    async def insert_page_block(self, **kwargs) -> dict:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        page_id = payload.get("page_id")
        if not page_id:
            raise ValueError("page_id required")
        await self.ensure_page_document(page_id)
        prev_block_id = payload.pop("prev_block_id", None)
        next_block_id = payload.pop("next_block_id", None)
        if payload.get("order_key") is None:
            payload["order_key"] = await self.get_next_block_order_key(page_id, prev_block_id, next_block_id)
        result = await _run(lambda: client.table("page_blocks").insert(payload).execute())
        return result.data[0]

    async def update_page_block(self, block_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        existing = await self.get_page_block(block_id)
        if not existing:
            return {}
        version_keys = {"text_content", "attrs", "metadata", "provenance", "block_type"}
        if any(k in updates for k in version_keys):
            updates["version"] = int(existing.get("version") or 1) + 1
        updates["updated_at"] = _now()
        result = await _run(
            lambda: client.table("page_blocks").update(updates).eq("id", block_id).execute()
        )
        return result.data[0] if result.data else {}

    async def delete_page_block(self, block_id: str, hard_delete: bool = False) -> None:
        if hard_delete:
            await _run(lambda: client.table("page_blocks").delete().eq("id", block_id).execute())
        else:
            await _run(
                lambda: client.table("page_blocks")
                .update({"is_deleted": True, "updated_at": _now()})
                .eq("id", block_id).execute()
            )

    async def move_page_block(self, block_id: str, prev_block_id: str = None, next_block_id: str = None, order_key: float = None) -> dict:
        existing = await self.get_page_block(block_id)
        if not existing:
            return {}
        page_id = str(existing.get("page_id") or "")
        if not page_id:
            return {}
        if order_key is None:
            order_key = await self.get_next_block_order_key(page_id, prev_block_id, next_block_id)
        return await self.update_page_block(block_id, order_key=order_key)

    async def list_block_references(self, page_id: str, block_id: str = None) -> list:
        def _q():
            q = client.table("block_references").select("*").eq("page_id", page_id).order("created_at")
            if block_id:
                q = q.eq("block_id", block_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def insert_block_reference(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("block_references").insert(kwargs).execute())
        return result.data[0]

    async def delete_block_reference(self, reference_id: str) -> None:
        await _run(lambda: client.table("block_references").delete().eq("id", reference_id).execute())

    async def list_inline_embeds(self, page_id: str, block_id: str = None) -> list:
        def _q():
            q = client.table("inline_embeds").select("*").eq("page_id", page_id).order("created_at")
            if block_id:
                q = q.eq("block_id", block_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def insert_inline_embed(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("inline_embeds").insert(kwargs).execute())
        return result.data[0]

    async def delete_inline_embed(self, embed_id: str) -> None:
        await _run(lambda: client.table("inline_embeds").delete().eq("id", embed_id).execute())

    # ═══════════════════════════════════════
    # CHAT HISTORY
    # ═══════════════════════════════════════

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

    async def list_chats(self, limit: int = 20, user_id: str = None) -> list:
        def _q():
            q = client.table("chat_history").select("*").order("updated_at", desc=True).limit(limit)
            if user_id:
                q = q.eq("user_id", user_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def get_chat(self, chat_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("chat_history").select("*").eq("id", chat_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    async def delete_chat(self, chat_id: str) -> None:
        await _run(lambda: client.table("chat_history").delete().eq("id", chat_id).execute())

    # ═══════════════════════════════════════
    # USERS
    # ═══════════════════════════════════════

    async def upsert_user(self, google_id: str, email: str, name: str = None, avatar_url: str = None) -> dict:
        existing = await _run(
            lambda: client.table("users").select("*").eq("google_id", google_id).maybe_single().execute()
        )
        if existing and existing.data:
            user_id = existing.data["id"]
            updates = {"updated_at": _now()}
            if name:
                updates["name"] = name
            if avatar_url:
                updates["avatar_url"] = avatar_url
            if email:
                updates["email"] = email
            result = await _run(
                lambda: client.table("users").update(updates).eq("id", user_id).execute()
            )
            return result.data[0] if result.data else existing.data
        else:
            result = await _run(
                lambda: client.table("users").insert({
                    "google_id": google_id, "email": email, "name": name, "avatar_url": avatar_url,
                }).execute()
            )
            return result.data[0]

    async def get_user(self, user_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("users").select("*").eq("id", user_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    # ═══════════════════════════════════════
    # SETTINGS
    # ═══════════════════════════════════════

    async def get_settings(self, user_id: str = None) -> dict | None:
        try:
            def _q():
                q = client.table("settings").select("*")
                if user_id:
                    q = q.eq("user_id", user_id)
                else:
                    q = q.is_("user_id", "null")
                return q.maybe_single().execute()
            result = await _run(_q)
            return result.data
        except Exception:
            return None

    async def upsert_settings(self, user_id: str = None, **kwargs) -> dict:
        existing = await self.get_settings(user_id=user_id)
        updates = {k: v for k, v in kwargs.items() if v is not None}
        updates["updated_at"] = _now()
        if existing:
            result = await _run(
                lambda: client.table("settings").update(updates).eq("id", existing["id"]).execute()
            )
            return result.data[0] if result.data else existing
        else:
            insert_data = {**updates}
            if user_id:
                insert_data["user_id"] = user_id
            result = await _run(lambda: client.table("settings").insert(insert_data).execute())
            return result.data[0]

    # ═══════════════════════════════════════
    # AGENT RUNS
    # ═══════════════════════════════════════

    async def insert_agent_run(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("agent_runs").insert(kwargs).execute())
        return result.data[0]

    async def update_agent_run(self, run_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        result = await _run(
            lambda: client.table("agent_runs").update(updates).eq("id", run_id).execute()
        )
        return result.data[0] if result.data else {}

    # ═══════════════════════════════════════
    # REVISIONS / OP LOG
    # ═══════════════════════════════════════

    async def insert_page_revision(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("page_revisions").insert(kwargs).execute())
        return result.data[0]

    async def list_page_revisions(self, page_id: str, limit: int = 20) -> list:
        result = await _run(
            lambda: client.table("page_revisions").select("*")
            .eq("page_id", page_id).order("created_at", desc=True).limit(limit).execute()
        )
        return result.data or []

    async def insert_page_operation_log(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("page_operation_log").insert(kwargs).execute())
        return result.data[0]

    # ═══════════════════════════════════════
    # STATS
    # ═══════════════════════════════════════

    async def get_global_stats(self, user_id: str = None) -> dict:
        def _notes_q():
            q = client.table("notes").select("processing_status, tags, tasks, created_at", count="exact")
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
            "total_notes": notes_result.count or 0,
            "total_pages": pages_result.count or 0,
            "total_tags": len(all_tags),
            "total_tasks": total_tasks,
            "status_counts": status_counts,
            "last_capture": last_capture,
        }

    async def get_page_stats(self, page_id: str) -> dict:
        notes = await _run(
            lambda: client.table("notes").select("tags", count="exact").eq("page_id", page_id).execute()
        )
        edges = await self.get_edges_for_page(page_id)
        regions = await _run(
            lambda: client.table("canvas_regions").select("id", count="exact").eq("page_id", page_id).execute()
        )
        elements = await _run(
            lambda: client.table("canvas_element_registry").select("id", count="exact").eq("page_id", page_id).execute()
        )
        tag_counts: dict[str, int] = {}
        for note in (notes.data or []):
            for tag in (note.get("tags") or []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        return {
            "note_count": notes.count or 0,
            "edge_count": len(edges),
            "region_count": regions.count or 0,
            "element_count": elements.count or 0,
            "tags": sorted([{"name": k, "count": v} for k, v in tag_counts.items()], key=lambda x: x["count"], reverse=True),
        }

    # ═══════════════════════════════════════
    # DOCUMENT (notebook mode)
    # ═══════════════════════════════════════

    async def get_document(self, page_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("page_documents")
                .select("*").eq("page_id", page_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    async def upsert_document(self, page_id: str, user_id: str = None, **kwargs) -> dict:
        data = {"page_id": page_id, **{k: v for k, v in kwargs.items() if v is not None}, "updated_at": _now()}
        if user_id:
            data["user_id"] = user_id
        result = await _run(
            lambda: client.table("page_documents").upsert(data).execute()
        )
        return result.data[0] if result.data else {}

    # ═══════════════════════════════════════
    # BLOCKS
    # ═══════════════════════════════════════

    async def get_blocks(self, page_id: str) -> list:
        result = await _run(
            lambda: client.table("page_blocks")
            .select("*").eq("page_id", page_id).eq("is_deleted", False)
            .order("order_key").execute()
        )
        return result.data or []

    async def insert_block(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("page_blocks").insert(kwargs).execute())
        return result.data[0]

    async def update_block(self, block_id: str, **kwargs) -> dict:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        updates["version"] = 1  # TODO: increment
        result = await _run(
            lambda: client.table("page_blocks").update(updates).eq("id", block_id).execute()
        )
        return result.data[0] if result.data else {}

    async def delete_block(self, block_id: str) -> None:
        await _run(
            lambda: client.table("page_blocks")
            .update({"is_deleted": True, "updated_at": _now()})
            .eq("id", block_id).execute()
        )

    async def rpc_next_order_key(self, page_id: str, prev_block_id: str = None, next_block_id: str = None) -> float:
        result = await _run(
            lambda: client.rpc("mnemos_next_order_key", {
                "p_page_id": page_id,
                "p_prev_block_id": prev_block_id,
                "p_next_block_id": next_block_id,
            }).execute()
        )
        return float(result.data) if result.data else 1000.0

    async def rpc_rebalance_blocks(self, page_id: str) -> None:
        await _run(
            lambda: client.rpc("mnemos_rebalance_page_blocks", {"p_page_id": page_id}).execute()
        )

    # ═══════════════════════════════════════
    # BLOCK REFERENCES
    # ═══════════════════════════════════════

    async def get_block_references(self, page_id: str, block_id: str = None) -> list:
        def _q():
            q = client.table("block_references").select("*").eq("page_id", page_id)
            if block_id:
                q = q.eq("block_id", block_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def insert_block_reference(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("block_references").insert(kwargs).execute())
        return result.data[0]

    async def delete_block_reference(self, ref_id: str) -> None:
        await _run(lambda: client.table("block_references").delete().eq("id", ref_id).execute())

    # ═══════════════════════════════════════
    # INLINE EMBEDS
    # ═══════════════════════════════════════

    async def get_inline_embeds(self, page_id: str, block_id: str = None) -> list:
        def _q():
            q = client.table("inline_embeds").select("*").eq("page_id", page_id)
            if block_id:
                q = q.eq("block_id", block_id)
            return q.execute()
        result = await _run(_q)
        return result.data or []

    async def insert_inline_embed(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("inline_embeds").insert(kwargs).execute())
        return result.data[0]

    async def delete_inline_embed(self, embed_id: str) -> None:
        await _run(lambda: client.table("inline_embeds").delete().eq("id", embed_id).execute())

    # ═══════════════════════════════════════
    # SETTINGS
    # ═══════════════════════════════════════

    async def get_settings(self, user_id: str) -> dict | None:
        try:
            result = await _run(
                lambda: client.table("settings")
                .select("*").eq("user_id", user_id).maybe_single().execute()
            )
            return result.data
        except Exception:
            return None

    async def upsert_settings(self, user_id: str, **kwargs) -> dict:
        data = {"user_id": user_id, **{k: v for k, v in kwargs.items() if v is not None}, "updated_at": _now()}
        result = await _run(lambda: client.table("settings").upsert(data, on_conflict="user_id").execute())
        return result.data[0] if result.data else {}

    # ═══════════════════════════════════════
    # CHAT HISTORY
    # ═══════════════════════════════════════

    async def get_chat_history(self, user_id: str = None, context_type: str = "home", context_id: str = None) -> list:
        def _q():
            q = client.table("chat_history").select("*")
            if user_id:
                q = q.eq("user_id", user_id)
            if context_type:
                q = q.eq("context_type", context_type)
            if context_id:
                q = q.eq("context_id", context_id)
            return q.order("updated_at", desc=True).limit(20).execute()
        result = await _run(_q)
        return result.data or []

    async def save_chat_history(self, user_id: str = None, **kwargs) -> dict:
        data = {**{k: v for k, v in kwargs.items() if v is not None}, "updated_at": _now()}
        if user_id:
            data["user_id"] = user_id
        result = await _run(lambda: client.table("chat_history").insert(data).execute())
        return result.data[0] if result.data else {}

    # ═══════════════════════════════════════
    # REVISIONS
    # ═══════════════════════════════════════

    async def insert_revision(self, **kwargs) -> dict:
        result = await _run(lambda: client.table("page_revisions").insert(kwargs).execute())
        return result.data[0]

    async def get_revisions(self, page_id: str, limit: int = 20) -> list:
        result = await _run(
            lambda: client.table("page_revisions")
            .select("id, page_id, source, changed_by, message, created_at")
            .eq("page_id", page_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    # ═══════════════════════════════════════
    # OPERATION LOG
    # ═══════════════════════════════════════

    async def log_operation(self, page_id: str, op_type: str, **kwargs) -> dict:
        data = {"page_id": page_id, "op_type": op_type, **{k: v for k, v in kwargs.items() if v is not None}}
        result = await _run(lambda: client.table("page_operation_log").insert(data).execute())
        return result.data[0] if result.data else {}

    # ═══════════════════════════════════════
    # AGENT RUNS
    # ═══════════════════════════════════════

    async def start_agent_run(self, agent_type: str, input_data: dict = None) -> dict:
        result = await _run(
            lambda: client.table("agent_runs")
            .insert({"agent_type": agent_type, "status": "running", "input_data": input_data or {}})
            .execute()
        )
        return result.data[0]

    async def finish_agent_run(self, run_id: str, status: str = "completed",
                               output_data: dict = None, errors: list = None) -> dict:
        result = await _run(
            lambda: client.table("agent_runs")
            .update({"status": status, "output_data": output_data or {}, "errors": errors or [], "finished_at": _now()})
            .eq("id", run_id)
            .execute()
        )
        return result.data[0] if result.data else {}


db = Database()