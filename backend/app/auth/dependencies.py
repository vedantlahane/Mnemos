# === FILE: backend/app/auth/dependencies.py ===

from fastapi import Request
from app.core.config import settings


async def get_optional_user_id(request: Request) -> str | None:
    if not settings.auth_enabled:
        return None
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        from app.auth.jwt_handler import verify_token
        payload = verify_token(token)
        return payload.get("sub") if payload else None
    except Exception:
        return None