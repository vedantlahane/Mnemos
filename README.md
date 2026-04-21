Here are the four README files:

---

## Main README (root)

```markdown
# Mnemos

Visual knowledge workspace powered by AI. Capture, organize, and explore ideas on an infinite canvas.

## Architecture

```
mnemos/
├── frontend/    → React + Excalidraw canvas app
├── backend/     → FastAPI + LangChain API server
└── extension/   → Chrome extension for web capture
```

- **Knowledge ≠ Presentation** — Items (search, embeddings) are separate from canvas objects (what you see)
- **Chat-driven** — One endpoint powers navigation, capture, search, canvas mutations, and settings
- **Real-time** — SSE streaming for live text composition and canvas updates

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Excalidraw 0.18, Zustand, Tailwind v4, Vite |
| Backend | FastAPI, LangGraph, Gemini + Groq LLMs, pgvector |
| Database | Supabase (Postgres + vector search) |
| Extension | Plasmo, Chrome Manifest V3 |

## Quick Start

```bash
# Backend
cd backend
cp .env.example .env  # fill in keys
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Extension
cd extension
npm install
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GROQ_API_KEY` | No | Groq API key for secondary models |
| `REDIS_URL` | No | Redis for caching |
| `AUTH_ENABLED` | No | Enable Google OAuth (default: false) |

## Database Setup

Run `backend/migrations/001_schema.sql` in the Supabase SQL Editor.

## License

MIT
```

---

## Frontend README

```markdown
# Mnemos Frontend

React app with an Excalidraw infinite canvas and floating chat overlay.

## Stack

- React 19 + TypeScript
- Excalidraw 0.18 (column-locked, zoom-locked)
- Zustand (state management)
- Tailwind CSS v4
- Vite 8

## Structure

```
src/
├── api/          → API client + types
├── store/        → Zustand stores (app, chat, canvas)
├── hooks/        → useChat, useCanvas, useAuth, useDraggable, useKeyboard
├── lib/          → utils, constants, canvasLock, sanitizeScene, textMeasure
├── components/
│   ├── canvas/   → Excalidraw wrapper + empty state
│   ├── overlay/  → Chat UI, command palette, input
│   ├── cards/    → Boards, search, settings cards
│   └── shared/   → Icon, Logo, Markdown, EmptyState
└── index.css     → Glass morphism theme + Excalidraw overrides
```

## Running

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # production build
```

## Key Concepts

- Canvas is locked to a fixed-width column with no zoom
- Chat overlay is draggable and context-aware per workspace
- Slash commands (`/boards`, `/diagram`, `/compose`, etc.) via command palette
- SSE streaming shows live text composition on canvas
```

---

## Backend README

```markdown
# Mnemos Backend

FastAPI server — chat endpoint drives all functionality.

## Stack

- FastAPI + Uvicorn
- Google Gemini + Groq (dual LLM with fallback)
- LangGraph (note processing pipeline)
- Supabase (Postgres + pgvector)
- Redis (optional caching)

## Structure

```
app/
├── core/        → Config, event bus, errors
├── auth/        → JWT, Google OAuth, dependencies
├── routes/      → chat, auth, health, extension
├── commands/    → Intent classifier + command handlers
├── llm/         → Google/Groq providers, router
├── services/    → capture, composition, search, sync, placement, broadcaster
├── canvas/      → Element factory, scene renderer, layout engine, text measurement
├── db/          → Supabase repository
└── agents/      → LangGraph note processor
```

## Running

```bash
pip install -r requirements.txt
cp .env.example .env  # add your keys
uvicorn main:app --reload --port 8000
```

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | Main endpoint — handles all commands |
| `GET /api/workspaces/{id}/scene` | Get Excalidraw scene |
| `POST /api/workspaces/{id}/sync` | Bidirectional canvas sync |
| `GET /api/workspaces/{id}/events` | SSE stream |
| `POST /api/capture` | Extension capture endpoint |
| `GET /health` | Health check |

## Pipeline

Capture → Extract (LLM) → Embed (Gemini) → Route to workspace → Place on canvas → SSE notify
```

---

## Extension README

```markdown
# Mnemos Extension

Chrome extension for capturing web content into Mnemos.

## Stack

- Plasmo framework
- Chrome Manifest V3
- React (popup UI)

## Features

- Right-click context menu: "Save to Mnemos"
- Keyboard shortcut: `Ctrl+Shift+S` to quick-save selection
- Auto-detect related notes on page visit (badge count)
- Board selector with AI auto-routing option
- Toast notifications on capture

## Structure

```
├── content.ts    → Content script (selection capture, toasts)
├── background.ts → Service worker (API calls, context menu, badge)
├── popup.tsx     → Popup UI (save, board picker, related notes)
└── style.css     → Base styles
```

## Running

```bash
npm install
npm run dev      # loads as unpacked extension
npm run build    # production build
```

## Configuration

Set `PLASMO_PUBLIC_BACKEND_URL` in `.env` (defaults to `http://localhost:8000`).
```