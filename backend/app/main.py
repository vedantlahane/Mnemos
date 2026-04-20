# === FILE: backend/app/main.py ===

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


# ── Helper to inject CORS headers into responses ──
def get_cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin")
    headers = {}
    if origin and (origin in settings.cors_origins or "*" in settings.cors_origins):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return headers


# ── Global exception handler — ensures CORS headers on ALL error responses ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}"},
        headers=get_cors_headers(request),
    )


# ── Catch OSError (WinError 10035 etc.) specifically ──
@app.exception_handler(OSError)
async def os_error_handler(request: Request, exc: OSError):
    logger.warning(f"OS error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=503,
        content={"detail": "Temporary connection issue, please retry"},
        headers=get_cors_headers(request),
    )

from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=get_cors_headers(request),
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers=get_cors_headers(request),
    )


# -- Routes --
from app.routes import auth, chat, health
from app.routes import extension as ext

app.include_router(health.router)
app.include_router(auth.router, prefix="/api", tags=["Auth"])
app.include_router(chat.router, prefix="/api", tags=["Chat & Commands"])
app.include_router(ext.router, prefix="/api", tags=["Extension"])