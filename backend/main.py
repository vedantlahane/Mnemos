import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.supabase import db
from app.services.processor import processor
from app.routes import capture, notes, search, chat, context


@asynccontextmanager
async def lifespan(app: FastAPI):
    stuck = await db.get_stuck_notes(older_than_minutes=5)
    for note in stuck:
        asyncio.create_task(
            processor.process_note(note["id"], note["raw_text"])
        )
    if stuck:
        print(f"Recovered {len(stuck)} stuck notes")
    yield


app = FastAPI(title="Mnemos", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(capture.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(context.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}