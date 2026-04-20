# === FILE: backend/app/services/sync.py ===

"""
Bidirectional canvas sync.

KEY PRINCIPLES:
- Position changes → save to DB quietly
- Deletions → remove from DB so rebuild doesn't resurrect them
- Structural changes → rebuild + push
- Full reload when client is way behind
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
    stored = await repo.get_canvas(workspace_id)
    server_version = stored["version"]

    if server_version - base_version > settings.max_version_gap:
        return await _full_reload(workspace_id, owner_id, stored)

    if not incoming_scene:
        return {"status": "ok", "version": server_version}

    incoming_elements = incoming_scene.get("elements", [])
    if not incoming_elements:
        return {"status": "ok", "version": server_version}

    current_placements = await repo.get_placements(workspace_id)
    current_objects = await repo.get_canvas_objects(workspace_id)

    # ── 1. Detect position changes ──
    try:
        item_changes, obj_changes = canvas_renderer.extract_position_changes(
            incoming_elements, current_placements, current_objects,
        )
    except Exception as e:
        logger.error(f"Position extraction failed: {e}")
        item_changes, obj_changes = [], []

    # ── 2. Detect deletions ──
    try:
        deleted_item_ids, deleted_object_ids = canvas_renderer.extract_deletions(
            incoming_elements, current_placements, current_objects,
        )
    except Exception as e:
        logger.error(f"Deletion detection failed: {e}")
        deleted_item_ids, deleted_object_ids = set(), set()

    has_deletions = bool(deleted_item_ids) or bool(deleted_object_ids)

    if has_deletions:
        logger.info(
            f"Deletions detected — items: {deleted_item_ids}, "
            f"objects: {deleted_object_ids}"
        )

    # ── 3. Apply position changes ──
    for ch in item_changes:
        # Skip items that are being deleted
        if ch["item_id"] in deleted_item_ids:
            continue
        try:
            await repo.upsert_placement(
                workspace_id, ch["item_id"],
                ch["x"], ch["y"], ch["w"], ch["h"],
            )
        except Exception as e:
            logger.error(f"Placement update failed: {e}")

    for ch in obj_changes:
        obj_id = ch.get("obj_id", "")
        if obj_id in deleted_object_ids:
            continue
        try:
            oid = ch.pop("obj_id")
            await repo.update_canvas_object(oid, **ch)
        except Exception as e:
            logger.error(f"Object update failed: {e}")

    # ── 4. Apply deletions to DB ──
    for item_id in deleted_item_ids:
        try:
            await repo.delete_placement(workspace_id, item_id)
            await repo.unlink_item_from_workspace(workspace_id, item_id)
            logger.info(f"Deleted placement + unlinked item {item_id}")
        except Exception as e:
            logger.error(f"Item deletion failed for {item_id}: {e}")

    for obj_id in deleted_object_ids:
        try:
            # Check if this text block links to a captured item
            obj = next(
                (o for o in current_objects if str(o["id"]) == obj_id),
                None,
            )
            if obj:
                meta = obj.get("meta") or {}
                linked_item_id = meta.get("item_id")
                if linked_item_id and meta.get("source") == "capture":
                    # Also unlink the captured item from this workspace
                    await repo.unlink_item_from_workspace(
                        workspace_id, linked_item_id,
                    )
                    logger.info(f"Unlinked captured item {linked_item_id}")

            await repo.delete_canvas_object(obj_id)
            logger.info(f"Deleted canvas object {obj_id}")
        except Exception as e:
            logger.error(f"Object deletion failed for {obj_id}: {e}")

    # ── 5. Decide response ──
    if has_deletions:
        # Structural change → full rebuild so scene is clean
        result = await handle_structural_rebuild(workspace_id, owner_id)

        await repo.log_op(
            workspace_id, result["version"], "user_delete",
            actor="user",
            data={
                "deleted_items": list(deleted_item_ids),
                "deleted_objects": list(deleted_object_ids),
            },
        )

        await broadcaster.publish(workspace_id, {
            "type": "canvas_updated",
            "version": result["version"],
            "op": "user_delete",
        })

        return {
            "status": "rebuilt",
            "version": result["version"],
            "scene": result["scene"],
        }

    # No deletions — just save positions
    items = await repo.get_items_for_workspace(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    managed_ids = canvas_renderer.collect_managed_ids(items, objects)
    user_drawn = canvas_renderer.extract_user_drawn(incoming_elements, managed_ids)

    has_position_changes = bool(item_changes) or bool(obj_changes)

    if has_position_changes:
        new_version = server_version + 1
        scene_to_save = {
            "elements": incoming_elements,
            "appState": incoming_scene.get(
                "appState", stored["scene"].get("appState", {}),
            ),
            "files": incoming_scene.get("files", {}),
        }
        await repo.save_canvas(workspace_id, scene_to_save, new_version)
        await repo.log_op(workspace_id, new_version, "user_move", actor="user")
        return {"status": "ok", "version": new_version}
    else:
        scene_to_save = {
            "elements": incoming_elements,
            "appState": incoming_scene.get(
                "appState", stored["scene"].get("appState", {}),
            ),
            "files": incoming_scene.get("files", {}),
        }
        await repo.save_canvas(workspace_id, scene_to_save, server_version)
        return {"status": "ok", "version": server_version}


async def handle_structural_rebuild(
    workspace_id: str,
    owner_id: str = None,
) -> dict:
    stored = await repo.get_canvas(workspace_id)

    items = await repo.get_items_for_workspace(workspace_id)
    placements = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)

    managed_ids = canvas_renderer.collect_managed_ids(items, objects)
    user_drawn = canvas_renderer.extract_user_drawn(
        stored["scene"].get("elements", []), managed_ids,
    )

    scene = canvas_renderer.build_scene(
        items, placements, objects, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )

    new_version = stored["version"] + 1
    await repo.save_canvas(workspace_id, scene, new_version)

    return {
        "status": "rebuilt",
        "version": new_version,
        "scene": scene,
    }


async def _full_reload(workspace_id: str, owner_id: str, stored: dict) -> dict:
    items = await repo.get_items_for_workspace(workspace_id)
    placements = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    scene = canvas_renderer.build_scene(
        items, placements, objects, [],
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )
    return {
        "status": "full_reload",
        "version": stored["version"],
        "scene": scene,
    }