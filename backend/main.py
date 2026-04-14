import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.supabase import db
from app.services.processor import processor
from app.services import cache as cache_svc
from app.routes import (
    capture,
    notes,
    search,
    chat,
    context,
    pages,
    edges,
    clusters,
    canvas,
    stats,
    history,
    curator,
)
from app.routes.auth import router as auth_router
from app.routes.ai_endpoints import router as ai_router
from app.routes.settings_routes import router as settings_router
from app.routes.workspace import router as workspace_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Recover stuck notes
    stuck = await db.get_stuck_notes(older_than_minutes=5)
    for note in stuck:
        asyncio.create_task(
            processor.process_note(note["id"], note["raw_text"])
        )
    if stuck:
        print(f"Recovered {len(stuck)} stuck notes")

    # Ensure Uncategorized page exists
    uncat = await db.get_page_by_name("Uncategorized")
    if not uncat:
        await db.insert_page(
            name="Uncategorized",
            description="Notes that have not been assigned to a page yet",
            icon="📥",
            color="#64748b",
        )
        print("Created Uncategorized page")

    # Ensure default settings exist
    default_settings = await db.get_settings(user_id=None)
    if not default_settings:
        await db.upsert_settings(
            user_id=None,
            theme="glass",
            model="gemini-2.5-flash",
            groq_model="llama-3.3-70b-versatile",
            similarity_threshold=0.65,
            embedding_dimensions=768,
        )
        print("Created default settings")
    # Initialize Redis cache (optional)
    redis_ok = await cache_svc.init_redis(settings.redis_url)
    if redis_ok:
        print("Redis cache: connected")
    else:
        print("Redis cache: disabled (no REDIS_URL)")

    yield

    # Shutdown: close Redis
    await cache_svc.close_redis()


app = FastAPI(title="Mnemos", version="3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth (no prefix — /api/auth/...)
app.include_router(auth_router, prefix="/api")

# Existing routers
app.include_router(capture.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(context.router, prefix="/api")

# Page/canvas routers
app.include_router(pages.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(clusters.router, prefix="/api")
app.include_router(canvas.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(curator.router, prefix="/api")

# New routers
app.include_router(ai_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(workspace_router, prefix="/api")


@app.get("/health")
async def health():
    has_groq = bool(settings.groq_api_key)
    cache_info = await cache_svc.cache_stats()
    return {
        "status": "ok",
        "version": "3.0",
        "auth_enabled": settings.auth_enabled,
        "cache": cache_info,
        "providers": {
            "google": True,
            "groq": has_groq,
        },
    }