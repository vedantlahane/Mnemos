# === FILE: backend/app/main.py ===

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.services import cache
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("mnemos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Mnemos v4 starting...")

    # Wire event handlers
    from app.services.capture import register_handlers
    register_handlers()
    logger.info("Event handlers registered")

    if settings.redis_url:
        ok = await cache.init_redis(settings.redis_url)
        logger.info(f"Redis: {'connected' if ok else 'unavailable'}")

    yield

    await cache.close_redis()
    logger.info("Mnemos shutdown complete")


app = FastAPI(
    title="Mnemos",
    description="Visual knowledge workspace — v4",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ──
# Minimal: auth, one chat endpoint, canvas sync, health
from app.routes import auth, chat, health

app.include_router(health.router)
app.include_router(auth.router, prefix="/api", tags=["Auth"])
app.include_router(chat.router, prefix="/api", tags=["Chat & Commands"])