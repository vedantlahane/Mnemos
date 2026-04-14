from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.config import settings
from app.auth.google_oauth import verify_google_token
from app.auth.jwt_handler import create_access_token, create_refresh_token, verify_token
from app.db.supabase import db

router = APIRouter()


class GoogleAuthRequest(BaseModel):
    token: str  # Google OAuth access_token or id_token


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
        raise HTTPException(status_code=401, detail="Invalid Google token")

    # Upsert user in DB
    user = await db.upsert_user(
        google_id=user_info["google_id"],
        email=user_info["email"],
        name=user_info.get("name"),
        avatar_url=user_info.get("avatar_url"),
    )

    access_token = create_access_token(user["id"], user["email"])
    refresh_token = create_refresh_token(user["id"])

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name"),
            "avatar_url": user.get("avatar_url"),
        },
    }


@router.post("/auth/refresh")
async def refresh_token(payload: RefreshRequest):
    claims = verify_token(payload.refresh_token)
    if not claims or claims.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = claims["sub"]
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token(user["id"], user["email"])
    return {"access_token": access_token}


@router.get("/auth/me")
async def get_current_user_info(request: Request):
    """Public endpoint — frontend calls this to check auth status."""
    if not settings.auth_enabled:
        return {
            "auth_enabled": False,
            "user": {"id": "anonymous", "email": "anonymous@local", "name": "Anonymous"},
            "google_client_id": "",
        }

    user = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        claims = verify_token(token)
        if claims and claims.get("sub"):
            db_user = await db.get_user(claims["sub"])
            if db_user:
                user = {
                    "id": db_user["id"],
                    "email": db_user["email"],
                    "name": db_user.get("name"),
                    "avatar_url": db_user.get("avatar_url"),
                }

    return {
        "auth_enabled": True,
        "user": user,
        "google_client_id": settings.google_client_id,
    }