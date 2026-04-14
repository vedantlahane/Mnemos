from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from app.models.schemas import EdgeCreate
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/edges")
async def list_edges(
    page_id: Optional[str] = None,
    note_id: Optional[str] = None,
    user_id: str = Depends(get_optional_user_id),
):
    if page_id:
        page = await db.get_page(page_id, user_id=user_id)
        if not page:
            return {"edges": []}
    if note_id:
        note = await db.get_note(note_id, user_id=user_id)
        if not note:
            return {"edges": []}

    if not page_id and not note_id and user_id:
        return {"edges": await db.get_all_edges(user_id=user_id)}

    edges = await db.list_edges(page_id=page_id, note_id=note_id)
    return {"edges": edges}


@router.post("/edges")
async def create_edge(payload: EdgeCreate, user_id: str = Depends(get_optional_user_id)):
    # Verify both notes exist
    source = await db.get_note(payload.source_id, user_id=user_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source note not found")
    target = await db.get_note(payload.target_id, user_id=user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target note not found")

    # Check duplicate
    exists = await db.edge_exists(payload.source_id, payload.target_id)
    if exists:
        raise HTTPException(status_code=400, detail="Edge already exists between these notes")

    valid_types = ["related", "depends_on", "extends", "contradicts", "summarizes", "example_of"]
    if payload.edge_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid edge_type. Must be one of: {', '.join(valid_types)}",
        )

    edge = await db.insert_edge(
        source_id=payload.source_id,
        target_id=payload.target_id,
        edge_type=payload.edge_type,
        label=payload.label,
        strength=payload.strength,
        created_by=payload.created_by,
    )
    return edge


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, user_id: str = Depends(get_optional_user_id)):
    if user_id:
        user_edges = await db.get_all_edges(user_id=user_id)
        if not any(e.get("id") == edge_id for e in user_edges):
            raise HTTPException(status_code=404, detail="Edge not found")
    await db.delete_edge(edge_id)
    return {"status": "deleted"}