# === FILE: backend/app/services/broadcaster.py ===

"""SSE broadcaster for real-time canvas updates."""

from __future__ import annotations
import asyncio
import logging

logger = logging.getLogger("mnemos.broadcaster")


class Broadcaster:
    def __init__(self):
        self._listeners: dict[str, list[asyncio.Queue]] = {}

    def subscribe(self, workspace_id: str) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._listeners.setdefault(workspace_id, []).append(q)
        return q

    def unsubscribe(self, workspace_id: str, q: asyncio.Queue):
        listeners = self._listeners.get(workspace_id, [])
        if q in listeners:
            listeners.remove(q)
        if not listeners and workspace_id in self._listeners:
            del self._listeners[workspace_id]

    async def notify(self, workspace_id: str, event: dict):
        for q in self._listeners.get(workspace_id, []):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(f"SSE queue full for {workspace_id[:8]}")

    def listener_count(self, workspace_id: str) -> int:
        return len(self._listeners.get(workspace_id, []))


broadcaster = Broadcaster()