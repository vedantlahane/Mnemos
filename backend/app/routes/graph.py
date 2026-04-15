# === FILE: backend/app/routes/graph.py ===
"""Graph routes — edges between notes + clustering."""

from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import EdgeCreate
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/graph/edges")
async def get_all_edges(user_id: str = Depends(get_optional_user_id)):
    edges = await db.get_all_edges(user_id=user_id)
    return {"edges": edges}


@router.get("/graph/edges/note/{note_id}")
async def get_note_edges(note_id: str):
    return {"edges": await db.get_edges_for_note(note_id)}


@router.get("/graph/edges/page/{page_id}")
async def get_page_edges(page_id: str):
    return {"edges": await db.get_edges_for_page(page_id)}


@router.post("/graph/edges")
async def create_edge(payload: EdgeCreate):
    if payload.source_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Self-edges not allowed")
    edge = await db.insert_edge_if_not_exists(
        source_id=payload.source_id, target_id=payload.target_id,
        edge_type=payload.edge_type, label=payload.label,
        strength=payload.strength, created_by=payload.created_by,
    )
    if not edge:
        raise HTTPException(status_code=409, detail="Edge already exists")
    return edge


@router.delete("/graph/edges/{edge_id}")
async def delete_edge(edge_id: str):
    await db.delete_edge(edge_id)
    return {"status": "deleted"}


@router.get("/graph/full")
async def get_full_graph(user_id: str = Depends(get_optional_user_id)):
    """Full knowledge graph — all notes as nodes, all edges."""
    notes_result = await db.list_notes(page=1, limit=500, user_id=user_id)
    notes = notes_result.get("notes", [])
    edges = await db.get_all_edges(user_id=user_id)

    nodes = [
        {
            "id": n["id"], "title": n.get("title") or "Untitled",
            "tags": n.get("tags", []), "page_id": n.get("page_id"),
            "content_type": n.get("content_type", "note"),
        }
        for n in notes
    ]

    return {"nodes": nodes, "edges": edges}