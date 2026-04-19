# === FILE: backend/app/routes/health.py ===

from fastapi import APIRouter
from app.services import cache

router = APIRouter()


@router.get("/health")
async def health():
    cache_info = await cache.stats()
    return {"status": "healthy", "version": "4.0.0", "cache": cache_info}