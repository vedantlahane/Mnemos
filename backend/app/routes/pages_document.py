# === FILE: backend/app/routes/pages_document.py ===
"""Document/notebook mode routes — blocks, references, embeds."""

from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import (
    PageBlockCreate, PageBlockUpdate, PageBlockMove,
    BlockReferenceCreate, InlineEmbedCreate, PageDocumentUpdate,
)
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id
import logging

logger = logging.getLogger("mnemos.routes.document")
router = APIRouter()


# ── Document settings ──

@router.get("/pages/{page_id}/document")
async def get_document(page_id: str, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    doc = await db.get_document(page_id)
    blocks = await db.get_blocks(page_id)
    return {"document": doc, "blocks": blocks, "page": page}


@router.put("/pages/{page_id}/document")
async def update_document_settings(page_id: str, payload: PageDocumentUpdate,
                                   user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields")
    result = await db.upsert_document(page_id, user_id=user_id, **updates)
    return result


# ── Blocks ──

@router.get("/pages/{page_id}/blocks")
async def list_blocks(page_id: str, user_id: str = Depends(get_optional_user_id)):
    blocks = await db.get_blocks(page_id)
    return {"blocks": blocks}


@router.post("/pages/{page_id}/blocks")
async def create_block(page_id: str, payload: PageBlockCreate,
                       user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    order_key = payload.order_key
    if order_key is None:
        try:
            result = await db.rpc_next_order_key(page_id, payload.prev_block_id, payload.next_block_id)
            order_key = result
        except Exception:
            order_key = 1000.0

    block = await db.insert_block(
        page_id=page_id, block_type=payload.block_type,
        text_content=payload.text_content,
        parent_block_id=payload.parent_block_id,
        order_key=order_key, depth=payload.depth,
        attrs=payload.attrs, note_id=payload.note_id,
        provenance=payload.provenance,
        created_by=payload.created_by,
    )
    return block


@router.put("/pages/{page_id}/blocks/{block_id}")
async def update_block(page_id: str, block_id: str, payload: PageBlockUpdate,
                       user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields")
    block = await db.update_block(block_id, **updates)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


@router.delete("/pages/{page_id}/blocks/{block_id}")
async def delete_block(page_id: str, block_id: str, user_id: str = Depends(get_optional_user_id)):
    await db.delete_block(block_id)
    return {"status": "deleted"}


@router.post("/pages/{page_id}/blocks/{block_id}/move")
async def move_block(page_id: str, block_id: str, payload: PageBlockMove,
                     user_id: str = Depends(get_optional_user_id)):
    order_key = payload.order_key
    if order_key is None:
        try:
            order_key = await db.rpc_next_order_key(page_id, payload.prev_block_id, payload.next_block_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Cannot compute order_key")
    updated = await db.update_block(block_id, order_key=order_key)
    return updated


@router.post("/pages/{page_id}/blocks/rebalance")
async def rebalance_blocks(page_id: str, user_id: str = Depends(get_optional_user_id)):
    await db.rpc_rebalance_blocks(page_id)
    return {"status": "rebalanced"}


# ── References ──

@router.get("/pages/{page_id}/blocks/{block_id}/references")
async def list_references(page_id: str, block_id: str):
    refs = await db.get_block_references(page_id, block_id)
    return {"references": refs}


@router.post("/pages/{page_id}/blocks/{block_id}/references")
async def create_reference(page_id: str, block_id: str, payload: BlockReferenceCreate):
    ref = await db.insert_block_reference(
        page_id=page_id, block_id=block_id,
        ref_type=payload.ref_type, ref_id=payload.ref_id,
        start_offset=payload.start_offset, end_offset=payload.end_offset,
        label=payload.label, metadata=payload.metadata,
    )
    return ref


@router.delete("/pages/{page_id}/references/{ref_id}")
async def delete_reference(page_id: str, ref_id: str):
    await db.delete_block_reference(ref_id)
    return {"status": "deleted"}


# ── Inline Embeds ──

@router.get("/pages/{page_id}/blocks/{block_id}/embeds")
async def list_embeds(page_id: str, block_id: str):
    embeds = await db.get_inline_embeds(page_id, block_id)
    return {"embeds": embeds}


@router.post("/pages/{page_id}/blocks/{block_id}/embeds")
async def create_embed(page_id: str, block_id: str, payload: InlineEmbedCreate):
    embed = await db.insert_inline_embed(
        page_id=page_id, block_id=block_id,
        embed_type=payload.embed_type,
        target_page_id=payload.target_page_id,
        target_note_id=payload.target_note_id,
        target_block_id=payload.target_block_id,
        url=payload.url, inline_position=payload.inline_position,
        display_mode=payload.display_mode,
        width=payload.width, height=payload.height,
        attrs=payload.attrs, created_by=payload.created_by,
    )
    return embed


@router.delete("/pages/{page_id}/embeds/{embed_id}")
async def delete_embed(page_id: str, embed_id: str):
    await db.delete_inline_embed(embed_id)
    return {"status": "deleted"}