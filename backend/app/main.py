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

from app.routes import (
    auth, pages, pages_scene, pages_canvas, pages_document,
    notes, capture, chat, canvas_chat,
    graph, search, workspace, ai, settings as settings_routes,
)

P = "/api"

app.include_router(auth.router, prefix=P, tags=["Auth"])
app.include_router(pages.router, prefix=P, tags=["Pages"])
app.include_router(pages_scene.router, prefix=P, tags=["Scene"])
app.include_router(pages_canvas.router, prefix=P, tags=["Canvas"])
app.include_router(pages_document.router, prefix=P, tags=["Document"])
app.include_router(notes.router, prefix=P, tags=["Notes"])
app.include_router(capture.router, prefix=P, tags=["Capture"])
app.include_router(chat.router, prefix=P, tags=["Chat"])
app.include_router(canvas_chat.router, prefix=P, tags=["Canvas Chat"])
app.include_router(graph.router, prefix=P, tags=["Graph"])
app.include_router(search.router, prefix=P, tags=["Search"])
app.include_router(workspace.router, prefix=P, tags=["Workspace"])
app.include_router(ai.router, prefix=P, tags=["AI"])
app.include_router(settings_routes.router, prefix=P, tags=["Settings"])

@app.get("/health")
async def health():
    cache_info = await cache_svc.cache_stats()
    return {"status": "healthy", "version": "2.0.0", "cache": cache_info}
