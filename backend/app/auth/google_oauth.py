# === FILE: backend/app/auth/google_oauth.py ===

import httpx

GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"


async def verify_google_token(token: str) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "google_id": data.get("sub"),
                "email": data.get("email"),
                "name": data.get("name"),
                "avatar_url": data.get("picture"),
            }

        resp = await client.get(
            GOOGLE_TOKEN_INFO_URL,
            params={"id_token": token},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "google_id": data.get("sub"),
                "email": data.get("email"),
                "name": data.get("name", data.get("email", "").split("@")[0]),
                "avatar_url": data.get("picture"),
            }

    return None