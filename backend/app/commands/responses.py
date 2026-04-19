# === FILE: backend/app/commands/responses.py ===

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class CommandResponse:
    """
    What the frontend renders. Every chat message returns one of these.

    text:           conversational reply shown in chat
    ui_action:      tells frontend what to show/open
    data:           structured payload (list of boards, search results, etc.)
    canvas_update:  tells frontend to reload canvas scene
    """
    text: str
    intent: str = "chat"
    ui_action: Optional[str] = None     # open_settings, list_boards, etc.
    data: Optional[Any] = None
    canvas_update: Optional[dict] = None
    error: Optional[str] = None