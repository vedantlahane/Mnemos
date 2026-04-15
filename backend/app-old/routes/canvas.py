# === FILE: backend/app/routes/canvas.py ===

from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import ElementCreate, ElementUpdate
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.canvas")

router = APIRouter()


@router.get("/pages/{page_id}/elements")
async def list_elements(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    elements = await db.list_elements(page_id)
    return {"elements": elements}


@router.post("/pages/{page_id}/elements")
async def create_element(page_id: str, payload: ElementCreate, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    valid_types = ["sticky", "drawing", "annotation", "image"]
    if payload.element_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid element_type. Must be one of: {', '.join(valid_types)}",
        )

    element = await db.insert_element(
        page_id=page_id,
        element_type=payload.element_type,
        content=payload.content,
        canvas_data=payload.canvas_data,
        position_x=payload.position_x,
        position_y=payload.position_y,
        width=payload.width,
        height=payload.height,
        style=payload.style,
        created_by=(user_id or payload.created_by),
    )

    if payload.element_type == "sticky" and payload.content:
        try:
            from app.services.excalidraw_scene import add_sticky_to_canvas
            await add_sticky_to_canvas(
                page_id, payload.content,
                x=payload.position_x, y=payload.position_y,
                legacy_element_id=element["id"],
            )
        except Exception as e:
            logger.warning(f"Sticky sync failed: {e}")

    return element


@router.put("/elements/{element_id}")
async def update_element(element_id: str, payload: ElementUpdate, user_id: str = Depends(get_optional_user_id)):
    element = await db.get_element(element_id)
    if not element:
        raise HTTPException(status_code=404, detail="Element not found")
    page = await db.get_page(element["page_id"], user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Element not found")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    return await db.update_element(element_id, **updates)


@router.delete("/elements/{element_id}")
async def delete_element(element_id: str, user_id: str = Depends(get_optional_user_id)):
    element = await db.get_element(element_id)
    if not element:
        raise HTTPException(status_code=404, detail="Element not found")
    page = await db.get_page(element["page_id"], user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Element not found")
    await db.delete_element(element_id)
    return {"status": "deleted"}