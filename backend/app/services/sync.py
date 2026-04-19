"""
Scene sync — three-way merge between frontend and backend.
"""

from __future__ import annotations
import logging

from app.db.supabase import db
from app.excalidraw.scene import normalize_scene
from app.services import operations as ops_svc
from app.config import settings

logger = logging.getLogger("mnemos.sync")


async def handle_sync(
    page_id: str,
    base_version: int,
    changes: dict,
    full_scene: dict | None = None,
) -> dict:
    """
    Handle frontend sync request.
    Returns sync response with status and any server changes.
    """
    stored = await db.get_scene(page_id)
    server_version = stored["version"]
    server_scene = normalize_scene(stored["scene"])

    # No server changes since last sync — fast path
    if server_version == base_version:
        if full_scene:
            new_scene = normalize_scene(full_scene)
        else:
            new_scene = _apply_changes(server_scene, changes)

        new_version = server_version + 1
        await db.save_scene(page_id, new_scene, new_version)
        await ops_svc.log_and_notify(
            page_id, new_version, "user_sync", actor="user",
        )
        return {"status": "ok", "version": new_version}

    # Server has changes — merge needed
    gap = server_version - base_version

    if gap > settings.sync_max_version_gap:
        # Too far behind — send full scene
        return {
            "status": "full_rebuild",
            "version": server_version,
            "scene": server_scene,
        }

    # Get server operations since base_version
    server_ops = await db.get_scene_ops_since(page_id, base_version)

    # Compute what server added (new element IDs)
    server_new_ids: set[str] = set()
    for op in server_ops:
        if op.get("actor") != "user":
            server_new_ids.update(op.get("element_ids", []))

    # Merge: start with server scene, apply user changes
    merged = _merge(server_scene, changes, server_new_ids, base_version)

    new_version = server_version + 1
    await db.save_scene(page_id, merged, new_version    )
    await ops_svc.log_and_notify(
        page_id, new_version, "user_sync", actor="user",
    )

    # Compute delta to send back (only server's new elements)
    new_elements = [
        el for el in merged.get("elements", [])
        if el.get("id") in server_new_ids
    ]

    return {
        "status": "merged",
        "version": new_version,
        "new_elements": new_elements,
        "server_ops_applied": len(server_ops),
    }


def _apply_changes(scene: dict, changes: dict) -> dict:
    """Apply frontend changes to scene."""
    elements = scene.get("elements", [])
    el_map = {el["id"]: el for el in elements}

    # Apply additions
    for el in changes.get("added", []):
        el_map[el["id"]] = el

    # Apply modifications
    for mod in changes.get("modified", []):
        el_id = mod.get("id")
        if el_id and el_id in el_map:
            el_map[el_id].update({k: v for k, v in mod.items() if k != "id"})
            el_map[el_id]["version"] = el_map[el_id].get("version", 1) + 1

    # Apply deletions
    for el_id in changes.get("deleted", []):
        if el_id in el_map:
            del el_map[el_id]

    scene["elements"] = list(el_map.values())
    return scene


def _merge(
    server_scene: dict,
    user_changes: dict,
    server_new_ids: set[str],
    base_version: int,
) -> dict:
    """
    Three-way merge.
    Strategy:
      - Start with server scene (includes AI additions)
      - Apply user additions (user-drawn elements)
      - Apply user modifications (user moved/edited elements)
      - Handle deletions carefully (don't delete AI additions user hasn't seen)
    """
    elements = server_scene.get("elements", [])
    el_map = {el["id"]: el for el in elements}

    # User additions — always accept
    for el in user_changes.get("added", []):
        if el["id"] not in el_map:
            el_map[el["id"]] = el

    # User modifications
    for mod in user_changes.get("modified", []):
        el_id = mod.get("id")
        if not el_id or el_id not in el_map:
            continue

        existing = el_map[el_id]
        is_server_new = el_id in server_new_ids

        if is_server_new:
            # Server added this element after user's base_version.
            # Only accept position changes from user (they dragged it).
            # Content stays as server set it.
            for field in ("x", "y"):
                if field in mod:
                    existing[field] = mod[field]
        else:
            # Element existed before — user wins on all changes
            existing.update({k: v for k, v in mod.items() if k != "id"})

        existing["version"] = existing.get("version", 1) + 1

    # User deletions
    for el_id in user_changes.get("deleted", []):
        if el_id in el_map:
            if el_id in server_new_ids:
                # User hasn't seen this element — don't delete
                pass
            else:
                del el_map[el_id]

    # Overlap resolution
    final_elements = list(el_map.values())
    final_elements = _resolve_overlaps(final_elements)

    server_scene["elements"] = final_elements
    return server_scene


def _resolve_overlaps(elements: list[dict]) -> list[dict]:
    """
    Check for overlapping element groups and shift to fix.
    Groups are identified by customData.noteId or first groupId.
    """
    # Group elements by their logical block
    groups: dict[str, list[dict]] = {}
    ungrouped: list[dict] = []

    for el in elements:
        if el.get("isDeleted"):
            ungrouped.append(el)
            continue
        custom = el.get("customData") if isinstance(el.get("customData"), dict) else {}
        note_id = custom.get("noteId")
        diagram_id = custom.get("diagramId")
        group_key = note_id or diagram_id

        if group_key:
            groups.setdefault(group_key, []).append(el)
        else:
            gids = el.get("groupIds", [])
            if gids:
                groups.setdefault(gids[0], []).append(el)
            else:
                ungrouped.append(el)

    if not groups:
        return elements

    # Compute bounding boxes per group
    group_bounds = []
    for key, group_els in groups.items():
        active = [e for e in group_els if not e.get("isDeleted")]
        if not active:
            continue
        min_y = min(e.get("y", 0) for e in active)
        max_y = max(e.get("y", 0) + e.get("height", 0) for e in active)
        group_bounds.append({
            "key": key,
            "y_start": min_y,
            "y_end": max_y,
            "elements": group_els,
        })

    group_bounds.sort(key=lambda g: g["y_start"])

    # Fix overlaps
    min_gap = 40
    for i in range(1, len(group_bounds)):
        prev = group_bounds[i - 1]
        curr = group_bounds[i]
        overlap = prev["y_end"] + min_gap - curr["y_start"]

        if overlap > 0:
            # Shift this group and everything below
            for j in range(i, len(group_bounds)):
                for el in group_bounds[j]["elements"]:
                    el["y"] = el.get("y", 0) + overlap
                group_bounds[j]["y_start"] += overlap
                group_bounds[j]["y_end"] += overlap

    # Reassemble
    result = ungrouped[:]
    for gb in group_bounds:
        result.extend(gb["elements"])
    return result