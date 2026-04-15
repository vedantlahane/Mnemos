# === FILE: backend/app/main.py ===

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.services import cache as cache_svc
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("mnemos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Mnemos starting up...")
    if settings.redis_url:
        ok = await cache_svc.init_redis(settings.redis_url)
        logger.info(f"Redis: {'connected' if ok else 'unavailable'}")
    yield
    await cache_svc.close_redis()
    logger.info("Mnemos shutdown complete")


app = FastAPI(
    title="Mnemos",
    description="Visual knowledge workspace API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Register routes ──

from app.routes import (
    pages, pages_scene, pages_canvas, pages_document,
    notes, capture, chat, canvas_chat,
    graph, search, workspace, ai, settings as settings_routes,
)

app.include_router(pages.router, tags=["Pages"])
app.include_router(pages_scene.router, tags=["Scene"])
app.include_router(pages_canvas.router, tags=["Canvas"])
app.include_router(pages_document.router, tags=["Document"])
app.include_router(notes.router, tags=["Notes"])
app.include_router(capture.router, tags=["Capture"])
app.include_router(chat.router, tags=["Chat"])
app.include_router(canvas_chat.router, tags=["Canvas Chat"])
app.include_router(graph.router, tags=["Graph"])
app.include_router(search.router, tags=["Search"])
app.include_router(workspace.router, tags=["Workspace"])
app.include_router(ai.router, tags=["AI"])
app.include_router(settings_routes.router, tags=["Settings"])


@app.get("/health")
async def health():
    cache_info = await cache_svc.cache_stats()
    return {"status": "healthy", "version": "2.0.0", "cache": cache_info}