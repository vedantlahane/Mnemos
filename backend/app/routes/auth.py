# === FILE: backend/app/routes/auth.py ===

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.core.config import settings
from app.auth.google_oauth import verify_google_token
from app.auth.jwt_handler import create_access_token, create_refresh_token, verify_token
from app.db.repo import repo

router = APIRouter()


class GoogleAuthRequest(BaseModel):
    token: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/auth/google")
async def google_login(payload: GoogleAuthRequest):
    if not settings.auth_enabled:
        return {
            "access_token": "auth-disabled",
            "refresh_token": "auth-disabled",
            "user": {"id": "anonymous", "email": "anonymous@local", "name": "Anonymous"},
        }
    user_info = await verify_google_token(payload.token)
    if not user_info:
        raise HTTPException(401, "Invalid Google token")
    user = await repo.upsert_user(
        google_id=user_info["google_id"], email=user_info["email"],
        name=user_info.get("name"), avatar_url=user_info.get("avatar_url"),
    )
    return {
        "access_token": create_access_token(user["id"], user["email"]),
        "refresh_token": create_refresh_token(user["id"]),
        "user": user,
    }


@router.post("/auth/refresh")
async def refresh(payload: RefreshRequest):
    if not settings.auth_enabled:
        return {"access_token": "auth-disabled"}
    claims = verify_token(payload.refresh_token)
    if not claims or claims.get("type") != "refresh":
        raise HTTPException(401, "Invalid refresh token")
    user = await repo.get_user(claims["sub"])
    if not user:
        raise HTTPException(401, "User not found")
    return {"access_token": create_access_token(user["id"], user["email"])}


@router.get("/auth/me")
async def me(request: Request):
    if not settings.auth_enabled:
        return {"auth_enabled": False, "user": {"id": "anonymous", "email": "anonymous@local", "name": "Anonymous"}}
    user = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        claims = verify_token(auth[7:])
        if claims and claims.get("sub"):
            user = await repo.get_user(claims["sub"])
    return {"auth_enabled": True, "user": user, "google_client_id": settings.google_client_id}