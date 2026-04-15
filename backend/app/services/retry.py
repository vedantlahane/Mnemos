# === FILE: backend/app/services/retry.py ===

import asyncio
import random
import functools
import logging

logger = logging.getLogger("mnemos.retry")

_NON_RETRYABLE = [
    "resource_exhausted", "quota exceeded", "generaterequestsperday",
    "insufficient_quota", "invalid_api_key", "permission_denied", "not_found",
]


def _is_non_retryable(error: Exception) -> bool:
    msg = str(error).lower()
    return any(s in msg for s in _NON_RETRYABLE)


def with_retry(max_retries=3, base_delay=1.0, max_delay=30.0):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if _is_non_retryable(e):
                        raise
                    if attempt == max_retries:
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.5)
                    logger.warning(f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {e} (wait {delay + jitter:.1f}s)")
                    await asyncio.sleep(delay + jitter)
            raise last_error
        return wrapper
    return decorator