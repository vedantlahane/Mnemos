"""
Redis-based caching layer for Mnemos.

Wraps frequently-accessed DB queries (canvas data, pages, notes) with
a Redis TTL cache to reduce Supabase round-trips.

If Redis is unavailable, all methods fall back gracefully to direct DB access.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

logger = logging.getLogger("mnemos.cache")

# Will be set at startup
_redis = None


async def init_redis(redis_url: str) -> bool:
    """Initialize the Redis connection pool. Returns True if successful."""
    global _redis
    if not redis_url:
        logger.info("No REDIS_URL configured — caching disabled")
        return False
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=2,
        )
        await _redis.ping()
        logger.info(f"Redis connected: {redis_url.split('@')[-1] if '@' in redis_url else redis_url}")
        return True
    except Exception as e:
        logger.warning(f"Redis unavailable ({e}) — caching disabled")
        _redis = None
        return False


async def close_redis():
    """Close the Redis connection pool on shutdown."""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


def _key(namespace: str, *parts: str) -> str:
    """Build a cache key like 'mnemos:canvas:page_id'"""
    return f"mnemos:{namespace}:{':'.join(parts)}"


# ── Core get/set/delete ──────────────────────────────

async def get(namespace: str, *parts: str) -> Optional[Any]:
    """Get a cached value. Returns None on miss or if Redis is down."""
    if not _redis:
        return None
    try:
        raw = await _redis.get(_key(namespace, *parts))
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug(f"Cache get error: {e}")
        return None


async def set(namespace: str, *parts: str, value: Any, ttl: int = 300) -> bool:
    """Set a cached value with TTL (seconds). Returns True if successful."""
    if not _redis:
        return False
    try:
        await _redis.set(
            _key(namespace, *parts),
            json.dumps(value, default=str),
            ex=ttl,
        )
        return True
    except Exception as e:
        logger.debug(f"Cache set error: {e}")
        return False


async def delete(namespace: str, *parts: str) -> bool:
    """Delete a cached key. Returns True if successful."""
    if not _redis:
        return False
    try:
        await _redis.delete(_key(namespace, *parts))
        return True
    except Exception as e:
        logger.debug(f"Cache delete error: {e}")
        return False


async def invalidate_pattern(namespace: str, pattern: str = "*") -> int:
    """Invalidate all keys matching a pattern within a namespace."""
    if not _redis:
        return 0
    try:
        full_pattern = f"mnemos:{namespace}:{pattern}"
        keys = []
        async for key in _redis.scan_iter(match=full_pattern, count=100):
            keys.append(key)
        if keys:
            await _redis.delete(*keys)
        return len(keys)
    except Exception as e:
        logger.debug(f"Cache invalidate error: {e}")
        return 0


# ── High-level cache-through helpers ──────────────────

async def get_or_fetch(
    namespace: str,
    *parts: str,
    fetcher,
    ttl: int = 300,
) -> Any:
    """
    Try to get from cache. On miss, call fetcher(), cache and return the result.
    fetcher must be an async callable returning JSON-serializable data.
    """
    cached = await get(namespace, *parts)
    if cached is not None:
        return cached

    result = await fetcher()
    if result is not None:
        await set(namespace, *parts, value=result, ttl=ttl)
    return result


# ── Convenience: page-specific cache ──────────────────

TTL_PAGE = 600       # 10 min — pages change rarely
TTL_CANVAS = 120     # 2 min — canvas data changes on every edit
TTL_NOTES = 180      # 3 min — note list
TTL_OVERVIEW = 300   # 5 min — workspace overview


async def get_page_cached(page_id: str, fetcher) -> Optional[dict]:
    return await get_or_fetch("page", page_id, fetcher=fetcher, ttl=TTL_PAGE)


async def invalidate_page(page_id: str):
    await delete("page", page_id)
    await delete("canvas", page_id)


async def get_canvas_cached(page_id: str, fetcher) -> Optional[dict]:
    return await get_or_fetch("canvas", page_id, fetcher=fetcher, ttl=TTL_CANVAS)


async def invalidate_canvas(page_id: str):
    await delete("canvas", page_id)


async def get_overview_cached(fetcher) -> Optional[dict]:
    return await get_or_fetch("overview", "global", fetcher=fetcher, ttl=TTL_OVERVIEW)


async def invalidate_overview():
    await delete("overview", "global")


# ── Stats ──────────────────────────────────────────────

async def cache_stats() -> dict:
    """Return basic cache stats for monitoring."""
    if not _redis:
        return {"enabled": False}
    try:
        info = await _redis.info("stats")
        return {
            "enabled": True,
            "hits": info.get("keyspace_hits", 0),
            "misses": info.get("keyspace_misses", 0),
            "connected_clients": info.get("connected_clients", 0),
        }
    except Exception:
        return {"enabled": True, "error": "stats unavailable"}
