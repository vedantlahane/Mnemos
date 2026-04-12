import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.supabase import db
from app.services.processor import processor
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
            icon="📋",
            color="#64748b",
        )
        print("Created Uncategorized page")

    yield


app = FastAPI(title="Mnemos", version="2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing routers
app.include_router(capture.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(context.router, prefix="/api")

# New routers
app.include_router(pages.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(clusters.router, prefix="/api")
app.include_router(canvas.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(curator.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0"}