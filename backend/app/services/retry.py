import asyncio
import random
from functools import wraps

def with_retry(max_retries: int = 3, base_delay: float = 1.0, max_delay: float = 30.0):
    """Decorator for async functions with exponential backoff + jitter."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt == max_retries:
                        break
                    # Exponential backoff with jitter
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.5)
                    wait_time = delay + jitter
                    print(
                        f"Retry {attempt + 1}/{max_retries} for {func.__name__} "
                        f"after {wait_time:.1f}s — {e}"
                    )
                    await asyncio.sleep(wait_time)
            raise last_exception
        return wrapper
    return decorator
