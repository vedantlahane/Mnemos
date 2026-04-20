# === FILE: backend/app/services/sync.py ===

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
    current_placements = await repo.get_placements(workspace_id)
    current_objects = await repo.get_canvas_objects(workspace_id)

    try:
        item_changes, obj_changes = canvas_renderer.extract_position_changes(
            incoming_elements, current_placements, current_objects
        )
    except Exception as e:
        logger.error(f"extract_position_changes failed: {e}")
        item_changes, obj_changes = [], []

    has_changes = bool(item_changes) or bool(obj_changes)

    for change in item_changes:
        try:
            await repo.upsert_placement(
                workspace_id, change["item_id"],
                change["x"], change["y"], change["w"], change["h"],
            )
        except Exception as e:
            logger.error(f"Failed to update placement {change.get('item_id')}: {e}")

    for change in obj_changes:
        try:
            obj_id = change.pop("obj_id")
            await repo.update_canvas_object(obj_id, **change)
        except Exception as e:
            logger.error(f"Failed to update canvas object: {e}")

    # ── Extract user-drawn elements ──
    # Compute managed IDs so we can definitively filter
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    objects_latest = await repo.get_canvas_objects(workspace_id)
    managed_ids = canvas_renderer._collect_managed_ids(items, objects_latest)

    user_drawn = canvas_renderer.extract_user_drawn(
        incoming_elements, managed_ids=managed_ids,
    )

    # ── FORWARD SYNC: rebuild scene from truth ──
    placements = await repo.get_placements(workspace_id)

    scene = canvas_renderer.build_scene(
        items, placements, objects_latest, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )

    if has_changes:
        new_version = server_version + 1
        await repo.save_canvas(workspace_id, scene, new_version)
        await repo.log_op(workspace_id, new_version, "user_sync", actor="user")

        await broadcaster.notify(workspace_id, {
            "type": "canvas_updated", "version": new_version,
            "op": "user_sync",
        })
    else:
        new_version = server_version
        # Still save the scene (preserves user-drawn elements) but don't bump version
        await repo.save_canvas(workspace_id, scene, new_version)

    # ALWAYS return the rebuilt scene so frontend has the authoritative state
    return {
        "status": "ok",
        "version": new_version,
        "scene": scene,
    }