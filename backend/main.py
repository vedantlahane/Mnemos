# === FILE: backend/main.py ===

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.services import cache as cache_svc
from app.db.supabase import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("mnemos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    logger.info("Starting Mnemos backend…")

    # Ensure Uncategorized page exists
    try:
        page = await db.get_page_by_name("Uncategorized")
        if not page:
            await db.insert_page(
                name="Uncategorized",
                description="Default page for uncategorized notes",
                icon="📥",
                color="#6b7280",
            )
            logger.info("Created default Uncategorized page")
    except Exception as e:
        logger.error(f"Failed to ensure Uncategorized page: {e}")

    # Init Redis
    if settings.redis_url:
        ok = await cache_svc.init_redis(settings.redis_url)
        if ok:
            logger.info("Redis cache enabled")

    # Retry stuck notes
    try:
        stuck = await db.get_stuck_notes(older_than_minutes=10)
        if stuck:
            from app.services.processor import processor
            for note in stuck[:10]:
                logger.info(f"Retrying stuck note {note['id']}")
                import asyncio
                asyncio.create_task(
                    processor.process_note(note["id"], note["raw_text"])
                )
    except Exception as e:
        logger.warning(f"Stuck-note recovery failed: {e}")

    yield

    # ── Shutdown ──
    await cache_svc.close_redis()
    logger.info("Mnemos backend stopped")


app = FastAPI(title="Mnemos", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount all routers ──
from app.routes import (
    document,
    auth,
    capture,
    chat,
    canvas,
    canvas_stream,
    notes,
    pages,
    edges,
    clusters,
    search,
    context,
    history,
    ai_endpoints,
    curator as curator_routes,
    settings_routes,
    stats,
    workspace,
)

PREFIX = "/api"
app.include_router(auth.router, prefix=PREFIX, tags=["Auth"])
app.include_router(capture.router, prefix=PREFIX, tags=["Capture"])
app.include_router(chat.router, prefix=PREFIX, tags=["Chat"])
app.include_router(canvas_stream.router, prefix=PREFIX, tags=["Canvas Stream"])
app.include_router(canvas.router, prefix=PREFIX, tags=["Canvas Elements"])
app.include_router(document.router, prefix=PREFIX, tags=["Document Flow"])
app.include_router(notes.router, prefix=PREFIX, tags=["Notes"])
app.include_router(pages.router, prefix=PREFIX, tags=["Pages"])
app.include_router(edges.router, prefix=PREFIX, tags=["Edges"])
app.include_router(clusters.router, prefix=PREFIX, tags=["Clusters"])
app.include_router(search.router, prefix=PREFIX, tags=["Search"])
app.include_router(context.router, prefix=PREFIX, tags=["Context"])
app.include_router(history.router, prefix=PREFIX, tags=["History"])
app.include_router(ai_endpoints.router, prefix=PREFIX, tags=["AI"])
app.include_router(curator_routes.router, prefix=PREFIX, tags=["Curator"])
app.include_router(settings_routes.router, prefix=PREFIX, tags=["Settings"])
app.include_router(stats.router, prefix=PREFIX, tags=["Stats"])
app.include_router(workspace.router, prefix=PREFIX, tags=["Workspace"])


@app.get("/api/health")
async def health():
    cache_info = await cache_svc.cache_stats()
    return {"status": "ok", "version": "2.0.0", "cache": cache_info}