# === FILE: backend/app/db/repo.py ===

"""
Single data-access layer. One method per operation.
No business logic — just reads and writes.

Tables: users, items, item_embeddings, item_connections,
        workspaces, workspace_items, canvas_state,
        canvas_placements, canvas_objects, board_ops,
        conversations, user_preferences
"""

from __future__ import annotations
import asyncio
import json
from datetime import datetime, timezone
from supabase import create_client
from app.core.config import settings

_key = settings.supabase_service_role_key or settings.supabase_key
_client = create_client(settings.supabase_url, _key)


def _run(fn):
    return asyncio.to_thread(fn)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _parse_embedding(raw) -> list[float] | None:
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


class Repo:
    """Every DB call in the app goes through here."""

    # ═══════════════════════════════════════
    # USERS
    # ═══════════════════════════════════════

    async def upsert_user(self, google_id: str, email: str,
                          name: str = None, avatar_url: str = None) -> dict:
        existing = await _run(
            lambda: _client.table("users").select("*")
            .eq("google_id", google_id).maybe_single().execute()
        )
        if existing and existing.data:
            updates = {"updated_at": _now()}
            if name: updates["name"] = name
            if avatar_url: updates["avatar_url"] = avatar_url
            if email: updates["email"] = email
            r = await _run(
                lambda: _client.table("users").update(updates)
                .eq("id", existing.data["id"]).execute()
            )
            return r.data[0] if r.data else existing.data
        r = await _run(
            lambda: _client.table("users").insert({
                "google_id": google_id, "email": email,
                "name": name, "avatar_url": avatar_url,
            }).execute()
        )
        return r.data[0]

    async def get_user(self, user_id: str) -> dict | None:
        try:
            r = await _run(
                lambda: _client.table("users").select("*")
                .eq("id", user_id).maybe_single().execute()
            )
            return r.data
        except Exception:
            return None

    # ═══════════════════════════════════════
    # ITEMS (knowledge units)
    # ═══════════════════════════════════════

    async def create_item(self, **kw) -> dict:
        r = await _run(lambda: _client.table("items").insert(kw).execute())
        return r.data[0]

    async def get_item(self, item_id: str, owner_id: str = None) -> dict | None:
        try:
            q = _client.table("items").select("*").eq("id", item_id)
            if owner_id:
                q = q.eq("owner_id", owner_id)
            r = await _run(lambda: q.maybe_single().execute())
            return r.data
        except Exception:
            return None

    async def update_item(self, item_id: str, owner_id: str = None, **kw) -> dict:
        updates = {k: v for k, v in kw.items() if v is not None}
        if not updates:
            return {}
        updates["updated_at"] = _now()
        q = _client.table("items").update(updates).eq("id", item_id)
        if owner_id:
            q = q.eq("owner_id", owner_id)
        r = await _run(lambda: q.execute())
        return r.data[0] if r.data else {}

    async def delete_item(self, item_id: str, owner_id: str = None):
        q = _client.table("items").delete().eq("id", item_id)
        if owner_id:
            q = q.eq("owner_id", owner_id)
        await _run(lambda: q.execute())

    async def list_items(self, owner_id: str = None, tag: str = None,
                         page: int = 1, limit: int = 20) -> dict:
        def _q():
            q = _client.table("items").select("*", count="exact")
            if owner_id: q = q.eq("owner_id", owner_id)
            if tag: q = q.contains("tags", [tag])
            return q.order("created_at", desc=True) \
                .range((page - 1) * limit, page * limit - 1).execute()
        r = await _run(_q)
        return {"items": r.data or [], "total": r.count or 0}

    async def get_items_for_workspace(self, workspace_id: str,
                                      owner_id: str = None) -> list:
        """Get all items linked to a workspace via junction table."""
        def _q():
            q = _client.table("workspace_items") \
                .select("item_id, items(*)") \
                .eq("workspace_id", workspace_id)
            return q.execute()
        r = await _run(_q)
        items = []
        for row in (r.data or []):
            item_data = row.get("items")
            if item_data:
                if owner_id and item_data.get("owner_id") != owner_id:
                    continue
                items.append(item_data)
        return items

    async def get_all_tags(self, owner_id: str = None) -> list[dict]:
        def _q():
            q = _client.table("items").select("tags")
            if owner_id: q = q.eq("owner_id", owner_id)
            return q.execute()
        r = await _run(_q)
        counts: dict[str, int] = {}
        for item in (r.data or []):
            for tag in (item.get("tags") or []):
                counts[tag] = counts.get(tag, 0) + 1
        return sorted(
            [{"name": k, "count": v} for k, v in counts.items()],
            key=lambda x: x["count"], reverse=True,
        )

    # ═══════════════════════════════════════
    # ITEM EMBEDDINGS
    # ═══════════════════════════════════════

    async def upsert_embedding(self, item_id: str, vector: list[float],
                               model: str = "gemini-embedding-001"):
        await _run(
            lambda: _client.table("item_embeddings")
            .upsert({"item_id": item_id, "vector": vector, "model": model})
            .execute()
        )

    async def get_embedding(self, item_id: str) -> list[float] | None:
        try:
            r = await _run(
                lambda: _client.table("item_embeddings")
                .select("vector").eq("item_id", item_id)
                .maybe_single().execute()
            )
            return _parse_embedding(r.data.get("vector")) if r.data else None
        except Exception:
            return None

    async def vector_search(self, embedding: list, limit: int = 10,
                            threshold: float = 0.65) -> list:
        r = await _run(
            lambda: _client.rpc("search_items", {
                "query_vector": embedding,
                "threshold": threshold,
                "max_results": limit,
            }).execute()
        )
        return r.data or []

    async def vector_search_in_workspace(self, embedding: list,
                                         workspace_id: str,
                                         limit: int = 10,
                                         threshold: float = 0.65) -> list:
        r = await _run(
            lambda: _client.rpc("search_items_in_workspace", {
                "query_vector": embedding,
                "target_ws_id": workspace_id,
                "threshold": threshold,
                "max_results": limit,
            }).execute()
        )
        return r.data or []

    # ═══════════════════════════════════════
    # ITEM CONNECTIONS (knowledge graph edges)
    # ═══════════════════════════════════════

    async def create_connection(self, from_id: str, to_id: str,
                                **kw) -> dict | None:
        try:
            data = {"from_id": from_id, "to_id": to_id, **kw}
            r = await _run(
                lambda: _client.table("item_connections").insert(data).execute()
            )
            return r.data[0] if r.data else None
        except Exception:
            return None  # unique constraint = already exists

    async def delete_connection(self, conn_id: str):
        await _run(
            lambda: _client.table("item_connections")
            .delete().eq("id", conn_id).execute()
        )

    async def get_connections_for_item(self, item_id: str) -> list:
        fwd = await _run(
            lambda: _client.table("item_connections").select("*")
            .eq("from_id", item_id).execute()
        )
        rev = await _run(
            lambda: _client.table("item_connections").select("*")
            .eq("to_id", item_id).execute()
        )
        seen: set[str] = set()
        out = []
        for e in (fwd.data or []) + (rev.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                out.append(e)
        return out

    async def get_all_connections(self, owner_id: str = None) -> list:
        if not owner_id:
            r = await _run(
                lambda: _client.table("item_connections").select("*").execute()
            )
            return r.data or []
        items_r = await _run(
            lambda: _client.table("items").select("id")
            .eq("owner_id", owner_id).execute()
        )
        ids = [i["id"] for i in (items_r.data or [])]
        if not ids:
            return []
        fwd = await _run(
            lambda: _client.table("item_connections").select("*")
            .in_("from_id", ids).execute()
        )
        rev = await _run(
            lambda: _client.table("item_connections").select("*")
            .in_("to_id", ids).execute()
        )
        seen: set[str] = set()
        out = []
        for e in (fwd.data or []) + (rev.data or []):
            if e["id"] not in seen:
                seen.add(e["id"])
                out.append(e)
        return out

    # ═══════════════════════════════════════
    # WORKSPACES
    # ═══════════════════════════════════════

    async def create_workspace(self, **kw) -> dict:
        r = await _run(lambda: _client.table("workspaces").insert(kw).execute())
        ws = r.data[0]
        # Auto-create canvas state
        await _run(
            lambda: _client.table("canvas_state")
            .insert({"workspace_id": ws["id"]}).execute()
        )
        return ws

    async def get_workspace(self, ws_id: str, owner_id: str = None) -> dict | None:
        try:
            q = _client.table("workspaces").select("*").eq("id", ws_id)
            if owner_id: q = q.eq("owner_id", owner_id)
            r = await _run(lambda: q.maybe_single().execute())
            return r.data
        except Exception:
            return None

    async def get_workspace_by_slug(self, slug: str,
                                    owner_id: str = None) -> dict | None:
        try:
            q = _client.table("workspaces").select("*").ilike("slug", slug)
            if owner_id: q = q.eq("owner_id", owner_id)
            r = await _run(lambda: q.maybe_single().execute())
            return r.data if r else None
        except Exception:
            return None

    async def list_workspaces(self, owner_id: str = None,
                              include_archived: bool = False) -> list:
        def _q():
            q = _client.table("workspaces").select("*") \
                .order("updated_at", desc=True)
            if not include_archived: q = q.eq("is_archived", False)
            if owner_id: q = q.eq("owner_id", owner_id)
            return q.execute()
        r = await _run(_q)
        return r.data or []

    async def update_workspace(self, ws_id: str, owner_id: str = None,
                               **kw) -> dict:
        updates = {k: v for k, v in kw.items() if v is not None}
        if not updates: return {}
        updates["updated_at"] = _now()
        q = _client.table("workspaces").update(updates).eq("id", ws_id)
        if owner_id: q = q.eq("owner_id", owner_id)
        r = await _run(lambda: q.execute())
        return r.data[0] if r.data else {}

    async def delete_workspace(self, ws_id: str, owner_id: str = None):
        q = _client.table("workspaces").delete().eq("id", ws_id)
        if owner_id: q = q.eq("owner_id", owner_id)
        await _run(lambda: q.execute())

    # ── Workspace ↔ Item (M:N) ──

    async def link_item_to_workspace(self, workspace_id: str, item_id: str,
                                     added_by: str = "system"):
        try:
            await _run(
                lambda: _client.table("workspace_items").upsert({
                    "workspace_id": workspace_id,
                    "item_id": item_id,
                    "added_by": added_by,
                }).execute()
            )
        except Exception:
            pass  # already linked

    async def unlink_item_from_workspace(self, workspace_id: str, item_id: str):
        await _run(
            lambda: _client.table("workspace_items").delete()
            .eq("workspace_id", workspace_id)
            .eq("item_id", item_id).execute()
        )

    async def get_workspaces_for_item(self, item_id: str) -> list:
        r = await _run(
            lambda: _client.table("workspace_items")
            .select("workspace_id, workspaces(*)")
            .eq("item_id", item_id).execute()
        )
        return [row["workspaces"] for row in (r.data or []) if row.get("workspaces")]

    # ═══════════════════════════════════════
    # CANVAS STATE
    # ═══════════════════════════════════════

    async def get_canvas(self, workspace_id: str) -> dict:
        try:
            r = await _run(
                lambda: _client.table("canvas_state").select("*")
                .eq("workspace_id", workspace_id).maybe_single().execute()
            )
            if r.data:
                return {
                    "scene": r.data.get("scene") or {},
                    "version": r.data.get("version", 0),
                    "theme": r.data.get("theme", "dark"),
                    "background": r.data.get("background", "#0e0e1a"),
                }
        except Exception:
            pass
        return {"scene": {}, "version": 0, "theme": "dark", "background": "#0e0e1a"}

    async def save_canvas(self, workspace_id: str, scene: dict,
                          version: int, theme: str = None,
                          background: str = None):
        updates = {
            "scene": scene, "version": version,
            "updated_at": _now(),
        }
        if theme: updates["theme"] = theme
        if background: updates["background"] = background
        await _run(
            lambda: _client.table("canvas_state").update(updates)
            .eq("workspace_id", workspace_id).execute()
        )

    # ── Canvas placements (item positions — source of truth) ──

    async def upsert_placement(self, workspace_id: str, item_id: str,
                               x: float, y: float, w: float = 360,
                               h: float = 240,
                               element_ids: list[str] = None):
        await _run(
            lambda: _client.table("canvas_placements").upsert({
                "workspace_id": workspace_id, "item_id": item_id,
                "x": x, "y": y, "w": w, "h": h,
                "element_ids": element_ids or [],
                "updated_at": _now(),
            }).execute()
        )

    async def get_placements(self, workspace_id: str) -> list:
        r = await _run(
            lambda: _client.table("canvas_placements").select("*")
            .eq("workspace_id", workspace_id).execute()
        )
        return r.data or []

    async def get_placement(self, workspace_id: str,
                            item_id: str) -> dict | None:
        try:
            r = await _run(
                lambda: _client.table("canvas_placements").select("*")
                .eq("workspace_id", workspace_id)
                .eq("item_id", item_id).maybe_single().execute()
            )
            return r.data
        except Exception:
            return None

    async def delete_placement(self, workspace_id: str, item_id: str):
        await _run(
            lambda: _client.table("canvas_placements").delete()
            .eq("workspace_id", workspace_id)
            .eq("item_id", item_id).execute()
        )

    # ── Canvas objects (non-item elements) ──

    async def create_canvas_object(self, **kw) -> dict:
        r = await _run(
            lambda: _client.table("canvas_objects").insert(kw).execute()
        )
        return r.data[0] if r.data else {}

    async def get_canvas_objects(self, workspace_id: str) -> list:
        r = await _run(
            lambda: _client.table("canvas_objects").select("*")
            .eq("workspace_id", workspace_id).execute()
        )
        return r.data or []

    async def delete_canvas_object(self, obj_id: str):
        await _run(
            lambda: _client.table("canvas_objects").delete()
            .eq("id", obj_id).execute()
        )

    # ═══════════════════════════════════════
    # BOARD OPS (sync changelog)
    # ═══════════════════════════════════════

    async def log_op(self, workspace_id: str, version: int, op: str,
                     actor: str = "ai", targets: list[str] = None,
                     data: dict = None) -> dict:
        r = await _run(
            lambda: _client.table("board_ops").insert({
                "workspace_id": workspace_id, "version": version,
                "op": op, "actor": actor,
                "targets": targets or [], "data": data or {},
            }).execute()
        )
        return r.data[0] if r.data else {}

    async def get_ops_since(self, workspace_id: str,
                            after_version: int) -> list:
        r = await _run(
            lambda: _client.table("board_ops").select("*")
            .eq("workspace_id", workspace_id)
            .gt("version", after_version)
            .order("version").execute()
        )
        return r.data or []

    async def cleanup_ops(self, workspace_id: str, keep: int = 200) -> int:
        r = await _run(
            lambda: _client.table("board_ops")
            .select("id, version").eq("workspace_id", workspace_id)
            .order("version", desc=True).execute()
        )
        ops = r.data or []
        if len(ops) <= keep:
            return 0
        old_ids = [o["id"] for o in ops[keep:]]
        if old_ids:
            await _run(
                lambda: _client.table("board_ops").delete()
                .in_("id", old_ids).execute()
            )
        return len(old_ids)

    # ═══════════════════════════════════════
    # CONVERSATIONS
    # ═══════════════════════════════════════

    async def create_conversation(self, **kw) -> dict:
        r = await _run(
            lambda: _client.table("conversations").insert(kw).execute()
        )
        return r.data[0]

    async def get_conversation(self, conv_id: str) -> dict | None:
        try:
            r = await _run(
                lambda: _client.table("conversations").select("*")
                .eq("id", conv_id).maybe_single().execute()
            )
            return r.data
        except Exception:
            return None

    async def list_conversations(self, owner_id: str = None,
                                 workspace_id: str = None,
                                 limit: int = 20) -> list:
        def _q():
            q = _client.table("conversations").select("*") \
                .order("updated_at", desc=True).limit(limit)
            if owner_id: q = q.eq("owner_id", owner_id)
            if workspace_id: q = q.eq("workspace_id", workspace_id)
            return q.execute()
        r = await _run(_q)
        return r.data or []

    async def delete_conversation(self, conv_id: str):
        await _run(
            lambda: _client.table("conversations").delete()
            .eq("id", conv_id).execute()
        )

    # ═══════════════════════════════════════
    # USER PREFERENCES
    # ═══════════════════════════════════════

    async def get_preferences(self, owner_id: str) -> dict | None:
        try:
            r = await _run(
                lambda: _client.table("user_preferences").select("*")
                .eq("owner_id", owner_id).maybe_single().execute()
            )
            return r.data
        except Exception:
            return None

    async def upsert_preferences(self, owner_id: str, **kw) -> dict:
        data = {"owner_id": owner_id, "updated_at": _now(),
                **{k: v for k, v in kw.items() if v is not None}}
        r = await _run(
            lambda: _client.table("user_preferences")
            .upsert(data, on_conflict="owner_id").execute()
        )
        return r.data[0] if r.data else {}

    # ═══════════════════════════════════════
    # STATS
    # ═══════════════════════════════════════

    async def get_stats(self, owner_id: str = None) -> dict:
        def _items_q():
            q = _client.table("items").select("status, tags", count="exact")
            if owner_id: q = q.eq("owner_id", owner_id)
            return q.execute()
        def _ws_q():
            q = _client.table("workspaces").select("id", count="exact") \
                .eq("is_archived", False)
            if owner_id: q = q.eq("owner_id", owner_id)
            return q.execute()

        items_r = await _run(_items_q)
        ws_r = await _run(_ws_q)
        all_tags: set[str] = set()
        statuses: dict[str, int] = {}
        for item in (items_r.data or []):
            all_tags.update(item.get("tags") or [])
            s = item.get("status", "unknown")
            statuses[s] = statuses.get(s, 0) + 1
        return {
            "total_items": items_r.count or 0,
            "total_workspaces": ws_r.count or 0,
            "total_tags": len(all_tags),
            "statuses": statuses,
        }


repo = Repo()