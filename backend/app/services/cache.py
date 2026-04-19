# === FILE: backend/app/services/cache.py ===

"""Redis cache — optional, simplified."""

from __future__ import annotations
import json
import logging
from typing import Any, Optional

logger = logging.getLogger("mnemos.cache")
_redis = None


async def init_redis(url: str) -> bool:
    global _redis
    if not url:
        return False
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(url, decode_responses=True,
                                   socket_connect_timeout=3, socket_timeout=2)
        await _redis.ping()
        return True
    except Exception as e:
        logger.warning(f"Redis unavailable: {e}")
        _redis = None
        return False


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


async def get(key: str) -> Optional[Any]:
    if not _redis: return None
    try:
        raw = await _redis.get(f"mnemos:{key}")
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def set(key: str, value: Any, ttl: int = 300) -> bool:
    if not _redis: return False
    try:
        await _redis.set(f"mnemos:{key}", json.dumps(value, default=str), ex=ttl)
        return True
    except Exception:
        return False


async def delete(key: str) -> bool:
    if not _redis: return False
    try:
        await _redis.delete(f"mnemos:{key}")
        return True
    except Exception:
        return False


async def stats() -> dict:
    if not _redis: return {"enabled": False}
    try:
        info = await _redis.info("stats")
        return {"enabled": True, "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0)}
    except Exception:
        return {"enabled": True, "error": "unavailable"}