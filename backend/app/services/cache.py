# === FILE: backend/app/services/cache.py ===
"""Redis caching — updated with scene cache support."""

from __future__ import annotations
import json
import logging
from typing import Any, Optional

logger = logging.getLogger("mnemos.cache")
_redis = None


async def init_redis(redis_url: str) -> bool:
    global _redis
    if not redis_url:
        return False
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(redis_url, decode_responses=True, socket_connect_timeout=3, socket_timeout=2)
        await _redis.ping()
        return True
    except Exception as e:
        logger.warning(f"Redis unavailable ({e})")
        _redis = None
        return False


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


def _key(ns: str, *parts: str) -> str:
    return f"mnemos:{ns}:{':'.join(parts)}"


async def get(ns: str, *parts: str) -> Optional[Any]:
    if not _redis:
        return None
    try:
        raw = await _redis.get(_key(ns, *parts))
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def set(ns: str, *parts: str, value: Any, ttl: int = 300) -> bool:
    if not _redis:
        return False
    try:
        await _redis.set(_key(ns, *parts), json.dumps(value, default=str), ex=ttl)
        return True
    except Exception:
        return False


async def delete(ns: str, *parts: str) -> bool:
    if not _redis:
        return False
    try:
        await _redis.delete(_key(ns, *parts))
        return True
    except Exception:
        return False


async def get_or_fetch(ns: str, *parts: str, fetcher, ttl: int = 300) -> Any:
    cached = await get(ns, *parts)
    if cached is not None:
        return cached
    result = await fetcher()
    if result is not None:
        await set(ns, *parts, value=result, ttl=ttl)
    return result


TTL_PAGE = 600
TTL_SCENE = 120
TTL_OVERVIEW = 300


async def get_page_cached(page_id: str, fetcher) -> Optional[dict]:
    return await get_or_fetch("page", page_id, fetcher=fetcher, ttl=TTL_PAGE)


async def invalidate_page(page_id: str):
    await delete("page", page_id)


async def get_scene_cached(page_id: str, fetcher) -> Optional[dict]:
    return await get_or_fetch("scene", page_id, fetcher=fetcher, ttl=TTL_SCENE)


async def invalidate_scene(page_id: str):
    await delete("scene", page_id)


async def get_overview_cached(fetcher) -> Optional[dict]:
    return await get_or_fetch("overview", "global", fetcher=fetcher, ttl=TTL_OVERVIEW)


async def invalidate_overview():
    await delete("overview", "global")


async def cache_stats() -> dict:
    if not _redis:
        return {"enabled": False}
    try:
        info = await _redis.info("stats")
        return {"enabled": True, "hits": info.get("keyspace_hits", 0), "misses": info.get("keyspace_misses", 0)}
    except Exception:
        return {"enabled": True, "error": "unavailable"}