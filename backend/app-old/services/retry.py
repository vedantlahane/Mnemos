# === FILE: backend/app/services/retry.py ===

import asyncio
import random
import functools
import logging

logger = logging.getLogger("mnemos.retry")

_NON_RETRYABLE = [
    "resource_exhausted",
    "quota exceeded",
    "generaterequestsperday",
    "insufficient_quota",
    "invalid_api_key",
    "permission_denied",
    "not_found",
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
                        logger.error(f"Non-retryable error in {func.__name__}: {e}")
                        raise
                    if attempt == max_retries:
                        logger.error(f"All {max_retries} retries exhausted for {func.__name__}: {e}")
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.5)
                    wait = delay + jitter
                    logger.warning(f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {e} (waiting {wait:.1f}s)")
                    await asyncio.sleep(wait)
            raise last_error  # should never reach here
        return wrapper
    return decorator