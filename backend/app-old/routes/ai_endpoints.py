# === FILE: backend/app/routes/ai_endpoints.py ===

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from app.db.supabase import db
from app.agents.analyst import analyst_graph
from app.agents.canvas_architect import canvas_architect_graph
from app.services.spatial_planner import spatial_planner
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


class GapAnalysisRequest(BaseModel):
    page_id: Optional[str] = None


class ReadingPathRequest(BaseModel):
    topic: Optional[str] = None
    page_id: Optional[str] = None


class DiagramRequest(BaseModel):
    request: str
    page_id: Optional[str] = None


@router.post("/pages/{page_id}/ai-layout")
async def ai_layout(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    initial_state = {
        "page_id": page_id,
        "notes": [],
        "embeddings_matrix": None,
        "coords_2d": None,
        "cluster_labels": None,
        "cluster_map": {},
        "centrality_scores": {},
        "bridge_notes": [],
        "positions": [],
        "clusters": [],
        "edges": [],
        "errors": [],
        "status": "loading",
    }

    result = await canvas_architect_graph.ainvoke(initial_state)

    edges_data = await db.get_edges_for_page(page_id)
    edges_out = [
        {"source_id": e["source_id"], "target_id": e["target_id"], "edge_type": e["edge_type"]}
        for e in edges_data
    ]

    return {
        "positions": result.get("positions", []),
        "clusters": result.get("clusters", []),
        "edges": edges_out,
    }


@router.post("/pages/{page_id}/ai-position")
async def ai_position(page_id: str, payload: dict, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    note_id = payload.get("note_id")
    if not note_id:
        raise HTTPException(status_code=400, detail="note_id required")

    note = await db.get_note(note_id, user_id=user_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    placement = await spatial_planner.find_placement(
        page_id=page_id,
        note=note,
        strategy="auto",
    )

    return {"x": placement.x, "y": placement.y, "cluster": placement.cluster_id}


@router.post("/pages/{page_id}/summary")
async def page_summary(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    result = await analyst_graph.ainvoke({
        "task": "page_summary",
        "page_id": page_id,
        "user_id": user_id,
        "topic": None,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })
    return result.get("result", {"summary": "", "key_topics": [], "connections": []})


@router.post("/ai/gap-analysis")
async def gap_analysis(payload: GapAnalysisRequest, user_id: str = Depends(get_optional_user_id)):
    result = await analyst_graph.ainvoke({
        "task": "gap_analysis",
        "page_id": payload.page_id,
        "user_id": user_id,
        "topic": None,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })
    return result.get("result", {"covered": [], "missing": [], "suggestions": []})


@router.post("/ai/reading-path")
async def reading_path(payload: ReadingPathRequest, user_id: str = Depends(get_optional_user_id)):
    result = await analyst_graph.ainvoke({
        "task": "reading_path",
        "page_id": payload.page_id,
        "user_id": user_id,
        "topic": payload.topic,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })
    return result.get("result", {"steps": []})


@router.post("/ai/generate-diagram")
async def generate_diagram_endpoint(payload: DiagramRequest, user_id: str = Depends(get_optional_user_id)):
    from app.services.canvas_gen import generate_diagram as gen_diagram, fallback_diagram

    context = ""
    if payload.page_id:
        try:
            page = await db.get_page(payload.page_id, user_id=user_id)
            notes = await db.get_notes_for_page(payload.page_id, user_id=user_id)
            context_parts = [
                f"Note: {n.get('title', 'Untitled')} — {n.get('summary', '')[:200]}"
                for n in notes[:8]
            ]
            context = "\n".join(context_parts)
        except Exception:
            pass

    selected_model = None
    try:
        user_settings = await db.get_settings(user_id=user_id)
        if isinstance(user_settings, dict):
            m = user_settings.get("model")
            if isinstance(m, str) and m.strip():
                selected_model = m.strip()
    except Exception:
        pass

    try:
        topology = await gen_diagram(payload.request, context, model=selected_model)
        return {"topology": topology}
    except Exception as e:
        topology = fallback_diagram(payload.request)
        return {
            "topology": topology,
            "degraded": True,
            "reason": "diagram_generation_fallback",
            "detail": str(e),
        }