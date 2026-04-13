from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from app.db.supabase import db
from app.agents.analyst import analyst_graph
from app.agents.canvas_architect import canvas_architect_graph
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


class GapAnalysisRequest(BaseModel):
    page_id: Optional[str] = None


class ReadingPathRequest(BaseModel):
    topic: Optional[str] = None
    page_id: Optional[str] = None


class AIPositionRequest(BaseModel):
    note_id: str


# ── AI Layout ─────────────────────────────────────────

@router.post("/pages/{page_id}/ai-layout")
async def ai_layout(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id)
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

    # Build edges list from DB
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


# ── AI Position ───────────────────────────────────────

@router.post("/pages/{page_id}/ai-position")
async def ai_position(page_id: str, payload: AIPositionRequest, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    note = await db.get_note(payload.note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    from app.services.cartographer import cartographer
    placement = await cartographer.place_single_note(payload.note_id, page_id)

    if not placement:
        return {"x": 100, "y": 100, "cluster": None}

    return {
        "x": placement["x"],
        "y": placement["y"],
        "cluster": placement.get("cluster_id"),
    }


# ── Page Summary ──────────────────────────────────────

@router.post("/pages/{page_id}/summary")
async def page_summary(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    result = await analyst_graph.ainvoke({
        "task": "page_summary",
        "page_id": page_id,
        "topic": None,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })

    return result.get("result", {"summary": "", "key_topics": [], "connections": []})


# ── Gap Analysis ──────────────────────────────────────

@router.post("/ai/gap-analysis")
async def gap_analysis(payload: GapAnalysisRequest, user_id: str = Depends(get_optional_user_id)):
    result = await analyst_graph.ainvoke({
        "task": "gap_analysis",
        "page_id": payload.page_id,
        "topic": None,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })

    return result.get("result", {"covered": [], "missing": [], "suggestions": []})


# ── Reading Path ──────────────────────────────────────

@router.post("/ai/reading-path")
async def reading_path(payload: ReadingPathRequest, user_id: str = Depends(get_optional_user_id)):
    result = await analyst_graph.ainvoke({
        "task": "reading_path",
        "page_id": payload.page_id,
        "topic": payload.topic,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })

    return result.get("result", {"steps": []})