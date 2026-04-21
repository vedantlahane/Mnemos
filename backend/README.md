text


---

## Backend README

```markdown
# Mnemos Backend

FastAPI server where a single chat endpoint drives all functionality — navigation, capture, search, canvas mutations, settings, and conversation.

## Stack

- Python 3.11+
- FastAPI + Uvicorn
- Google Gemini (primary LLM + embeddings)
- Groq / LangChain (secondary LLM)
- LangGraph (note processing pipeline)
- Supabase (Postgres + pgvector)
- Redis (optional caching)
- python-jose (JWT auth)

## Getting Started

```bash
pip install -r requirements.txt
cp .env.example .env    # fill in your keys
uvicorn main:app --reload --port 8000

Run migrations/001_schema.sql in Supabase SQL Editor before first use.
Project Structure

text

app/
├── main.py                → FastAPI app, CORS, lifespan, error handlers
│
├── core/
│   ├── config.py          → Pydantic settings (env vars)
│   ├── events.py          → In-process event bus (ITEM_CREATED, etc.)
│   └── errors.py          → Custom exception classes
│
├── auth/
│   ├── jwt_handler.py     → Create/verify JWT access + refresh tokens
│   ├── google_oauth.py    → Verify Google ID tokens
│   └── dependencies.py    → FastAPI dependency: get_optional_user_id
│
├── routes/
│   ├── chat.py            → POST /chat, GET/POST /sync, GET /scene, GET /events (SSE)
│   ├── auth.py            → POST /auth/google, POST /auth/refresh, GET /auth/me
│   ├── extension.py       → POST /capture, POST /context, GET /pages, GET /notes
│   └── health.py          → GET /health
│
├── commands/
│   ├── router.py          → Intent classifier (pattern match → LLM fallback)
│   ├── handlers.py        → Command execution (navigate, capture, query, canvas, manage, settings, chat)
│   └── responses.py       → CommandResponse dataclass
│
├── llm/
│   ├── google_provider.py → Gemini chat, streaming, structured output
│   ├── groq_provider.py   → Groq/LangChain chat
│   └── router.py          → Provider selection, fallback, diagram gen, capture processing
│
├── services/
│   ├── capture.py         → Item processing pipeline (extract → embed → route → place)
│   ├── composition.py     → AI text composition with markdown stripping
│   ├── search.py          → Semantic vector search
│   ├── embeddings.py      → Gemini embedding generation
│   ├── workspace_router.py→ LLM-based item → workspace routing
│   ├── placement.py       → Spatial placement engine (gap finding, clustering)
│   ├── sync.py            → Bidirectional canvas sync (positions, deletions, rebuilds)
│   ├── broadcaster.py     → SSE pub/sub per workspace
│   └── cache.py           → Optional Redis cache
│
├── canvas/
│   ├── __init__.py        → Exports canvas_renderer singleton
│   ├── constants.py       → Excalidraw schema, theme colors, defaults
│   ├── factory.py         → Element builder (rectangles, text, arrows, nodes, stickies)
│   ├── renderer.py        → Scene builder (DB → Excalidraw JSON)
│   ├── layout.py          → Diagram layout engine (tree, flow, mindmap, etc.)
│   └── text_measure.py    → Server-side text measurement (approximation)
│
├── db/
│   └── repo.py            → Supabase data access layer (all tables)
│
├── agents/
│   ├── state.py           → LangGraph state schema
│   └── note_processor.py  → LangGraph processing graph
│
└── migrations/
    └── 001_schema.sql     → Full database schema + vector search functions

API Endpoints
Core
Method	Path	Description
POST	/api/chat	Main endpoint — intent classification → command handling
GET	/api/workspaces/{id}/scene	Get full Excalidraw scene (rebuilt from DB)
POST	/api/workspaces/{id}/sync	Bidirectional canvas sync
GET	/api/workspaces/{id}/events	SSE stream (canvas updates, text streaming)
GET	/api/workspaces/{id}/version	Current canvas version number
Auth
Method	Path	Description
POST	/api/auth/google	Google OAuth login
POST	/api/auth/refresh	Refresh access token
GET	/api/auth/me	Current user + auth status
Extension
Method	Path	Description
POST	/api/capture	Capture text from extension
POST	/api/context	Check for related notes on a page
GET	/api/pages	List workspaces for extension UI
GET	/api/notes	List recent items
Health
Method	Path	Description
GET	/health	Health check + cache stats
Key Concepts
Chat Pipeline

text

User message
  → Intent classification (pattern match, then LLM fallback)
  → Command handler (navigate / capture / query / canvas / manage / settings / chat)
  → CommandResponse { text, ui_action, data, canvas_update }

Capture Pipeline

text

POST /capture or POST /chat (capture intent)
  → Event bus: ITEM_CREATED
  → Extract metadata (1 LLM call)
  → Generate embedding (1 API call)
  → Lightweight connections (vector similarity, no LLM)
  → Route to workspace (1 LLM call if needed)
  → Place as text block on canvas
  → Structural rebuild → SSE notify

Canvas Sync

    Position changes → saved to canvas_placements / canvas_objects quietly
    Deletions → detected via isDeleted flag, removed from DB so rebuilds don't resurrect them
    Structural changes → full scene rebuild from DB truth + SSE push
    Version gap → full reload if client is too far behind

Scene Building

text

DB tables (items, placements, canvas_objects)
  → canvas_renderer.build_scene()
  → Excalidraw JSON { elements, appState, files }

User-drawn elements are preserved across rebuilds by filtering against managed element IDs.
Dual LLM

    Primary: Gemini (configurable per user)
    Secondary: Groq/Llama (fallback on primary failure)
    Provider auto-detected from model name

Environment Variables
Variable	Required	Default	Description
SUPABASE_URL	Yes	—	Supabase project URL
SUPABASE_KEY	Yes	—	Supabase anon key
SUPABASE_SERVICE_ROLE_KEY	No	—	Service role key (bypasses RLS)
GEMINI_API_KEY	Yes	—	Google Gemini API key
GROQ_API_KEY	No	—	Groq API key
AUTH_ENABLED	No	false	Enable Google OAuth
GOOGLE_CLIENT_ID	No	—	Google OAuth client ID
JWT_SECRET	No	dev-secret...	JWT signing secret
REDIS_URL	No	—	Redis connection URL
GEMINI_MODEL	No	gemini-2.5-flash	Primary LLM model
GROQ_MODEL	No	llama-3.3-70b-versatile	Secondary LLM model
Database

Uses Supabase Postgres with the pgvector extension for 768-dimensional embeddings.
Tables

Knowledge layer: items, item_embeddings, item_connections

Presentation layer: workspaces, workspace_items, canvas_state, canvas_placements, canvas_objects

Support layer: users, user_preferences, conversations, board_ops
Vector Search

Two RPC functions: search_items() for global search and search_items_in_workspace() for scoped search. Both use cosine similarity with configurable threshold.