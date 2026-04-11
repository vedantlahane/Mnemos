import asyncio
from datetime import datetime, timedelta
from supabase import create_client
from app.config import settings

client = create_client(settings.supabase_url, settings.supabase_key)


class NotesDB:

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
        self, page: int = 1, limit: int = 20, tag: str = None
    ) -> dict:
        def _query():
            query = client.table("notes").select("*", count="exact")
            if tag:
                query = query.contains("tags", [tag])
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


db = NotesDB()