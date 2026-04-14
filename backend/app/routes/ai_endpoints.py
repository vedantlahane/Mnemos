from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from app.db.supabase import db
from app.agents.analyst import analyst_graph
from app.agents.canvas_architect import canvas_architect_graph
from app.llm import router as llm
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


def _build_canvas_style_context(page: dict | None) -> str:
    if not isinstance(page, dict):
        return ""

    canvas_data = page.get("canvas_data")
    if not isinstance(canvas_data, dict):
        return ""

    app_state = canvas_data.get("appState")
    if not isinstance(app_state, dict):
        return ""

    bg = app_state.get("viewBackgroundColor") or "#0e0e1a"
    theme = app_state.get("theme") or "dark"
    stroke = app_state.get("currentItemStrokeColor") or "default"
    fill = app_state.get("currentItemBackgroundColor") or "transparent"
    stroke_width = app_state.get("currentItemStrokeWidth")
    stroke_style = app_state.get("currentItemStrokeStyle")
    font_family = app_state.get("currentItemFontFamily")
    font_size = app_state.get("currentItemFontSize")

    return (
        "Canvas style context:\n"
        f"- theme: {theme}\n"
        f"- background: {bg}\n"
        f"- default stroke color: {stroke}\n"
        f"- default fill color: {fill}\n"
        f"- stroke width/style: {stroke_width}/{stroke_style}\n"
        f"- default font family/size: {font_family}/{font_size}\n"
        "- keep text contrast high against the current background\n"
        "- for flow diagrams, vary node styles (accent/default/muted) to improve readability"
    )


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
        "user_id": user_id,
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
        "user_id": user_id,
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
        "user_id": user_id,
        "topic": payload.topic,
        "notes": [],
        "result": None,
        "errors": [],
        "status": "loading",
    })

    return result.get("result", {"steps": []})


# ── Diagram Generation ────────────────────────────────

class DiagramRequest(BaseModel):
    request: str
    page_id: Optional[str] = None


@router.post("/ai/generate-diagram")
async def generate_diagram(payload: DiagramRequest, user_id: str = Depends(get_optional_user_id)):
    """Generate a structured diagram topology from a natural language request."""
    from app.services.canvas_gen import generate_diagram as gen_diagram, fallback_diagram

    # Optionally include page notes as context
    context = ""
    if payload.page_id:
        try:
            page = await db.get_page(payload.page_id)
            notes = await db.get_notes_for_page(payload.page_id)
            context_parts = [
                f"Note: {n.get('title', 'Untitled')} — {n.get('summary', '')[:200]}"
                for n in notes[:8]
            ]
            style_context = _build_canvas_style_context(page)
            if style_context:
                context_parts.append(style_context)
            context = "\n".join(context_parts)
        except Exception:
            pass

    selected_model = None
    try:
        user_settings = await db.get_settings(user_id=user_id)
        if isinstance(user_settings, dict):
            maybe_model = user_settings.get("model")
            if isinstance(maybe_model, str) and maybe_model.strip():
                selected_model = maybe_model.strip()
    except Exception:
        selected_model = None

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