from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import EdgeCreate
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/graph")
async def get_full_graph(user_id: str = Depends(get_optional_user_id)):
    notes_result = await db.list_notes(page=1, limit=500, user_id=user_id)
    all_notes = notes_result.get("notes", [])
    all_edges = await db.get_all_edges(user_id=user_id)

    nodes = [
        {
            "id": n["id"],
            "title": n.get("title") or "Untitled",
            "tags": n.get("tags", []),
            "page_id": n.get("page_id"),
            "content_type": n.get("content_type", "note"),
            "created_at": n.get("created_at"),
        }
        for n in all_notes
    ]
    edges = [
        {
            "id": e["id"],
            "source": e["source_id"],
            "target": e["target_id"],
            "type": e.get("edge_type", "related"),
            "label": e.get("label"),
            "strength": e.get("strength", 0),
        }
        for e in all_edges
    ]
    return {"nodes": nodes, "edges": edges}


@router.get("/pages/{page_id}/graph")
async def get_page_graph(page_id: str, user_id: str = Depends(get_optional_user_id)):
    notes = await db.get_notes_for_page(page_id, user_id=user_id)
    edges = await db.get_edges_for_page(page_id)
    note_ids = {n["id"] for n in notes}

    nodes = [
        {
            "id": n["id"],
            "title": n.get("title") or "Untitled",
            "tags": n.get("tags", []),
            "content_type": n.get("content_type", "note"),
        }
        for n in notes
    ]
    filtered_edges = [
        {
            "id": e["id"],
            "source": e["source_id"],
            "target": e["target_id"],
            "type": e.get("edge_type", "related"),
            "label": e.get("label"),
            "strength": e.get("strength", 0),
        }
        for e in edges
        if e["source_id"] in note_ids and e["target_id"] in note_ids
    ]
    return {"nodes": nodes, "edges": filtered_edges}


@router.post("/edges")
async def create_edge(payload: EdgeCreate,
                      user_id: str = Depends(get_optional_user_id)):
    source = await db.get_note(payload.source_id, user_id=user_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source note not found")
    target = await db.get_note(payload.target_id, user_id=user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target note not found")
    if payload.source_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Cannot link note to itself")

    edge = await db.insert_edge_if_not_exists(
        source_id=payload.source_id, target_id=payload.target_id,
        edge_type=payload.edge_type, label=payload.label,
        strength=payload.strength, created_by=payload.created_by,
    )
    if not edge:
        raise HTTPException(status_code=409, detail="Edge already exists")
    return edge


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str):
    await db.delete_edge(edge_id)
    return {"status": "deleted", "edge_id": edge_id}


@router.get("/notes/{note_id}/related")
async def get_related_notes(note_id: str, limit: int = 10,
                            user_id: str = Depends(get_optional_user_id)):
    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Get graph neighbors
    edges = await db.get_edges_for_note(note_id)
    neighbor_ids = set()
    for e in edges:
        neighbor_ids.add(e["target_id"] if e["source_id"] == note_id else e["source_id"])

    # Get vector neighbors
    emb = await db.get_embedding(note_id)
    vector_results = []
    if emb:
        vector_results = await db.vector_search(emb, limit=limit, threshold=0.55)
        vector_results = [r for r in vector_results if r["id"] != note_id]

    # Merge
    seen = set()
    related = []
    for r in vector_results:
        if r["id"] not in seen:
            seen.add(r["id"])
            related.append({
                **r,
                "relation": "vector",
                "is_graph_neighbor": r["id"] in neighbor_ids,
            })

    return {"related": related[:limit], "edges": edges}