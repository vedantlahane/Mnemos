from fastapi import Request, HTTPException, Depends
from typing import Optional
from app.config import settings
from app.auth.jwt_handler import verify_token


async def get_current_user_id(request: Request) -> Optional[str]:
    """Returns user_id if auth enabled and valid token, None if auth disabled.
    Raises 401 if auth enabled but token is invalid/missing."""
    if not settings.auth_enabled:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]
    payload = verify_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return payload["sub"]


async def get_optional_user_id(request: Request) -> Optional[str]:
    """Like get_current_user_id but never raises — returns None on failure."""
    if not settings.auth_enabled:
        return None
    try:
        return await get_current_user_id(request)
    except HTTPException:
        return None