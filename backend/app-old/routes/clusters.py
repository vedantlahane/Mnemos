# === FILE: backend/app/routes/clusters.py ===

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from app.models.schemas import ClusterCreate, ClusterUpdate
from app.db.supabase import db
from app.auth.dependencies import get_optional_user_id

router = APIRouter()


@router.get("/clusters")
async def list_clusters(page_id: Optional[str] = None, user_id: str = Depends(get_optional_user_id)):
    clusters = await db.list_clusters(page_id=page_id)
    return {"clusters": clusters}


@router.post("/clusters")
async def create_cluster(payload: ClusterCreate, user_id: str = Depends(get_optional_user_id)):
    page = await db.get_page(payload.page_id, user_id=user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    cluster = await db.insert_cluster(
        page_id=payload.page_id, label=payload.label,
        description=payload.description, color=payload.color,
    )
    return cluster


@router.put("/clusters/{cluster_id}")
async def update_cluster(cluster_id: str, payload: ClusterUpdate, user_id: str = Depends(get_optional_user_id)):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    return await db.update_cluster(cluster_id, **updates)


@router.delete("/clusters/{cluster_id}")
async def delete_cluster(cluster_id: str, user_id: str = Depends(get_optional_user_id)):
    await db.delete_cluster(cluster_id)
    return {"status": "dissolved"}