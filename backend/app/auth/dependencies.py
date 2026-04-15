# === FILE: backend/app/auth/dependencies.py ===

from fastapi import Request, Depends
from app.config import settings


async def get_optional_user_id(request: Request) -> str | None:
    """
    Extract user_id from auth header if auth is enabled.
    Returns None if auth is disabled or no valid token.
    """
    if not settings.auth_enabled:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]
    try:
        import jwt
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return payload.get("user_id")
    except Exception:
        return None