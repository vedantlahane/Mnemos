# === FILE: backend/app/services/sync.py ===

"""
Canvas sync.
Frontend saves Excalidraw scene → we extract position changes → update placements.
Backend changes items → we rebuild scene from placements.
"""

from __future__ import annotations
import logging

from app.db.repo import repo
from app.canvas import canvas_renderer
from app.services.broadcaster import broadcaster
from app.core.config import settings

logger = logging.getLogger("mnemos.sync")


async def handle_sync(
    workspace_id: str,
    base_version: int,
    incoming_scene: dict = None,
    owner_id: str = None,
) -> dict:
    """
    Handle frontend scene save.

    1. Extract position changes from incoming scene → update canvas_placements
    2. Merge user-drawn elements
    3. Rebuild scene from source-of-truth tables
    4. Save and return new version
    """
    stored = await repo.get_canvas(workspace_id)
    server_version = stored["version"]

    # Too far behind — full reload
    if server_version - base_version > settings.max_version_gap:
        items = await repo.get_items_for_workspace(workspace_id, owner_id)
        placements = await repo.get_placements(workspace_id)
        objects = await repo.get_canvas_objects(workspace_id)
        scene = canvas_renderer.build_scene(
            items, placements, objects, [],
            theme=stored.get("theme", "dark"),
            background=stored.get("background", "#0e0e1a"),
        )
        return {
            "status": "full_reload",
            "version": server_version,
            "scene": scene,
        }

    if not incoming_scene:
        return {"status": "ok", "version": server_version}

    incoming_elements = incoming_scene.get("elements", [])

    # ── REVERSE SYNC: scene → placements ──
    # User may have dragged items around. Extract those position changes.
    current_placements = await repo.get_placements(workspace_id)
    position_changes = canvas_renderer.extract_position_changes(
        incoming_elements, current_placements,
    )
    for change in position_changes:
        await repo.upsert_placement(
            workspace_id, change["item_id"],
            change["x"], change["y"], change["w"], change["h"],
        )

    # ── Extract user-drawn elements ──
    user_drawn = canvas_renderer.extract_user_drawn(incoming_elements)

    # ── FORWARD SYNC: rebuild scene from truth ──
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    placements = await repo.get_placements(workspace_id)  # re-fetch after updates
    objects = await repo.get_canvas_objects(workspace_id)

    scene = canvas_renderer.build_scene(
        items, placements, objects, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )

    new_version = server_version + 1
    await repo.save_canvas(workspace_id, scene, new_version)
    await repo.log_op(workspace_id, new_version, "user_sync", actor="user")

    await broadcaster.notify(workspace_id, {
        "type": "canvas_updated", "version": new_version,
        "op": "user_sync",
    })

    return {"status": "ok", "version": new_version}