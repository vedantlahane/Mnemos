# === FILE: backend/app/services/sync.py ===

"""
Bidirectional canvas sync — redesigned.

KEY PRINCIPLE: Don't fight the user.
- Position-only changes → save to DB, return {status: "ok"}, NO scene push
- Structural changes (add/remove items) → rebuild + push
- Full reload only when client is way behind
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

    # ── Client too far behind → full reload ──
    if server_version - base_version > settings.max_version_gap:
        return await _full_reload(workspace_id, owner_id, stored)

    # ── No incoming scene → just confirm version ──
    if not incoming_scene:
        return {"status": "ok", "version": server_version}

    incoming_elements = incoming_scene.get("elements", [])
    if not incoming_elements:
        return {"status": "ok", "version": server_version}

    # ── Extract what the user changed ──
    current_placements = await repo.get_placements(workspace_id)
    current_objects = await repo.get_canvas_objects(workspace_id)

    try:
        item_changes, obj_changes = canvas_renderer.extract_position_changes(
            incoming_elements, current_placements, current_objects,
        )
    except Exception as e:
        logger.error(f"Position extraction failed: {e}")
        item_changes, obj_changes = [], []

    # ── Save position changes to DB ──
    for ch in item_changes:
        try:
            await repo.upsert_placement(
                workspace_id, ch["item_id"],
                ch["x"], ch["y"], ch["w"], ch["h"],
            )
        except Exception as e:
            logger.error(f"Placement update failed: {e}")

    for ch in obj_changes:
        try:
            oid = ch.pop("obj_id")
            await repo.update_canvas_object(oid, **ch)
        except Exception as e:
            logger.error(f"Object update failed: {e}")

    # ── Save user-drawn elements into the scene blob ──
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    objects = await repo.get_canvas_objects(workspace_id)
    managed_ids = canvas_renderer.collect_managed_ids(items, objects)
    user_drawn = canvas_renderer.extract_user_drawn(incoming_elements, managed_ids)

    # ── CRITICAL DECISION: rebuild or just save? ──
    #
    # If the user only moved things around, DON'T rebuild.
    # Just persist their positions and the user-drawn elements.
    # Only rebuild when we detect structural changes.

    has_position_changes = bool(item_changes) or bool(obj_changes)

    if has_position_changes:
        # Save the incoming scene AS-IS (with user's positions)
        # plus update user_drawn in stored scene
        new_version = server_version + 1

        # Merge: keep the incoming elements but update the stored scene's
        # metadata (version, user_drawn tracking)
        scene_to_save = {
            "elements": incoming_elements,
            "appState": incoming_scene.get("appState", stored["scene"].get("appState", {})),
            "files": incoming_scene.get("files", {}),
        }

        await repo.save_canvas(workspace_id, scene_to_save, new_version)
        await repo.log_op(workspace_id, new_version, "user_move", actor="user")

        # DON'T send scene back — user already has the right state
        return {
            "status": "ok",
            "version": new_version,
            # NO "scene" key — this tells the frontend "you're good, keep what you have"
        }
    else:
        # No position changes — just save user-drawn elements
        # Build a minimal update: store user_drawn into the scene blob
        # without changing anything the user sees

        # Persist user_drawn into stored scene
        scene_to_save = {
            "elements": incoming_elements,
            "appState": incoming_scene.get("appState", stored["scene"].get("appState", {})),
            "files": incoming_scene.get("files", {}),
        }
        await repo.save_canvas(workspace_id, scene_to_save, server_version)

        return {
            "status": "ok",
            "version": server_version,
            # NO scene — frontend keeps its state
        }


async def handle_structural_rebuild(
    workspace_id: str,
    owner_id: str = None,
) -> dict:
    """
    Called when something structural changes (item added, diagram created, theme change).
    This DOES rebuild and return the full scene.
    """
    stored = await repo.get_canvas(workspace_id)
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    placements = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)

    # Get user-drawn from the stored scene
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
        "version": stored["version"],
        "scene": scene,
    }