from fastapi import APIRouter, HTTPException, Depends, Query
from app.models.schemas import NoteUpdate, NoteMoveRequest
from app.db.supabase import db
from app.excalidraw.scene import normalize_scene
from app.excalidraw import scene_manager
from app.services import operations as ops_svc
from app.services import cache as cache_svc
from app.services.placement import find_placement
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/notes")
async def list_notes(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    tag: str = None,
    page_id: str = None,
    user_id: str = Depends(get_optional_user_id),
):
    result = await db.list_notes(
        page=page, limit=limit, tag=tag,
        page_id=page_id, user_id=user_id,
    )
    return {
        "notes": result["notes"],
        "total": result["total"],
        "page": page,
        "limit": limit,
    }


@router.get("/notes/tags")
async def get_all_tags(user_id: str = Depends(get_optional_user_id)):
    tags = await db.get_all_tags_with_counts(user_id=user_id)
    return {"tags": tags}


@router.get("/notes/{note_id}")
async def get_note(note_id: str, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    edges = await db.get_edges_for_note(note_id)
    return {**note, "edges": edges}


@router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NoteUpdate,
                      user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.update_note(note_id, user_id=user_id, **updates)

    # Update canvas card if note is on a page
    if note.get("page_id"):
        try:
            updated_note = await db.get_note(note_id)
            stored = await db.get_scene(note["page_id"])
            scene = normalize_scene(stored["scene"])
            scene = scene_manager.update_note_card_content(scene, updated_note)
            new_version = stored["version"] + 1
            await db.save_scene(note["page_id"], scene, new_version)
            await ops_svc.log_and_notify(
                note["page_id"], new_version, "update_elements",
                actor="user", payload={"note_id": note_id},
            )
        except Exception:
            pass

    return result


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Remove from canvas
    if note.get("page_id"):
        try:
            stored = await db.get_scene(note["page_id"])
            scene = normalize_scene(stored["scene"])
            scene, removed = scene_manager.remove_note_card(scene, note_id)
            if removed:
                new_version = stored["version"] + 1
                await db.save_scene(note["page_id"], scene, new_version)
                await ops_svc.log_and_notify(
                    note["page_id"], new_version, "remove_note_card",
                    actor="user", element_ids=removed,
                    payload={"note_id": note_id},
                )
        except Exception:
            pass

    await db.delete_note(note_id, user_id=user_id)
    await cache_svc.invalidate_overview()
    return {"status": "deleted", "note_id": note_id}


@router.post("/notes/{note_id}/move")
async def move_note(note_id: str, payload: NoteMoveRequest,
                    user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    target_page = await db.get_page(payload.page_id, user_id=user_id)
    if not target_page:
        raise HTTPException(status_code=404, detail="Target page not found")

    old_page_id = note.get("page_id")

    # Remove from old canvas
    if old_page_id and old_page_id != payload.page_id:
        try:
            stored = await db.get_scene(old_page_id)
            scene = normalize_scene(stored["scene"])
            scene, removed = scene_manager.remove_note_card(scene, note_id)
            if removed:
                new_version = stored["version"] + 1
                await db.save_scene(old_page_id, scene, new_version)
                await ops_svc.log_and_notify(
                    old_page_id, new_version, "remove_note_card",
                    actor="user", element_ids=removed,
                    payload={"note_id": note_id},
                )
        except Exception:
            pass

    # Update note
    await db.update_note(note_id, page_id=payload.page_id)

    # Place on new canvas
    try:
        updated_note = await db.get_note(note_id)
        stored = await db.get_scene(payload.page_id)
        scene = normalize_scene(stored["scene"])
        placement = await find_placement(
            payload.page_id, scene, note=updated_note, strategy="auto",
        )
        scene, element_ids = scene_manager.upsert_note_card(
            scene, updated_note, placement.x, placement.y,
        )
        new_version = stored["version"] + 1
        await db.save_scene(payload.page_id, scene, new_version)
        await db.update_note(note_id, canvas_x=placement.x, canvas_y=placement.y, element_ids=element_ids)
        await ops_svc.log_and_notify(
            payload.page_id, new_version, "add_note_card",
            actor="user", element_ids=element_ids,
            payload={"note_id": note_id},
        )
    except Exception:
        pass

    await cache_svc.invalidate_overview()
    return {"status": "moved", "note_id": note_id, "page_id": payload.page_id}


@router.get("/pages/{page_id}/notes")
async def get_page_notes(page_id: str, user_id: str = Depends(get_optional_user_id)):
    notes = await db.get_notes_for_page(page_id, user_id=user_id)
    return {"notes": notes, "count": len(notes)}