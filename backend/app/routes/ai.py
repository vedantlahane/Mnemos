# === FILE: backend/app/routes/ai.py ===
"""AI-specific routes — analysis, curator, diagram generation."""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from app.db.supabase import db
from app.services.curator import curator
from app.models.schemas import CuratorAction
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.ai")
router = APIRouter()


@router.post("/ai/curator/scan")
async def curator_scan(user_id: str = Depends(get_optional_user_id)):
    result = await curator.full_scan(user_id=user_id)
    return result


@router.post("/ai/curator/apply")
async def curator_apply(payload: CuratorAction, user_id: str = Depends(get_optional_user_id)):
    result = await curator.apply_action(payload.action_type, payload.params, user_id=user_id)
    return result


@router.post("/ai/analyze/page/{page_id}")
async def analyze_page(page_id: str, user_id: str = Depends(get_optional_user_id)):
    """Full AI analysis of a page — visual context + content analysis."""
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    from app.services.scene_manager import scene_manager
    from app.services.visual_analyzer import visual_analyzer

    scene = await scene_manager.get_scene(page_id)
    visual_ctx = await visual_analyzer.analyze_and_persist(page_id, scene)
    await visual_analyzer.sync_element_registry(page_id, scene)

    notes = await db.get_notes_for_page(page_id, user_id=user_id)
    edges = await db.get_edges_for_page(page_id)
    regions = await db.list_regions(page_id)

    return {
        "visual_context": visual_ctx.model_dump(),
        "note_count": len(notes),
        "edge_count": len(edges),
        "region_count": len(regions),
        "analysis": {
            "layout_pattern": visual_ctx.layout_pattern.value,
            "density": visual_ctx.density.value,
            "reading_direction": visual_ctx.reading_direction.value,
            "theme": visual_ctx.theme,
            "colors": visual_ctx.dominant_colors,
        },
    }


@router.post("/ai/retry-stuck")
async def retry_stuck_notes(background_tasks: BackgroundTasks):
    stuck = await db.get_stuck_notes()
    for note in stuck[:10]:
        from app.services.processor import processor
        background_tasks.add_task(processor.process_note, note_id=note["id"], raw_text=note["raw_text"])
    return {"retrying": len(stuck[:10])}