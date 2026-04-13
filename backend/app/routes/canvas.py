from fastapi import APIRouter, HTTPException
from app.models.schemas import ElementCreate, ElementUpdate
from app.db.supabase import db

router = APIRouter()


@router.get("/pages/{page_id}/elements")
async def list_elements(page_id: str):
    page = await db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    elements = await db.list_elements(page_id)
    return {"elements": elements}


@router.post("/pages/{page_id}/elements")
async def create_element(page_id: str, payload: ElementCreate):
    page = await db.get_page(page_id)
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
        created_by=payload.created_by,
    )

    if payload.element_type == "sticky" and payload.content:
        try:
            from app.services.excalidraw_scene import add_sticky_to_canvas
            await add_sticky_to_canvas(
                page_id,
                payload.content,
                x=payload.position_x,
                y=payload.position_y,
                legacy_element_id=element["id"],
            )
        except Exception as e:
            print(f"Excalidraw sticky sync failed for {element['id']}: {e}")

    return element


@router.put("/elements/{element_id}")
async def update_element(element_id: str, payload: ElementUpdate):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    element = await db.update_element(element_id, **updates)
    return element


@router.delete("/elements/{element_id}")
async def delete_element(element_id: str):
    await db.delete_element(element_id)
    return {"status": "deleted"}
