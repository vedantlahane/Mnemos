"""SSE broadcaster for real-time scene updates."""

from __future__ import annotations
import asyncio
import json
import logging

logger = logging.getLogger("mnemos.broadcaster")


class Broadcaster:
    def __init__(self):
        self._listeners: dict[str, list[asyncio.Queue]] = {}

    def subscribe(self, page_id: str) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=100)
        self._listeners.setdefault(page_id, []).append(queue)
        logger.debug(f"SSE subscriber added for page {page_id[:8]}")
        return queue

    def unsubscribe(self, page_id: str, queue: asyncio.Queue):
        listeners = self._listeners.get(page_id, [])
        if queue in listeners:
            listeners.remove(queue)
        if not listeners and page_id in self._listeners:
            del self._listeners[page_id]

    async def notify(self, page_id: str, event: dict):
        for queue in self._listeners.get(page_id, []):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(f"SSE queue full for page {page_id[:8]}, dropping event")

    def listener_count(self, page_id: str) -> int:
        return len(self._listeners.get(page_id, []))


broadcaster = Broadcaster()