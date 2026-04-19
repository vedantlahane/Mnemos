"""
Scene operation log — tracks all changes for sync/merge.
"""

from __future__ import annotations
import logging

from app.db.supabase import db
from app.services.broadcaster import broadcaster

logger = logging.getLogger("mnemos.operations")


async def log_and_notify(
    page_id: str,
    version: int,
    op_type: str,
    actor: str = "ai",
    element_ids: list[str] = None,
    payload: dict = None,
):
    """Log operation and notify connected frontends."""
    await db.log_scene_op(
        page_id=page_id, version=version,
        op_type=op_type, actor=actor,
        element_ids=element_ids, payload=payload,
    )

    await broadcaster.notify(page_id, {
        "type": "scene_updated",
        "version": version,
        "op_type": op_type,
        "actor": actor,
    })