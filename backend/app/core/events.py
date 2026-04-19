# === FILE: backend/app/core/events.py ===

"""
In-process event bus.
Decouples: capture doesn't know about canvas. Canvas doesn't know about search.
"""

from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Callable, Awaitable

logger = logging.getLogger("mnemos.events")


@dataclass(frozen=True)
class Event:
    kind: str
    data: dict = field(default_factory=dict)


# Event kinds
ITEM_CREATED     = "item.created"
ITEM_UPDATED     = "item.updated"
ITEM_DELETED     = "item.deleted"
ITEM_READY       = "item.ready"        # processing done
ITEM_PLACED      = "item.placed"       # put on canvas
CANVAS_CHANGED   = "canvas.changed"
WORKSPACE_CREATED = "workspace.created"

Handler = Callable[[Event], Awaitable[None]]


class EventBus:
    def __init__(self):
        self._handlers: dict[str, list[Handler]] = {}

    def on(self, kind: str, handler: Handler):
        self._handlers.setdefault(kind, []).append(handler)

    async def emit(self, event: Event):
        logger.debug(f"Event: {event.kind}")
        for h in self._handlers.get(event.kind, []):
            try:
                await h(event)
            except Exception as e:
                logger.error(f"Handler failed for {event.kind}: {e}")


bus = EventBus()