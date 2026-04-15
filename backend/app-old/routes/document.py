from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_optional_user_id
from app.db.supabase import db
from app.models.schemas import (
    BlockReferenceCreate,
    CanvasBindingCreate,
    CanvasBindingUpdate,
    InlineEmbedCreate,
    PageBlockMove,
    PageBlockCreate,
    PageBlockUpdate,
    PageDocumentUpdate,
    PageRevisionCreate,
)

logger = logging.getLogger("mnemos.routes.document")

router = APIRouter()


def _raise_schema_unavailable(exc: Exception):
    logger.error("Document flow schema unavailable", exc_info=True)
    raise HTTPException(
        status_code=503,
        detail="Document flow schema is not initialized. Apply backend/migrations.sql and restart backend.",
    ) from exc


async def _require_page(page_id: str, user_id: str | None):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


async def _require_block(block_id: str, user_id: str | None):
    block = await db.get_page_block(block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    page_id = str(block.get("page_id") or "")
    if not page_id:
        raise HTTPException(status_code=404, detail="Block not found")

    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Block not found")

    return block, page


@router.get("/pages/{page_id}/document")
async def get_page_document(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await _require_page(page_id, user_id)
    try:
        document = await db.ensure_page_document(page_id, user_id=user_id)
        blocks = await db.list_page_blocks(page_id)
        references = await db.list_block_references(page_id)
        embeds = await db.list_inline_embeds(page_id)
    except Exception as e:
        _raise_schema_unavailable(e)

    return {
        "page": page,
        "document": document,
        "blocks": blocks,
        "references": references,
        "embeds": embeds,
    }


@router.patch("/pages/{page_id}/document")
async def update_page_document(
    page_id: str,
    payload: PageDocumentUpdate,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        updated = await db.update_page_document(page_id, user_id=user_id, **data)
    except Exception as e:
        _raise_schema_unavailable(e)
    if not updated:
        raise HTTPException(status_code=404, detail="Document not found")
    return updated


@router.get("/pages/{page_id}/blocks")
async def list_page_blocks(
    page_id: str,
    include_deleted: bool = False,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)
    try:
        blocks = await db.list_page_blocks(page_id, include_deleted=include_deleted)
    except Exception as e:
        _raise_schema_unavailable(e)
    return {"blocks": blocks}


@router.post("/pages/{page_id}/blocks")
async def create_page_block(
    page_id: str,
    payload: PageBlockCreate,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)

    if payload.prev_block_id:
        prev_block, _ = await _require_block(payload.prev_block_id, user_id)
        if str(prev_block.get("page_id")) != page_id:
            raise HTTPException(status_code=400, detail="prev_block_id does not belong to page_id")
    if payload.next_block_id:
        next_block, _ = await _require_block(payload.next_block_id, user_id)
        if str(next_block.get("page_id")) != page_id:
            raise HTTPException(status_code=400, detail="next_block_id does not belong to page_id")

    data = payload.model_dump(exclude_none=True)
    data["page_id"] = page_id
    data["created_by"] = user_id or data.get("created_by") or "user"

    try:
        block = await db.insert_page_block(**data)
    except Exception as e:
        _raise_schema_unavailable(e)

    try:
        await db.insert_page_operation_log(
            page_id=page_id,
            op_type="block_create",
            target_type="page_block",
            target_id=block.get("id"),
            payload={"block_type": block.get("block_type")},
            actor=user_id or "user",
        )
    except Exception:
        logger.debug("Failed to write block_create operation log", exc_info=True)

    return block


@router.patch("/blocks/{block_id}")
async def update_page_block(
    block_id: str,
    payload: PageBlockUpdate,
    user_id: str = Depends(get_optional_user_id),
):
    block, _ = await _require_block(block_id, user_id)

    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        updated = await db.update_page_block(block_id, **data)
    except Exception as e:
        _raise_schema_unavailable(e)
    if not updated:
        raise HTTPException(status_code=404, detail="Block not found")

    try:
        await db.insert_page_operation_log(
            page_id=block.get("page_id"),
            op_type="block_update",
            target_type="page_block",
            target_id=block_id,
            payload={"fields": list(data.keys())},
            actor=user_id or "user",
        )
    except Exception:
        logger.debug("Failed to write block_update operation log", exc_info=True)

    return updated


@router.post("/blocks/{block_id}/move")
async def move_page_block(
    block_id: str,
    payload: PageBlockMove,
    user_id: str = Depends(get_optional_user_id),
):
    block, _ = await _require_block(block_id, user_id)

    page_id = str(block.get("page_id") or "")
    if payload.prev_block_id:
        prev_block, _ = await _require_block(payload.prev_block_id, user_id)
        if str(prev_block.get("page_id")) != page_id:
            raise HTTPException(status_code=400, detail="prev_block_id must belong to the same page")
    if payload.next_block_id:
        next_block, _ = await _require_block(payload.next_block_id, user_id)
        if str(next_block.get("page_id")) != page_id:
            raise HTTPException(status_code=400, detail="next_block_id must belong to the same page")

    try:
        moved = await db.move_page_block(
            block_id,
            prev_block_id=payload.prev_block_id,
            next_block_id=payload.next_block_id,
            order_key=payload.order_key,
        )
    except Exception as e:
        _raise_schema_unavailable(e)
    if not moved:
        raise HTTPException(status_code=404, detail="Block not found")

    try:
        await db.insert_page_operation_log(
            page_id=block.get("page_id"),
            op_type="block_move",
            target_type="page_block",
            target_id=block_id,
            payload=payload.model_dump(exclude_none=True),
            actor=user_id or "user",
        )
    except Exception:
        logger.debug("Failed to write block_move operation log", exc_info=True)

    return moved


@router.delete("/blocks/{block_id}")
async def delete_page_block(
    block_id: str,
    hard_delete: bool = False,
    user_id: str = Depends(get_optional_user_id),
):
    block, _ = await _require_block(block_id, user_id)
    try:
        await db.delete_page_block(block_id, hard_delete=hard_delete)
    except Exception as e:
        _raise_schema_unavailable(e)

    try:
        await db.insert_page_operation_log(
            page_id=block.get("page_id"),
            op_type="block_delete" if hard_delete else "block_soft_delete",
            target_type="page_block",
            target_id=block_id,
            payload={"hard_delete": hard_delete},
            actor=user_id or "user",
        )
    except Exception:
        logger.debug("Failed to write block_delete operation log", exc_info=True)

    return {"status": "deleted" if hard_delete else "soft_deleted"}


@router.get("/pages/{page_id}/references")
async def list_page_references(
    page_id: str,
    block_id: str | None = None,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)

    if block_id:
        block, _ = await _require_block(block_id, user_id)
        if str(block.get("page_id")) != page_id:
            raise HTTPException(status_code=400, detail="block_id does not belong to page_id")

    try:
        references = await db.list_block_references(page_id, block_id=block_id)
    except Exception as e:
        _raise_schema_unavailable(e)
    return {"references": references}


@router.post("/blocks/{block_id}/references")
async def create_block_reference(
    block_id: str,
    payload: BlockReferenceCreate,
    user_id: str = Depends(get_optional_user_id),
):
    block, _ = await _require_block(block_id, user_id)

    try:
        reference = await db.insert_block_reference(
            page_id=block.get("page_id"),
            block_id=block_id,
            **payload.model_dump(exclude_none=True),
        )
    except Exception as e:
        _raise_schema_unavailable(e)

    return reference


@router.get("/pages/{page_id}/embeds")
async def list_page_embeds(
    page_id: str,
    block_id: str | None = None,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)

    if block_id:
        block, _ = await _require_block(block_id, user_id)
        if str(block.get("page_id")) != page_id:
            raise HTTPException(status_code=400, detail="block_id does not belong to page_id")

    try:
        embeds = await db.list_inline_embeds(page_id, block_id=block_id)
    except Exception as e:
        _raise_schema_unavailable(e)
    return {"embeds": embeds}


@router.post("/blocks/{block_id}/embeds")
async def create_inline_embed(
    block_id: str,
    payload: InlineEmbedCreate,
    user_id: str = Depends(get_optional_user_id),
):
    block, _ = await _require_block(block_id, user_id)

    try:
        embed = await db.insert_inline_embed(
            page_id=block.get("page_id"),
            block_id=block_id,
            **payload.model_dump(exclude_none=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_schema_unavailable(e)

    return embed


@router.get("/pages/{page_id}/bindings")
async def list_page_bindings(
    page_id: str,
    block_id: str | None = None,
    element_id: str | None = None,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)
    try:
        bindings = await db.list_canvas_bindings(page_id, block_id=block_id, element_id=element_id)
    except Exception as e:
        _raise_schema_unavailable(e)
    return {"bindings": bindings}


@router.post("/blocks/{block_id}/bindings")
async def create_canvas_binding(
    block_id: str,
    payload: CanvasBindingCreate,
    user_id: str = Depends(get_optional_user_id),
):
    block, _ = await _require_block(block_id, user_id)

    try:
        binding = await db.insert_canvas_binding(
            page_id=block.get("page_id"),
            block_id=block_id,
            **payload.model_dump(exclude_none=True),
        )
    except Exception as e:
        _raise_schema_unavailable(e)
    return binding


@router.patch("/bindings/{binding_id}")
async def update_canvas_binding(
    binding_id: str,
    payload: CanvasBindingUpdate,
    user_id: str = Depends(get_optional_user_id),
):
    binding = await db.get_canvas_binding(binding_id)
    if not binding:
        raise HTTPException(status_code=404, detail="Binding not found")

    page = await db.get_page(str(binding.get("page_id") or ""), user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Binding not found")

    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        updated = await db.update_canvas_binding(binding_id, **data)
    except Exception as e:
        _raise_schema_unavailable(e)
    return updated


@router.delete("/bindings/{binding_id}")
async def delete_canvas_binding(
    binding_id: str,
    user_id: str = Depends(get_optional_user_id),
):
    binding = await db.get_canvas_binding(binding_id)
    if not binding:
        raise HTTPException(status_code=404, detail="Binding not found")

    page = await db.get_page(str(binding.get("page_id") or ""), user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Binding not found")

    try:
        await db.delete_canvas_binding(binding_id)
    except Exception as e:
        _raise_schema_unavailable(e)
    return {"status": "deleted"}


@router.post("/pages/{page_id}/revisions")
async def create_page_revision(
    page_id: str,
    payload: PageRevisionCreate,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)

    try:
        revision = await db.insert_page_revision(
            page_id=page_id,
            scene_data=payload.scene_data,
            viewport=payload.viewport,
            ops=payload.ops,
            source=payload.source,
            changed_by=(user_id or payload.changed_by),
            message=payload.message,
        )
    except Exception as e:
        _raise_schema_unavailable(e)
    return revision


@router.get("/pages/{page_id}/revisions")
async def list_page_revisions(
    page_id: str,
    limit: int = 20,
    user_id: str = Depends(get_optional_user_id),
):
    await _require_page(page_id, user_id)
    try:
        revisions = await db.list_page_revisions(page_id, limit=max(1, min(limit, 200)))
    except Exception as e:
        _raise_schema_unavailable(e)
    return {"revisions": revisions}
