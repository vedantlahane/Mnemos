import asyncio
import random
import functools


def _is_non_retryable(error: Exception) -> bool:
    msg = str(error)
    hard_signals = [
        "RESOURCE_EXHAUSTED",
        "quota exceeded",
        "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
        "insufficient_quota",
    ]
    m = msg.lower()
    return any(s.lower() in m for s in hard_signals)


def with_retry(max_retries=3, base_delay=1.0, max_delay=30.0):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    if _is_non_retryable(e):
                        raise
                    if attempt == max_retries:
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.5)
                    wait = delay + jitter
                    print(f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {e} (waiting {wait:.1f}s)")
                    await asyncio.sleep(wait)
        return wrapper
    return decorator