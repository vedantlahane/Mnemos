> **This is the ONLY reference document. All future development depends on this.**
Last updated: v3→v4 Migration - Canvas Import Fixes Complete
Status: Backend v4 architecture complete, Canvas modules corrected, Ready for deployment
Author: You

## ⚡ V4 Migration Status

✅ **Canvas Module Imports**: Fixed (curator.py corrected, all namespaces standardized)  
✅ **v4 Architecture**: Fully implemented (events, commands, repository, services)  
✅ **Database Schema**: v4 schema defined (12 tables with vector functions)  
✅ **Git Committed**: Yes (commit 536d83d)  

**See [V4_MIGRATION_VERIFICATION.md](V4_MIGRATION_VERIFICATION.md) for complete verification report.** 

---

## Table of Contents

```
1.  WHAT MNEMOS IS
2.  CURRENT STATE (What's Built — Phases 1-5)
    2.1  Environment
    2.2  Backend — Full Implementation Details
    2.3  Database — Current Schema
    2.4  Chrome Extension — Full Implementation Details
    2.5  Frontend — Current Implementation (Being Replaced)
    2.6  Testing & Data
3.  THE NEW VISION (What's Changing)
    3.1  Core Concept Shift
    3.2  The Five Agents
    3.3  Pages Model
    3.4  Chat-First UI
    3.5  Glass Design System
    3.6  Canvas Per Page
4.  DATABASE — New Schema (Current + Additions)
5.  BACKEND — New Architecture
    5.1  New File Structure
    5.2  New Endpoints (Complete)
    5.3  New Services
    5.4  Modified Services
    5.5  Agent Definitions
6.  FRONTEND — Complete Redesign
    6.1  New File Structure
    6.2  Component Architecture
    6.3  Stream System
    6.4  Command System
    6.5  Context System
    6.6  Block Types
    6.7  Canvas System
    6.8  Glass Components
7.  EXTENSION — Updates
8.  LIBRARY STACK (Current + New)
9.  BUILD ORDER (Detailed)
10. DEFERRED SCOPE
11. CREDENTIALS & ENVIRONMENT
```

---

## 1. WHAT MNEMOS IS

A personal AI-powered knowledge workspace.

**Old mental model (Phases 1-5):**

```
Capture text → AI processes → Browse in grid → Search → Chat
```

**New mental model (v2):**

```
Capture text → AI processes + routes to PAGE → Browse via CHAT commands
→ Each page is a CANVAS (Excalidraw-style) → 5 AGENTS manage everything
→ Chat IS the interface → Glass aesthetic
```

**Core principles (unchanged):**

- Capture is instant. AI processing is async. User never waits.
- One LLM call for all extraction. Not five separate calls.
- Extension is thin — capture and surface only.
- Works across Ubuntu and Windows via cloud database.

**New principles (v2):**

- Chat is the primary interface. No traditional nav/pages.
- Every feature is a /command or natural language input.
- Notes live on topic PAGES (canvases), not a flat list.
- AI routes notes to the right page automatically.
- Canvas is Excalidraw-style with hand-drawn aesthetic.
- The canvas state is a data structure agents read and write.
- Glass design — hyper liquid glass on dark void.

---

## 2. CURRENT STATE (What's Built — Phases 1-5)

### 2.1 Environment

```
OS:          Windows, PowerShell
Python:      3.12 (3.14 was too new, installed 3.12 alongside)
Node:        v25.2.1
npm:         11.12.1
Git:         2.51.2
Editor:      VS Code
Project:     C:\\Users\\Admin\\Desktop\\Mnemos
```

### 2.2 Backend — Full Implementation Details

**Running at:** `http://localhost:8000`

**File structure (current):**

```
backend/
├── main.py
├── requirements.txt
├── .env
├── venv/                      # Python 3.12 virtual environment
└── app/
    ├── __init__.py
    ├── config.py
    ├── routes/
    │   ├── __init__.py
    │   ├── capture.py
    │   ├── notes.py
    │   ├── search.py
    │   ├── chat.py
    │   └── context.py
    ├── services/
    │   ├── __init__.py
    │   ├── llm.py
    │   ├── embeddings.py
    │   ├── processor.py
    │   └── retry.py
    ├── db/
    │   ├── __init__.py
    │   └── supabase.py
    └── models/
        ├── __init__.py
        └── schemas.py
```

**requirements.txt (current):**

```
fastapi>=0.115.0
uvicorn>=0.30.0
supabase>=2.0.0
google-genai>=1.0.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
python-dotenv>=1.0.0
```

[**main.py](http://main.py/) — what it does:**

```python
# asynccontextmanager lifespan:
#   On startup: queries notes stuck in pending/processing for > 5 minutes
#   For each stuck note: fires asyncio.create_task(processor.process_note)
#   Prints count of recovered notes
#
# CORS middleware:
#   Allows: localhost:5173, localhost:3000, chrome-extension://*
#
# Routers:
#   capture.router → /api
#   notes.router   → /api
#   search.router  → /api
#   chat.router    → /api
#   context.router → /api
#
# Health endpoint:
#   GET /health → {"status": "ok"}
```

[**config.py](http://config.py/) — what it does:**

```python
# pydantic-settings BaseSettings
# Reads from .env file
# Fields:
#   supabase_url: str
#   supabase_key: str
#   gemini_api_key: str
#   backend_port: int = 8000
#   cors_origins: list[str] = ["<http://localhost:5173>", "<http://localhost:3000>", "chrome-extension://*"]
```

**db/supabase.py — full API:**

```python
# Creates supabase client at module level:
#   client = create_client(settings.supabase_url, settings.supabase_key)
#
# NotesDB class (all methods async, wrap sync calls in asyncio.to_thread):
#
#   insert_note(**kwargs) → dict
#     client.table("notes").insert(kwargs).execute()
#     Returns: result.data[0]
#
#   update_note(note_id, **kwargs) → dict
#     Filters None values from kwargs
#     Adds updated_at = datetime.utcnow().isoformat()
#     client.table("notes").update(updates).eq("id", note_id).execute()
#     Returns: result.data[0] if result.data else {}
#
#   get_note(note_id) → dict
#     client.table("notes").select("*").eq("id", note_id).single().execute()
#     Returns: result.data
#
#   list_notes(page=1, limit=20, tag=None) → dict
#     Builds query with:
#       select("*", count="exact")
#       if tag: .contains("tags", [tag])
#       .order("created_at", desc=True)
#       .range((page-1)*limit, page*limit-1)
#     Returns: {"notes": result.data, "total": result.count}
#
#   delete_note(note_id) → None
#     client.table("notes").delete().eq("id", note_id).execute()
#
#   vector_search(embedding, limit=10, threshold=0.65) → list
#     client.rpc("match_notes", {
#       "query_embedding": embedding,
#       "match_threshold": threshold,
#       "match_count": limit
#     }).execute()
#     Returns: result.data
#
#   get_stuck_notes(older_than_minutes=5) → list
#     Queries notes with status in ["pending", "processing"]
#     Where created_at < (now - older_than_minutes)
#     Returns: result.data (list of {id, raw_text})
#
#   get_all_tags() → list[str]
#     Fetches all notes' tags column
#     Deduplicates with set()
#     Returns: sorted list of unique tags
#
# Singleton: db = NotesDB()
```

**services/llm.py — full implementation:**

```python
# Import: from google import genai
# Client: genai.Client(api_key=settings.gemini_api_key)
# MODEL: "gemini-2.5-flash"
#
# PROCESS_PROMPT:
#   "Analyze this text and return JSON only:
#    { title, summary, tags, tasks, entities }"
#   Input text capped at 3000 chars
#
# CHAT_SYSTEM:
#   "You are a personal knowledge assistant. Answer based ONLY on
#    the user's notes provided in the context. If the notes don't
#    contain enough information, say so honestly. Cite which notes
#    you're drawing from by mentioning their titles."
#
# @with_retry(max_retries=3, base_delay=2.0)
# async def process_capture(text: str) → ProcessedCapture:
#   Uses response_mime_type="application/json"
#   Calls client.aio.models.generate_content(model=MODEL, contents=prompt, config=...)
#   Validates with ProcessedCapture.model_validate_json(response.text)
#
# @with_retry(max_retries=3, base_delay=2.0)
# async def chat(question, context, history) → str:
#   Builds multi-turn messages array:
#     1. System instruction as user message
#     2. Model acknowledgement
#     3. Last 10 history turns (role mapping: user→user, assistant→model)
#     4. Current question with context
#   Each message: {"role": "user"|"model", "parts": [{"text": "..."}]}
#   Calls client.aio.models.generate_content(model=MODEL, contents=messages)
#   Returns response.text
```

**services/embeddings.py — full implementation:**

```python
# Import: from google import genai
# Client: genai.Client(api_key=settings.gemini_api_key)
# EMBEDDING_MODEL: "gemini-embedding-001"
#
# @with_retry(max_retries=3, base_delay=2.0)
# async def generate(text: str) → list[float]:
#   Caps text at 2000 chars
#   Calls client.aio.models.embed_content(
#     model=EMBEDDING_MODEL,
#     contents=text,
#     config={"task_type": "RETRIEVAL_DOCUMENT", "output_dimensionality": 768}
#   )
#   Returns result.embeddings[0].values
#
# @with_retry(max_retries=3, base_delay=2.0)
# async def generate_query(text: str) → list[float]:
#   Caps text at 500 chars
#   Same as above but task_type="RETRIEVAL_QUERY"
```

**services/processor.py — full implementation:**

```python
# NoteProcessor class:
#
# async def process_note(note_id, raw_text):
#   try:
#     Set status = "processing"
#
#     Step 1: LLM processing
#       try:
#         processed = await llm.process_capture(raw_text)
#         title = processed.title
#         summary = processed.summary
#         tags = processed.tags
#         tasks = processed.tasks
#         entities = processed.entities
#       except:
#         Fallback: title = raw_text[:50]+"...", summary = "Processing failed"
#       Save title, summary, tags, tasks, entities to DB
#
#     Step 2: Embedding (independent try/except)
#       try:
#         embedding = await embeddings.generate(raw_text)
#         Save embedding to DB
#       except:
#         embedding = None, print error
#
#     Step 3: Find related notes (only if embedding succeeded)
#       try:
#         related = await db.vector_search(embedding, limit=5, threshold=0.7)
#         related_ids = [r["id"] for r in related if r["id"] != note_id]
#         Save related_note_ids to DB
#       except:
#         print error
#
#     Set status = "done"
#
#   except (outer):
#     Set status = "failed"
#
# Singleton: processor = NoteProcessor()
```

**services/retry.py — full implementation:**

```python
# with_retry(max_retries=3, base_delay=1.0, max_delay=30.0) decorator
#
# For each attempt (0 to max_retries):
#   try: return await func(*args, **kwargs)
#   except: if last attempt, raise
#           else: delay = min(base_delay * 2^attempt, max_delay)
#                 jitter = random.uniform(0, delay * 0.5)
#                 wait = delay + jitter
#                 print retry info
#                 await asyncio.sleep(wait)
```

**routes/capture.py — full implementation:**

```python
# POST /api/capture
# Input: CaptureRequest (text, source_url?, page_title?, capture_type="highlight")
# Validation: MIN_TEXT_LENGTH=3, MAX_TEXT_LENGTH=50000
#   Strips whitespace, checks length, returns 400 if invalid
# Phase 1: Insert note with processing_status="pending" (< 500ms)
# Phase 2: background_tasks.add_task(processor.process_note, note_id, raw_text)
# Returns: {"status": "saved", "note_id": "..."}
```

**routes/notes.py — full implementation:**

```python
# GET /api/notes
#   Query params: page (int, default 1), limit (int, default 20), tag (str, optional)
#   Returns: {"notes": [...], "total": int}
#
# GET /api/notes/{note_id}
#   Returns: full note dict or 404
#
# PUT /api/notes/{note_id}
#   Input: NoteUpdate (title?, summary?, tags?, tasks? — all optional)
#   Returns 400 if no fields provided
#   Returns: updated note dict
#
# DELETE /api/notes/{note_id}
#   Returns: {"status": "deleted"}
#
# POST /api/notes/{note_id}/retry
#   Only if status is "failed" or "pending"
#   Resets to "pending", fires processor in background
#   Returns: {"status": "retrying", "note_id": "..."}
#
# GET /api/tags
#   Returns: {"tags": ["ai", "docker", ...]} (sorted unique list)
```

**routes/search.py — full implementation:**

```python
# GET /api/search
#   Query params: q (str), limit (int, default 10)
#   Embeds query with embeddings.generate_query(q)
#   Calls db.vector_search(embedding, limit, threshold=0.65)
#   Returns: {"query": q, "results": [...]}
```

**routes/chat.py — full implementation:**

```python
# POST /api/chat
#   Input: ChatRequest (question, history=[])
#   Step 1: Embed question with embeddings.generate_query
#   Step 2: Vector search top 5, threshold 0.65
#   Step 3: If no results → return "couldn't find related notes"
#   Step 4: Build context string from retrieved notes:
#     For each note: "Note: {title}\\nSummary: {summary}\\nContent: {raw_text[:1000]}\\nTags: {tags}"
#     Joined by "\\n\\n---\\n\\n"
#   Step 5: Call llm.chat(question, context, history)
#   Returns: {"answer": "...", "sources": [{id, title, similarity}]}
```

**routes/context.py — full implementation:**

```python
# POST /api/context
#   Input: ContextRequest (url, text)
#   CONTEXT_CONFIG:
#     similarity_threshold: 0.75
#     max_results: 3
#     min_text_length: 200
#     excluded_domains: ["google.com", "google.com/search", "mail.google.com",
#                        "github.com/search", "localhost", "chrome://"]
#   Skip if URL contains excluded domain
#   Skip if text < 200 chars
#   Embed page text[:1000] with generate_query
#   Vector search with threshold 0.75, limit 3
#   Returns: {"related_notes": [...]}
```

**models/schemas.py — all models:**

```python
# CaptureRequest(BaseModel):
#   text: str (required)
#   source_url: Optional[str] = None
#   page_title: Optional[str] = None
#   capture_type: str = "highlight"  # highlight | full_page | manual
#
# ChatRequest(BaseModel):
#   question: str (required)
#   history: list[dict] = []  # [{"role": "user"|"assistant", "content": "..."}]
#
# ContextRequest(BaseModel):
#   url: str (required)
#   text: str (required)
#
# NoteUpdate(BaseModel):
#   title: Optional[str] = None
#   summary: Optional[str] = None
#   tags: Optional[list[str]] = None
#   tasks: Optional[list[str]] = None
#
# ProcessedCapture(BaseModel):
#   title: str
#   summary: str
#   tags: list[str]
#   tasks: list[str]
#   entities: list[str]
```

### 2.3 Database — Current Schema

**Supabase project:** Created and running (cloud PostgreSQL + pgvector)

```sql
-- Currently deployed in Supabase:

create extension if not exists vector;

create table notes (
    id                  uuid primary key default gen_random_uuid(),
    title               text,
    raw_text            text not null,
    summary             text,
    tags                text[] default '{}',
    tasks               text[] default '{}',
    entities            text[] default '{}',
    source_url          text,
    page_title          text,
    capture_type        text default 'highlight',
    embedding           vector(768),
    embedding_model     text default 'text-embedding-004',
    processing_status   text default 'pending',
    related_note_ids    uuid[] default '{}',
    created_at          timestamptz default now(),
    updated_at          timestamptz default now()
);

-- Indexes (all deployed):
create index idx_notes_embedding on notes using hnsw (embedding vector_cosine_ops);
create index idx_notes_created on notes(created_at desc);
create index idx_notes_status on notes(processing_status);
create index idx_notes_tags on notes using gin(tags);

-- RPC function (deployed):
create or replace function match_notes(
    query_embedding vector(768),
    match_threshold float default 0.65,
    match_count int default 10
) returns table (
    id uuid, title text, summary text, raw_text text,
    tags text[], tasks text[], source_url text, similarity float
) language sql stable as $$
    select id, title, summary, raw_text, tags, tasks, source_url,
        1 - (embedding <=> query_embedding) as similarity
    from notes
    where embedding is not null
      and 1 - (embedding <=> query_embedding) > match_threshold
    order by embedding <=> query_embedding
    limit match_count;
$$;
```

### 2.4 Chrome Extension — Full Implementation Details

**File structure (current):**

```
extension/
├── package.json           # Manifest config: commands, permissions, host_permissions
├── .env                   # PLASMO_PUBLIC_BACKEND_URL=http://localhost:8000
└── src/
    ├── background.ts
    ├── content.ts
    └── popup.tsx
```

**package.json manifest config:**

```json
{
  "manifest": {
    "commands": {
      "save-selection": {
        "suggested_key": {
          "default": "Ctrl+Shift+S",
          "mac": "Command+Shift+S"
        },
        "description": "Save selected text to Mnemos"
      }
    },
    "permissions": ["contextMenus", "activeTab"],
    "host_permissions": ["<http://localhost:8000/*>"]
  }
}
```

**background.ts — full implementation:**

```
BACKEND_URL from process.env.PLASMO_PUBLIC_BACKEND_URL

State:
  contextCooldowns: Map<string, number>  (URL → timestamp)
  relatedNotesCache: Map<string, any[]>  (URL → related notes)
  COOLDOWN_MS = 5 * 60 * 1000  (5 minutes)

onInstalled:
  Creates context menu: id="save-to-mnemos", title="Save to Mnemos", contexts=["selection"]

onClicked (context menu):
  Gets selectionText from info
  Calls captureNote({text, source_url, page_title, capture_type: "highlight"})
  Sends CAPTURE_RESULT message to content script tab

onCommand "save-selection":
  Queries active tab
  Sends GET_SELECTION message to content script

onMessage handler:
  CAPTURE → captureNote(payload) → sendResponse
  CHECK_CONTEXT → checkContext(payload, tabId) → sendResponse
  GET_RECENT_NOTES → getRecentNotes() → sendResponse
  GET_RELATED_FOR_POPUP → returns cached relatedNotesCache for tab URL

captureNote(payload) → Promise<{success, noteId?, error?}>:
  POST to ${BACKEND_URL}/api/capture
  Returns {success: true, noteId} or {success: false, error}

checkContext(payload, tabId):
  Check cooldown (skip if URL checked in last 5 min)
  POST to ${BACKEND_URL}/api/context
  Cache results in relatedNotesCache
  Update badge: chrome.action.setBadgeText (count) + setBadgeBackgroundColor (#6366f1)

getRecentNotes():
  GET ${BACKEND_URL}/api/notes?page=1&limit=5
  Returns {notes: [...]}
```

**content.ts — full implementation:**

```
PlasmoCSConfig: matches=["<all_urls>"], run_at="document_idle"

showToast(message, isError=false):
  Creates fixed div at bottom-right
  Purple (#6366f1) for success, red (#ef4444) for error
  White text, z-index 2147483647
  Fades in (requestAnimationFrame opacity 0→1)
  Fades out after 3 seconds (opacity 1→0, then remove)

onMessage handler:
  GET_SELECTION:
    Gets window.getSelection().toString().trim()
    If empty → showToast("No text selected!", true)
    If text exists → sends CAPTURE message to background with {text, source_url, page_title}
    On response: shows success or error toast

  CAPTURE_RESULT:
    Shows success or error toast based on message.success

runContextCheck():
  setTimeout 2 seconds (debounce)
  Gets document.body.innerText.slice(0, 1000)
  Skips if < 200 chars
  Sends CHECK_CONTEXT to background with {url, text}

Called on script load: runContextCheck()
```

**popup.tsx — full implementation:**

```
State:
  recentNotes: Note[]
  relatedNotes: Note[]
  manualText: string
  saving: boolean
  loading: boolean
  error: string

BACKEND_URL from process.env.PLASMO_PUBLIC_BACKEND_URL
FRONTEND_URL = "<http://localhost:5173>"

loadData():
  Sends GET_RECENT_NOTES message → sets recentNotes
  Gets current tab URL → POST /api/context → sets relatedNotes

handleManualCapture():
  Sends CAPTURE message with {text, source_url: tab.url, page_title: tab.title, capture_type: "manual"}

UI layout:
  Width: 360px, max-height: 500px, overflow-y: auto
  Dark theme: #0f172a container, #1e293b cards
  Header: "🧠 Mnemos" + "Dashboard →" button
  Manual capture: textarea + "Save Note" button
  Related notes section: notes related to current tab
  Recent notes section: last 5 captures
  Each note: title, summary (80 chars), tags (max 3), similarity %
  Click note → chrome.tabs.create({url: FRONTEND_URL/note/id})
  Click Dashboard → chrome.tabs.create({url: FRONTEND_URL})

Styling: inline styles object (not Tailwind — separate from frontend build)
```

### 2.5 Frontend — Current Implementation (BEING REPLACED)

> **NOTE: The entire frontend is being redesigned from scratch.**
The current frontend was built in Phase 4. It's a traditional grid dashboard.
It WORKS but will be completely replaced with the chat-first UI.
Keeping this documentation for reference only.
> 

**Current file structure:**

```
frontend/
├── package.json
├── vite.config.ts             # react + tailwindcss plugins
├── .env                       # VITE_API_URL=http://localhost:8000/api
├── index.html
└── src/
    ├── App.tsx                # BrowserRouter + Layout + 4 routes (/, /note/:id, /search, /chat)
    ├── main.tsx               # StrictMode + createRoot
    ├── index.css              # @import "tailwindcss"
    ├── types.ts               # Note, ChatMessage, ChatSource interfaces
    ├── api/
    │   └── client.ts          # Fetch wrapper + api object
    ├── components/
    │   ├── Layout.tsx         # Sticky header + nav + max-w-7xl
    │   ├── NoteCard.tsx       # Card with title, summary, tags, date
    │   ├── SearchBar.tsx      # Input form → /search?q=
    │   ├── TagFilter.tsx      # Sidebar tag list
    │   ├── RelatedNotes.tsx   # Fetches related notes by ID
    │   ├── TaskList.tsx       # Checkbox task list
    │   ├── StatusBadge.tsx    # Processing status pill
    │   ├── EmptyState.tsx     # Icon + title + description
    │   └── ErrorState.tsx     # Error + retry button
    ├── hooks/
    │   ├── useNotes.ts        # Paginated notes + tag filter
    │   ├── useSearch.ts       # Semantic search
    │   └── useChat.ts         # Chat messages + history
    └── pages/
        ├── Dashboard.tsx      # Card grid + sidebar tags + search + pagination
        ├── NoteDetail.tsx     # Full note + edit + delete + retry + related
        ├── Search.tsx         # Semantic search with URL params
        └── Chat.tsx           # RAG chat with sources
```

**Current routing:** `/` → Dashboard, `/note/:id` → NoteDetail, `/search` → Search, `/chat` → Chat

**This entire frontend/ directory will be gutted and rebuilt.**

### 2.6 Testing & Data

**Seeded data (20 notes in Supabase):**

```
Topics: RAG, vector databases, FastAPI, prompt engineering, Kubernetes,
Docker, React hooks, PostgreSQL, TypeScript, CI/CD with GitHub Actions,
text embeddings, Tailwind CSS, Supabase, Prometheus/Grafana monitoring,
HNSW algorithm, Python async, Chrome Manifest V3, Pydantic v2,
Git branching strategies, REST API design

All have: processing_status="done", embeddings, summaries, tags, entities, related_note_ids
```

**Smoke tests (eval/smoke_test.py):**

```
5 search tests: checks query returns results with expected title/tag keywords
5 chat tests: checks answer contains expected keywords + has sources
Health check before running
Color-coded output with pass/fail
```

**Other files:**

```
scripts/reembed.py    — Re-embedding script for model changes
eval/smoke_test.py    — 10 automated tests
.gitignore            — Standard Python + Node ignores
```

### 2.7 Key Deviations from Original Spec

```
| Original Plan                    | What Changed                              | Why                                    |
|----------------------------------|-------------------------------------------|----------------------------------------|
| google-generativeai package      | google-genai                              | Old package deprecated                 |
| gemini-2.0-flash model           | gemini-2.5-flash                          | 2.0-flash had zero quota               |
| text-embedding-004               | gemini-embedding-001                      | text-embedding-004 not available       |
| 768 native dimensions            | output_dimensionality=768 param           | Native output is 3072, HNSW max 2000   |
| model.generate_content_async()   | client.aio.models.generate_content()      | New SDK async pattern                  |
| genai.embed_content()            | client.aio.models.embed_content()         | New SDK async pattern                  |
| result["embedding"]              | result.embeddings[0].values               | New SDK response format                |
```

---

## 3. THE NEW VISION (What's Changing)

### 3.1 Core Concept Shift

```
BEFORE (current):
  - Traditional dashboard with pages (Dashboard, Note Detail, Search, Chat)
  - Sidebar with tag filter
  - Card grid to browse notes
  - Separate search page
  - Separate chat page
  - Notes are a flat list

AFTER (v2):
  - ONE chat input bar at the bottom
  - Everything renders in a conversation stream above the input
  - /commands navigate between contexts (home, page, settings, history)
  - Notes live on PAGES (topic canvases like "Docker", "RAG", "React")
  - Each page has an Excalidraw-style canvas with notes, drawings, sticky notes
  - AI auto-routes captures to the right page
  - 5 specialized agents handle different jobs
  - Glass design (hyper liquid glass on dark void)
  - No traditional navigation, no sidebar, no separate pages
```

### 3.2 The Five Agents

```
📥 PROCESSOR AGENT (already partially exists as services/processor.py):
  Trigger: Every time a new note is captured
  Duration: 5-15 seconds per note (background, user doesn't wait)
  Current job:
    1. LLM: summarize + tag + extract tasks + entities (KEEP)
    2. Generate embedding (KEEP)
    3. Vector search → find related notes → save related_note_ids (KEEP)
  New jobs:
    4. Route to correct page (NEW — AI decides which page)
    5. Classify edge types (NEW — related/depends_on/extends/contradicts/summarizes/example_of)
    6. Save edges to note_edges table (NEW)
    7. Compute canvas position using existing UMAP transform (NEW)
    8. Assign to nearest cluster within page (NEW)

🗺️ CARTOGRAPHER AGENT (NEW — services/cartographer.py):
  Trigger:
    - After processor places a new note (incremental, <1s)
    - User clicks "Reorganize" / types /layout (full recompute, 5-30s)
    - Every 10 new notes (full recompute)
  Jobs:
    - UMAP projection: 768D embeddings → 2D canvas positions
    - HDBSCAN clustering: auto-group notes into topic clusters
    - NetworkX analysis: centrality scores, bridge note detection
    - LLM cluster naming: give each cluster a human-readable name
    - d3-force overlap resolution: prevent node overlapping
    - Save all positions, clusters, centrality, is_bridge to DB

🔬 RESEARCHER AGENT (already partially exists as routes/chat.py):
  Trigger: User asks a question (natural language in chat)
  Duration: 3-8 seconds per question
  Current job:
    1. Embed question (KEEP)
    2. Vector search (KEEP)
    3. Build context from retrieved notes (KEEP)
    4. Generate answer with citations (KEEP)
  New jobs:
    5. Graph expansion: follow edges from retrieved notes to get more context (NEW)
    6. Page-scoped search: if in page context, only search THAT page's notes (NEW)
    7. Follow-up suggestions: generate 2-3 suggested follow-up questions (NEW)
    8. Reading order: topological sort on depends_on edges (NEW)
    9. Gap analysis: identify missing topics vs known taxonomy (NEW)

👁️ OBSERVER AGENT (already exists as routes/context.py + extension):
  Trigger: User visits a new page in browser
  Duration: 1-3 seconds
  Current job (KEEP ALL):
    1. Embed page text
    2. Vector search with high threshold (0.75)
    3. Return related notes
    4. Extension shows badge count
  New jobs:
    5. Return which PAGE the related notes are on (NEW)
    6. Suggest: "You have 3 Docker notes related to this page" (NEW)

🧹 CURATOR AGENT (NEW — services/curator.py):
  Trigger:
    - Every 20 new notes
    - Manual /curator command
    - Daily schedule (if running as service)
  Duration: 10-30 seconds for full scan
  Jobs:
    - Duplicate detection: notes with similarity > 0.92
    - Orphan detection: notes with 0 edges
    - Stale detection: notes older than 30 days with no references
    - Large cluster detection: clusters with > 15 notes (suggest split)
    - Similar cluster detection: two clusters with high inter-similarity (suggest merge)
    - Missing edge detection: notes with sim > 0.8 but no edge
    - Auto-apply safe actions (add edges, rename clusters)
    - Queue risky actions for user confirmation (merge notes, delete, split clusters)
```

### 3.3 Pages Model

```
WHAT IS A PAGE:
  A page is a topic canvas. Like a digital whiteboard dedicated to one topic.
  Examples: "Docker", "RAG", "React", "DevOps", "Databases"

  Each page contains:
    - Note cards (captured from web or manual, AI-processed)
    - Sticky notes (quick manual text, no AI processing)
    - Freeform drawings (Excalidraw-style lines, shapes, arrows)
    - AI annotations (labels, gap indicators)
    - Edges (connections between items, typed and colored)
    - A viewport state (zoom level, pan position)

  Special pages:
    - "Uncategorized" — notes that AI couldn't confidently route
    - User can create any page via "create [name]" or /page create [name]

PAGE ROUTING (how notes get assigned):
  When a new note is captured:
    1. If user specified a page → use it
    2. If not → AI computes:
       a. Semantic similarity to each page's description
       b. Similarity to existing notes in each page
       c. URL domain match (docs.docker.com → Docker page)
       d. Tag overlap with page's existing tags
    3. If best match > 0.75 confidence → assign to that page
    4. If no match > 0.75 → put in "Uncategorized"
    5. Agent will suggest re-routing uncategorized notes periodically

USER CAN OVERRIDE:
  - Extension popup: page selector dropdown
  - Chat: "/capture [text] --page docker2"
  - Chat: "put this in the docker2 page"
  - Drag note between pages on canvas
  - Chat: "/move [note] to [page]"
```

### 3.4 Chat-First UI

```
THE COMMAND BAR:
  - Always visible at the bottom of the screen
  - Single text input
  - Placeholder changes based on context:
    Home: "Type a message or /command..."
    Page: "Search canvas, add notes, or ask about {page}..."
    Settings: "Change a setting or type to adjust..."
  - Focus: Ctrl+K or ⌘K
  - Type "/" → autocomplete dropdown appears above the bar
  - Type text without "/" → sends as natural language to Researcher Agent

THE STREAM:
  - Scrollable area above the command bar
  - Contains: user messages, AI responses, rich blocks
  - Rich blocks = interactive UI components rendered inline
  - /clear resets stream to welcome block

CONTEXTS:
  🏠 Home Context (default):
    - Welcome block with stats and page cards
    - Natural language → global RAG search
    - /commands navigate to other contexts
    - /notes, /search, /tags, /tasks, /stats render blocks inline

  📄 Page Context (when a page is open):
    - Canvas takes most of the screen
    - Chat panel on the right side (1/3 width) or bottom
    - Chat controls the canvas:
      "find swarm" → highlights matching elements (Ctrl+F style)
      "add note: [text]" → creates note card on canvas
      paste text → "Add to canvas?" prompt
      "connect A to B" → draws edge
      "zoom to [element]" → pans viewport
      "summarize this page" → AI reads all notes
    - Canvas controls the chat:
      Click note → detail in chat panel
      Right-click → "Ask AI about this"
      Double-click empty space → "What to add here?"

  ⚙️ Settings Context:
    - Settings form rendered inline in stream
    - Chat can also modify settings: "set threshold to 0.8"
    - All settings are editable both via form and chat

  📜 History Context:
    - Past conversations grouped by date
    - Search old chats
    - Click to resume a conversation

CONTEXT SWITCHING:
  "open docker" or "/open docker" → Page:Docker context
  "open settings" or "/settings" → Settings context
  "open history" or "/history" → History context
  "close" or ESC or "/close" → back to Home
  "/back" → previous context
  "/home" → always goes to Home

COMPLETE COMMAND LIST:

  HOME CONTEXT:
    /pages                    → list all pages with stats
    /page create [name]       → create new empty page
    /page delete [name]       → delete page (confirm)
    /open [page name]         → open page canvas
    /search [query]           → global semantic search
    /notes                    → all notes across all pages
    /notes recent             → last 10 captures
    /notes #tag               → notes filtered by tag
    /tags                     → tag cloud with counts
    /tasks                    → all tasks across pages
    /stats                    → workspace overview
    /capture [text]           → quick capture (AI routes to page)
    /capture [text] --page X  → capture to specific page
    /settings                 → open settings context
    /history                  → open history context
    /curator                  → run maintenance scan
    /help                     → show all commands
    /clear                    → clear conversation

  PAGE CONTEXT (canvas is open):
    /find [text]              → highlight on canvas (Ctrl+F)
    /add [text]               → add sticky note to canvas
    /add note [text]          → add as full note (AI processes it)
    /connect [A] to [B]       → create edge
    /disconnect [A] from [B]  → remove edge
    /zoom [element]           → pan+zoom to element
    /zoom fit                 → fit all in view
    /layout                   → auto-reorganize canvas
    /summarize                → AI summarizes all page content
    /gaps                     → what's missing on this page
    /reading                  → suggested reading order
    /export                   → export page as markdown
    /rename [new name]        → rename page
    /close                    → return to home

  SETTINGS CONTEXT:
    /theme [dark|light|glass] → change theme
    /model [name]             → change LLM model
    /threshold [0.0-1.0]      → similarity threshold
    /close                    → back to home

  WORKS ANYWHERE:
    /open [page]              → switch to page
    /home                     → go home
    /back                     → previous context
    ESC                       → close current context
    Ctrl+K or ⌘K              → focus command bar
    Natural language           → Researcher Agent
```

### 3.5 Glass Design System

```
FOUNDATION:
  Background:     #06060a (near black, slightly blue)
  Surface 1:      rgba(255,255,255, 0.03) + backdrop-blur(24px)
  Surface 2:      rgba(255,255,255, 0.06) + backdrop-blur(16px)
  Surface 3:      rgba(255,255,255, 0.09) + backdrop-blur(12px)

BORDERS:
  Default:        rgba(255,255,255, 0.06)
  Hover:          rgba(255,255,255, 0.12)
  Active:         linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))
  Glow:           0 0 1px rgba(99,102,241,0.5), inset 0 0 1px rgba(99,102,241,0.5)

TEXT:
  Primary:        rgba(255,255,255, 0.92)
  Secondary:      rgba(255,255,255, 0.55)
  Tertiary:       rgba(255,255,255, 0.30)
  Accent:         #818cf8 (indigo-400)

EFFECTS:
  Glass blur:     backdrop-filter: blur(24px) saturate(1.2)
  Noise texture:  SVG noise at 3% opacity over body::before
  Glow:           box-shadow: 0 0 40px rgba(99,102,241, 0.08)
  Card hover:     translateY(-1px) + border glow
  Reflection:     linear-gradient(135deg, transparent, rgba(255,255,255,0.02))

ACCENT COLORS:
  Primary:   #6366f1 → #818cf8  (indigo)
  Secondary: #a855f7 → #c084fc  (purple)
  Success:   #22c55e → #4ade80  (green)
  Warning:   #f59e0b → #fbbf24  (amber)
  Error:     #ef4444 → #f87171  (red)

MOTION (framer-motion):
  Block appear:   fade up + scale(0.98→1), spring damping 20
  Card hover:     translateY(-2px), 200ms ease
  Glass panels:   opacity 0→1 + blur 0→24px, 300ms
  Command bar:    subtle breathing glow animation
  Canvas open:    scale from center + fade, 400ms spring

Z-INDEX LAYERS:
  z-50: Canvas overlay (when open)
  z-40: Modal dialogs
  z-30: Command bar
  z-20: Floating elements (tooltips, autocomplete)
  z-10: Rich blocks in stream
  z-0:  Background + noise texture
```

### 3.6 Canvas Per Page

```
TECHNOLOGY:
  @xyflow/react (React Flow) — pan/zoom canvas, node rendering
  roughjs — hand-drawn SVG edges
  elkjs — smart graph layout (replaces dagre — better for dense graphs)
  d3-force — overlap resolution after UMAP placement

WHAT'S ON A CANVAS:
  Note cards — glass-styled, from captures, AI-processed
  Sticky notes — manual text, handwriting font, yellow/pastel glass
  Freeform drawings — Excalidraw-style, rough.js rendering
  Annotations — AI-created labels, semi-transparent
  Edges — typed connections, rough.js hand-drawn lines

EDGE TYPES (visually distinct):
  related       → gray dashed line
  depends_on    → blue solid line with arrow
  extends       → green solid line
  contradicts   → red dotted line
  summarizes    → purple dashed line
  example_of    → orange dotted line with circle

VISUAL CUES ON NODES:
  Size           = content length
  Border width   = centrality score
  Glow           = recently added (< 1 hour)
  Low opacity    = stale (> 30 days)
  🔗 icon        = bridge note (connects clusters)
  ⚠️ icon         = orphan note (no edges)
  ✅ icon         = has tasks

CANVAS BACKGROUND:
  #0d0d14 base
  Dot grid: radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px) size 24px
  Looks like sketching on a blackboard

USER INTERACTIONS:
  Drag note → save new position
  Click note → detail in chat panel
  Hover note → highlight connected edges
  Double-click empty → create sticky note at position
  Drag from note to note → create edge
  Box-select → bulk tag/cluster
  Right-click → context menu (open, copy, delete, disconnect, move to page)

CANVAS IS AN OVERLAY IN PAGE CONTEXT:
  Takes most of the screen
  Chat panel on right (1/3) or bottom
  Command bar always visible at bottom
  Chat and canvas are bidirectional
```

---

## 4. DATABASE — New Schema (Current + Additions)

```sql
-- ============================================
-- EXISTING (already deployed, DO NOT re-run)
-- ============================================

create extension if not exists vector;

create table notes (
    id                  uuid primary key default gen_random_uuid(),
    title               text,
    raw_text            text not null,
    summary             text,
    tags                text[] default '{}',
    tasks               text[] default '{}',
    entities            text[] default '{}',
    source_url          text,
    page_title          text,
    capture_type        text default 'highlight',
    embedding           vector(768),
    embedding_model     text default 'text-embedding-004',
    processing_status   text default 'pending',
    related_note_ids    uuid[] default '{}',
    created_at          timestamptz default now(),
    updated_at          timestamptz default now()
);

-- Existing indexes:
-- idx_notes_embedding (HNSW), idx_notes_created, idx_notes_status, idx_notes_tags (GIN)

-- Existing RPC:
-- match_notes(query_embedding, match_threshold, match_count)

-- ============================================
-- NEW TABLES (run these in Supabase SQL editor)
-- ============================================

-- Pages table
CREATE TABLE pages (
    id              uuid primary key default gen_random_uuid(),
    name            text not null unique,
    description     text,
    icon            text default '📄',
    color           text default '#6366f1',
    is_archived     boolean default false,
    canvas_data     jsonb default '{}',
    viewport        jsonb default '{"x":0,"y":0,"zoom":1}',
    note_count      int default 0,
    last_activity   timestamptz default now(),
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);

-- Edges table (typed relationships between notes)
CREATE TABLE note_edges (
    id              uuid primary key default gen_random_uuid(),
    source_id       uuid references notes(id) on delete cascade,
    target_id       uuid references notes(id) on delete cascade,
    edge_type       text not null default 'related',
    strength        float default 0.0,
    label           text,
    created_by      text default 'system',
    created_at      timestamptz default now(),
    unique(source_id, target_id)
);

-- Clusters table (per-page groupings)
CREATE TABLE clusters (
    id              uuid primary key default gen_random_uuid(),
    page_id         uuid references pages(id) on delete cascade,
    label           text not null,
    description     text,
    color           text default '#6366f1',
    center_x        float,
    center_y        float,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);

-- Canvas elements (sticky notes, drawings, annotations)
CREATE TABLE canvas_elements (
    id              uuid primary key default gen_random_uuid(),
    page_id         uuid references pages(id) on delete cascade,
    element_type    text not null,
    content         text,
    canvas_data     jsonb,
    position_x      float,
    position_y      float,
    width           float,
    height          float,
    style           jsonb default '{}',
    created_by      text default 'user',
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);

-- Chat history
CREATE TABLE chat_history (
    id              uuid primary key default gen_random_uuid(),
    context_type    text not null default 'home',
    context_id      uuid,
    messages        jsonb not null default '[]',
    title           text,
    created_at      timestamptz default now(),
    updated_at      timestamptz default now()
);

-- ============================================
-- ALTER EXISTING TABLES (run these)
-- ============================================

-- Notes: add page + canvas fields
ALTER TABLE notes ADD COLUMN page_id uuid references pages(id) on delete set null;
ALTER TABLE notes ADD COLUMN canvas_x float;
ALTER TABLE notes ADD COLUMN canvas_y float;
ALTER TABLE notes ADD COLUMN canvas_width float default 280;
ALTER TABLE notes ADD COLUMN canvas_height float;
ALTER TABLE notes ADD COLUMN cluster_id uuid references clusters(id) on delete set null;
ALTER TABLE notes ADD COLUMN centrality float default 0.0;
ALTER TABLE notes ADD COLUMN is_bridge boolean default false;

-- ============================================
-- NEW INDEXES
-- ============================================

CREATE INDEX idx_edges_source ON note_edges(source_id);
CREATE INDEX idx_edges_target ON note_edges(target_id);
CREATE INDEX idx_elements_page ON canvas_elements(page_id);
CREATE INDEX idx_notes_page ON notes(page_id);
CREATE INDEX idx_notes_cluster ON notes(cluster_id);
CREATE INDEX idx_clusters_page ON clusters(page_id);
CREATE INDEX idx_chat_history_context ON chat_history(context_type, context_id);

-- ============================================
-- NEW RPC FUNCTIONS
-- ============================================

-- Vector search scoped to a page
CREATE OR REPLACE FUNCTION match_notes_in_page(
    query_embedding vector(768),
    target_page_id uuid,
    match_threshold float default 0.65,
    match_count int default 10
) RETURNS TABLE (
    id uuid, title text, summary text, raw_text text,
    tags text[], tasks text[], source_url text, similarity float
) LANGUAGE sql STABLE AS $$
    SELECT id, title, summary, raw_text, tags, tasks, source_url,
        1 - (embedding <=> query_embedding) AS similarity
    FROM notes
    WHERE embedding IS NOT NULL
      AND page_id = target_page_id
      AND 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Create "Uncategorized" page on first run
INSERT INTO pages (name, description, icon, color)
VALUES ('Uncategorized', 'Notes that have not been assigned to a page yet', '📋', '#64748b')
ON CONFLICT (name) DO NOTHING;
```

---

## 5. BACKEND — New Architecture

### 5.1 New File Structure

```
backend/
├── main.py                          # MODIFY: add new routers + startup tasks
├── requirements.txt                 # MODIFY: add new dependencies
├── .env                             # KEEP as-is
├── venv/
└── app/
    ├── __init__.py
    ├── config.py                    # MODIFY: add new settings
    ├── routes/
    │   ├── __init__.py
    │   ├── capture.py               # MODIFY: add page_hint field, call page router
    │   ├── notes.py                 # MODIFY: add page_id filter, move endpoint
    │   ├── search.py                # MODIFY: add page_id scoped search
    │   ├── chat.py                  # MODIFY: add page context, follow-ups, reading order
    │   ├── context.py               # MODIFY: return page info with related notes
    │   ├── pages.py                 # NEW: page CRUD + canvas state
    │   ├── edges.py                 # NEW: edge CRUD
    │   ├── clusters.py              # NEW: cluster CRUD
    │   ├── canvas.py                # NEW: canvas elements + layout trigger
    │   ├── stats.py                 # NEW: workspace + page stats
    │   ├── history.py               # NEW: chat history CRUD
    │   └── curator.py               # NEW: curator scan endpoint
    ├── services/
    │   ├── __init__.py
    │   ├── llm.py                   # MODIFY: add edge classification, cluster naming, page routing prompts
    │   ├── embeddings.py            # KEEP as-is
    │   ├── processor.py             # MODIFY: add page routing, edge classification, canvas placement
    │   ├── retry.py                 # KEEP as-is
    │   ├── cartographer.py          # NEW: UMAP + HDBSCAN + NetworkX + layout
    │   ├── curator.py               # NEW: duplicate/orphan/stale detection
    │   ├── page_router.py           # NEW: AI decides which page a note goes to
    │   └── agents.py                # NEW: agent tool definitions + routing
    ├── db/
    │   ├── __init__.py
    │   └── supabase.py              # MODIFY: add page/edge/cluster/element/history queries
    └── models/
        ├── __init__.py
        └── schemas.py               # MODIFY: add Page, Edge, Cluster, Element, CanvasState models
```

### 5.2 New Endpoints (Complete)

```
EXISTING ENDPOINTS (keep or modify):
  POST   /api/capture               ← MODIFY: add page_hint, custom_command fields
  GET    /api/notes                  ← MODIFY: add page_id query param filter
  GET    /api/notes/:id              ← KEEP
  PUT    /api/notes/:id              ← MODIFY: allow changing page_id, canvas_x/y
  DELETE /api/notes/:id              ← KEEP
  POST   /api/notes/:id/retry       ← KEEP
  GET    /api/search                 ← MODIFY: add page_id for scoped search
  POST   /api/chat                   ← MODIFY: add context_type, page_id, follow-ups
  POST   /api/context                ← MODIFY: return page info with related notes
  GET    /api/tags                   ← MODIFY: return counts [{name, count}]
  GET    /health                     ← KEEP

NEW ENDPOINTS:

  PAGES:
    GET    /api/pages                ← list all pages with stats
    POST   /api/pages                ← create page {name, description?, icon?, color?}
    GET    /api/pages/:id            ← get page metadata
    PUT    /api/pages/:id            ← update page {name?, description?, icon?, color?, viewport?}
    DELETE /api/pages/:id            ← delete page (notes move to Uncategorized)
    GET    /api/pages/:id/canvas     ← full canvas state {notes, edges, elements, clusters, viewport}
    PUT    /api/pages/:id/canvas     ← save viewport state
    POST   /api/pages/:id/layout     ← trigger auto-layout for page (Cartographer)

  NOTES (additions):
    POST   /api/notes/:id/move       ← move note to different page {page_id}

  EDGES:
    GET    /api/edges                ← list edges (optional page_id, note_id filters)
    POST   /api/edges                ← create edge {source_id, target_id, edge_type, label?}
    DELETE /api/edges/:id            ← delete edge

  CLUSTERS:
    GET    /api/clusters             ← list clusters (optional page_id filter)
    POST   /api/clusters             ← create cluster
    PUT    /api/clusters/:id         ← update cluster {label?, description?, color?}
    DELETE /api/clusters/:id         ← dissolve cluster (notes lose cluster_id)

  CANVAS ELEMENTS:
    GET    /api/pages/:id/elements   ← all elements for a page
    POST   /api/pages/:id/elements   ← create element {type, content, position, style}
    PUT    /api/elements/:id         ← update element
    DELETE /api/elements/:id         ← delete element

  STATS:
    GET    /api/stats                ← global workspace stats
    GET    /api/pages/:id/stats      ← page-specific stats

  HISTORY:
    GET    /api/history              ← list chat conversations
    GET    /api/history/:id          ← single conversation
    POST   /api/history              ← save conversation
    DELETE /api/history/:id          ← delete conversation

  SEARCH (additions):
    POST   /api/search/canvas        ← search within canvas elements (text match)

  CURATOR:
    POST   /api/curator/scan         ← trigger curator scan, return report
    POST   /api/curator/apply        ← apply a suggested action
```

### 5.3 New Services

**services/page_router.py — AI decides which page a note goes to:**

```
async def route_note(text, tags, source_url, existing_pages) → {page_id, confidence, reason}

Prompt:
  Given the note content and existing pages, decide which page this belongs to.
  Each page has: name, description, sample note titles, tag distribution.
  Return: {page: "name" or "NEW:name", confidence: 0.0-1.0, reason: "..."}
  If confidence < 0.75 → return page: "Uncategorized"

Logic:
  1. Fetch all pages with their descriptions and sample notes
  2. Send to LLM with the new note's content
  3. LLM returns page assignment
  4. If "NEW:name" → create page, return its ID
  5. If existing page → return its ID
  6. Decorated with @with_retry
```

**services/cartographer.py — canvas layout computation:**

```
REQUIRES: umap-learn, hdbscan, scikit-learn, networkx

class Cartographer:

  async def compute_full_layout(page_id) → CanvasState:
    1. Fetch all notes with embeddings for this page
    2. If < 3 notes → simple grid layout, skip UMAP/HDBSCAN
    3. Run UMAP: 768D → 2D (n_neighbors=15, min_dist=0.1, metric='cosine')
    4. Normalize to canvas bounds (0-2000 x 0-1500)
    5. Run HDBSCAN (min_cluster_size=3) → auto clusters
    6. For outlier notes → cluster_id = null
    7. Build NetworkX graph from note_edges
    8. Compute betweenness centrality per note
    9. Detect bridge notes (high centrality between clusters)
    10. For each cluster → send note titles+tags to LLM → get name+description
    11. Run d3-force simulation → resolve overlaps
    12. Save: positions to notes, clusters to clusters table
    13. Return full canvas state

  async def place_single_note(note_id, page_id) → {x, y, cluster_id}:
    1. Get note embedding
    2. Get existing UMAP transform for this page
    3. Project embedding → 2D using transform
    4. Find nearest cluster center
    5. If close enough → assign to cluster
    6. Offset slightly from nearest note (avoid overlap)
    7. Save position
    8. Return {x, y, cluster_id}
```

**services/curator.py — maintenance scanning:**

```
class Curator:

  async def full_scan() → CuratorReport:
    1. Fetch all notes + edges
    2. Find duplicates: pairs with cosine similarity > 0.92
    3. Find orphans: notes with 0 edges and no cluster
    4. Find stale: notes older than 30 days, never referenced in chat
    5. Find large clusters: > 15 notes (suggest split)
    6. Find similar clusters: inter-cluster similarity > 0.8 (suggest merge)
    7. Find missing edges: note pairs with sim > 0.8 but no edge
    8. Send findings to LLM → get action suggestions
    9. Return CuratorReport with auto_actions + needs_confirmation

  async def apply_action(action) → result:
    Execute a specific curator action (merge, delete, connect, etc.)
```

**services/agents.py — agent tool definitions:**

```
AGENT_TOOLS = {
  "processor": [...tool definitions...],
  "cartographer": [...tool definitions...],
  "researcher": [...tool definitions...],
  "curator": [...tool definitions...]
}

For Gemini function calling — defines what each agent can do.
Used when building multi-step agent interactions.
```

### 5.4 Modified Services

**services/processor.py — updated pipeline:**

```
CURRENT STEPS (1-3):        KEEP
NEW STEPS (4-8):            ADD

async def process_note(note_id, raw_text, page_hint=None):
  Step 1: LLM summarize + tag + extract          (EXISTING, keep)
  Step 2: Generate embedding                       (EXISTING, keep)
  Step 3: Vector search → find related             (EXISTING, keep)

  Step 4: Route to page                            (NEW)
    If page_hint provided → use it
    Else → call page_router.route_note()
    Save page_id to note

  Step 5: Classify edge types                      (NEW)
    For each related note:
      Send both notes' content to LLM
      LLM returns: edge_type, label, confidence
      Save to note_edges table
    (replaces saving to related_note_ids — keep related_note_ids for backward compat)

  Step 6: Compute canvas position                  (NEW)
    Call cartographer.place_single_note(note_id, page_id)
    Save canvas_x, canvas_y to note

  Step 7: Assign to cluster                        (NEW)
    From place_single_note result
    Save cluster_id to note

  Step 8: Update page stats                        (NEW)
    Increment page.note_count
    Update page.last_activity
```

**services/llm.py — new prompts to add:**

```
EXISTING PROMPTS (keep):
  PROCESS_PROMPT — summarize + tag + extract
  CHAT_SYSTEM — knowledge assistant system prompt

NEW PROMPTS (add):

  EDGE_CLASSIFICATION_PROMPT:
    Given two notes, classify their relationship.
    Return: {edge_type, label, confidence}
    Types: related, depends_on, extends, contradicts, summarizes, example_of

  PAGE_ROUTING_PROMPT:
    Given a note and existing pages, decide which page it belongs to.
    Return: {page, confidence, reason}

  CLUSTER_NAMING_PROMPT:
    Given notes in a cluster, name and describe the cluster.
    Return: {label, description, color_hint}

  CURATOR_REVIEW_PROMPT:
    Given findings (duplicates, orphans, etc.), suggest actions.
    Return: [{action, params, reason, risk_level}]

  FOLLOW_UP_PROMPT:
    Given an answer, suggest 2-3 follow-up questions.
    Return: ["question1", "question2", "question3"]

  GAP_ANALYSIS_PROMPT:
    Given a page's notes and its topic, identify missing subtopics.
    Return: {covered: [...], missing: [...], suggestions: [...]}
```

**db/supabase.py — new methods to add:**

---

```
EXISTING METHODS (keep all):
  insert_note, update_note, get_note, list_notes, delete_note,
  vector_search, get_stuck_notes, get_all_tags

NEW METHODS TO ADD:

  # ─── Pages ─────────────────────────────────────────

  async def insert_page(**kwargs) → dict
    client.table("pages").insert(kwargs).execute()

  async def update_page(page_id, **kwargs) → dict
    Filters None values, adds updated_at
    client.table("pages").update(updates).eq("id", page_id).execute()

  async def get_page(page_id) → dict
    client.table("pages").select("*").eq("id", page_id).single().execute()

  async def get_page_by_name(name) → dict | None
    client.table("pages").select("*").ilike("name", name).maybe_single().execute()

  async def list_pages(include_archived=False) → list
    query = client.table("pages").select("*").order("last_activity", desc=True)
    if not include_archived: query = query.eq("is_archived", False)
    Returns: result.data

  async def delete_page(page_id) → None
    First: move all notes with this page_id to Uncategorized page
    Then: client.table("pages").delete().eq("id", page_id).execute()

  async def get_page_canvas(page_id) → dict
    Fetches in parallel:
      notes = notes where page_id matches (with positions)
      edges = note_edges where source_id or target_id has page_id
      elements = canvas_elements where page_id matches
      clusters = clusters where page_id matches
      page = page metadata (viewport, etc.)
    Returns: {notes, edges, elements, clusters, viewport}

  async def increment_page_note_count(page_id) → None
    RPC or manual: get current count, +1, update
    Also update last_activity = now()

  # ─── Edges ─────────────────────────────────────────

  async def insert_edge(**kwargs) → dict
    client.table("note_edges").insert(kwargs).execute()

  async def delete_edge(edge_id) → None
    client.table("note_edges").delete().eq("id", edge_id).execute()

  async def get_edges_for_note(note_id) → list
    Fetches edges where source_id = note_id OR target_id = note_id
    Returns: result.data

  async def get_edges_for_page(page_id) → list
    Joins with notes table to find edges where both endpoints are on page_id
    OR: fetches all note IDs for page, then edges where source or target in those IDs
    Returns: result.data

  async def edge_exists(source_id, target_id) → bool
    Check if edge exists in either direction

  # ─── Clusters ──────────────────────────────────────

  async def insert_cluster(**kwargs) → dict
    client.table("clusters").insert(kwargs).execute()

  async def update_cluster(cluster_id, **kwargs) → dict
    client.table("clusters").update(updates).eq("id", cluster_id).execute()

  async def list_clusters(page_id=None) → list
    query = client.table("clusters").select("*")
    if page_id: query = query.eq("page_id", page_id)
    Returns: result.data

  async def delete_cluster(cluster_id) → None
    Notes with this cluster_id get cluster_id = null (cascade set null)
    client.table("clusters").delete().eq("id", cluster_id).execute()

  # ─── Canvas Elements ───────────────────────────────

  async def insert_element(**kwargs) → dict
    client.table("canvas_elements").insert(kwargs).execute()

  async def update_element(element_id, **kwargs) → dict
    client.table("canvas_elements").update(updates).eq("id", element_id).execute()

  async def list_elements(page_id) → list
    client.table("canvas_elements").select("*").eq("page_id", page_id).execute()

  async def delete_element(element_id) → None
    client.table("canvas_elements").delete().eq("id", element_id).execute()

  # ─── Chat History ──────────────────────────────────

  async def insert_chat(**kwargs) → dict
    client.table("chat_history").insert(kwargs).execute()

  async def update_chat(chat_id, **kwargs) → dict
    client.table("chat_history").update(updates).eq("id", chat_id).execute()

  async def list_chats(limit=20) → list
    client.table("chat_history").select("*")
      .order("updated_at", desc=True).limit(limit).execute()

  async def get_chat(chat_id) → dict
    client.table("chat_history").select("*").eq("id", chat_id).single().execute()

  async def delete_chat(chat_id) → None
    client.table("chat_history").delete().eq("id", chat_id).execute()

  # ─── Stats ─────────────────────────────────────────

  async def get_global_stats() → dict
    total_notes = count from notes
    total_pages = count from pages where not archived
    total_tags = count unique tags
    total_tasks = count all tasks across notes (flatten arrays, count)
    status_counts = group by processing_status
    last_capture = max(created_at) from notes
    Returns: {total_notes, total_pages, total_tags, total_tasks,
              status_counts, last_capture}

  async def get_page_stats(page_id) → dict
    note_count = count notes where page_id
    edge_count = count edges for page
    cluster_count = count clusters where page_id
    element_count = count elements where page_id
    tag_distribution = aggregate tags from page's notes
    Returns: {note_count, edge_count, cluster_count, element_count, tags}

  # ─── Scoped Vector Search ──────────────────────────

  async def vector_search_in_page(embedding, page_id, limit=10, threshold=0.65) → list
    client.rpc("match_notes_in_page", {
      "query_embedding": embedding,
      "target_page_id": page_id,
      "match_threshold": threshold,
      "match_count": limit
    }).execute()
    Returns: result.data

  # ─── Tags (modified) ───────────────────────────────

  async def get_all_tags_with_counts() → list[dict]
    Fetches all notes' tags
    Counts occurrences of each tag
    Returns: [{"name": "docker", "count": 5}, {"name": "ai", "count": 3}, ...]
    Sorted by count descending
```

### 5.5 Models/Schemas — New and Modified

```python
# models/schemas.py — COMPLETE listing of all models

# ─── EXISTING (keep) ──────────────────────────────────

class CaptureRequest(BaseModel):
    text: str
    source_url: Optional[str] = None
    page_title: Optional[str] = None
    capture_type: str = "highlight"
    # NEW FIELDS:
    page_hint: Optional[str] = None        # page name or ID, user override
    custom_command: Optional[str] = None    # e.g., "create docker2 page"

class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    # NEW FIELDS:
    context_type: str = "home"             # "home" | "page" | "settings"
    page_id: Optional[str] = None          # if context_type == "page"

class ContextRequest(BaseModel):
    url: str
    text: str

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    tasks: Optional[list[str]] = None
    # NEW FIELDS:
    page_id: Optional[str] = None
    canvas_x: Optional[float] = None
    canvas_y: Optional[float] = None

class ProcessedCapture(BaseModel):
    title: str
    summary: str
    tags: list[str]
    tasks: list[str]
    entities: list[str]

# ─── NEW MODELS ───────────────────────────────────────

class PageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: str = "📄"
    color: str = "#6366f1"

class PageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    viewport: Optional[dict] = None
    is_archived: Optional[bool] = None

class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    edge_type: str = "related"    # related|depends_on|extends|contradicts|summarizes|example_of
    label: Optional[str] = None
    strength: float = 0.0
    created_by: str = "user"      # user|system|agent

class ClusterCreate(BaseModel):
    page_id: str
    label: str
    description: Optional[str] = None
    color: str = "#6366f1"

class ClusterUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None

class ElementCreate(BaseModel):
    element_type: str             # sticky|drawing|annotation|image
    content: Optional[str] = None
    canvas_data: Optional[dict] = None
    position_x: float = 0
    position_y: float = 0
    width: Optional[float] = None
    height: Optional[float] = None
    style: dict = {}
    created_by: str = "user"

class ElementUpdate(BaseModel):
    content: Optional[str] = None
    canvas_data: Optional[dict] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    style: Optional[dict] = None

class NoteMoveRequest(BaseModel):
    page_id: str

class ChatSave(BaseModel):
    context_type: str = "home"
    context_id: Optional[str] = None
    messages: list[dict]
    title: Optional[str] = None

class CanvasState(BaseModel):
    """Full canvas state returned by GET /api/pages/:id/canvas"""
    page: dict
    notes: list[dict]
    edges: list[dict]
    elements: list[dict]
    clusters: list[dict]
    viewport: dict

class CuratorReport(BaseModel):
    potential_duplicates: list[dict]
    orphan_notes: list[dict]
    stale_notes: list[dict]
    cluster_issues: list[dict]
    missing_connections: list[dict]
    auto_applied: int
    needs_confirmation: list[dict]

class CuratorAction(BaseModel):
    action_type: str    # merge_notes|delete_note|add_edge|split_cluster|merge_clusters
    params: dict

class PageRoutingResult(BaseModel):
    page_id: str
    page_name: str
    confidence: float
    reason: str

class EdgeClassification(BaseModel):
    edge_type: str
    label: Optional[str]
    confidence: float

class StatsResponse(BaseModel):
    total_notes: int
    total_pages: int
    total_tags: int
    total_tasks: int
    status_counts: dict
    last_capture: Optional[str]

class TagWithCount(BaseModel):
    name: str
    count: int
```

### 5.6 New Requirements.txt

```
# EXISTING (keep):
fastapi>=0.115.0
uvicorn>=0.30.0
supabase>=2.0.0
google-genai>=1.0.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
python-dotenv>=1.0.0

# NEW (add):
umap-learn>=0.5.0
hdbscan>=0.8.0
scikit-learn>=1.4.0
networkx>=3.2
numpy>=1.26.0
```

---

## 6. FRONTEND — Complete Redesign

### 6.1 New File Structure

```
frontend/
├── package.json
├── vite.config.ts                 # react + tailwindcss plugins
├── .env                           # VITE_API_URL=http://localhost:8000/api
├── index.html
└── src/
    ├── App.tsx                    # Stream + CommandBar + CanvasOverlay + ContextProvider
    ├── main.tsx                   # StrictMode + createRoot
    ├── index.css                  # Glass design tokens + Tailwind import
    ├── types.ts                   # All TypeScript interfaces
    │
    ├── core/                      # The chat-first architecture
    │   ├── CommandBar.tsx         # The input bar (always visible, bottom)
    │   ├── CommandRouter.ts       # Parse /commands → API calls → stream blocks
    │   ├── Stream.tsx             # Conversation stream container (scrollable)
    │   ├── StreamMessage.tsx      # Single user or assistant message
    │   ├── StreamBlock.tsx        # Routes blockType → correct block component
    │   └── ContextProvider.tsx    # React context for current context (home/page/settings/history)
    │
    ├── blocks/                    # Rich blocks rendered inline in stream
    │   ├── WelcomeBlock.tsx       # First-load greeting + page cards + stats
    │   ├── HelpBlock.tsx          # Command reference
    │   ├── NoteGridBlock.tsx      # Grid of note cards (from /notes, /notes #tag)
    │   ├── NoteDetailBlock.tsx    # Expandable note view (click card or /note)
    │   ├── SearchResultsBlock.tsx # Ranked results with similarity %
    │   ├── StatsBlock.tsx         # Glass stat cards (notes, pages, tags, tasks)
    │   ├── TagCloudBlock.tsx      # Horizontal chips with counts
    │   ├── TaskListBlock.tsx      # Tasks grouped by source note
    │   ├── PageListBlock.tsx      # List all pages with stats + icons
    │   ├── ReadingPathBlock.tsx   # Ordered reading list with dependency arrows
    │   ├── GapAnalysisBlock.tsx   # Covered vs missing topics
    │   ├── CuratorReportBlock.tsx # Scan results + action buttons
    │   ├── SettingsBlock.tsx      # Inline settings form (editable)
    │   └── HistoryBlock.tsx       # Past conversations grouped by date
    │
    ├── canvas/                    # Page canvas (Excalidraw-style)
    │   ├── CanvasOverlay.tsx      # Full-screen wrapper (z-50)
    │   ├── CanvasView.tsx         # React Flow setup + providers
    │   ├── NoteNode.tsx           # Custom node: glass note card
    │   ├── StickyNode.tsx         # Custom node: sticky note (handwriting style)
    │   ├── AnnotationNode.tsx     # Custom node: AI annotation (subtle)
    │   ├── SketchyEdge.tsx        # Custom edge: rough.js hand-drawn line
    │   ├── ClusterRegion.tsx      # Background region behind cluster nodes
    │   ├── CanvasControls.tsx     # Zoom, fit, layout, add-sticky, draw buttons
    │   ├── CanvasMinimap.tsx      # Mini overview map
    │   ├── CanvasChatPanel.tsx    # Right-side chat panel in page context
    │   └── CanvasSearch.tsx       # Ctrl+F style search highlighting on canvas
    │
    ├── glass/                     # Design system components
    │   ├── GlassCard.tsx          # Reusable glass panel with blur + border
    │   ├── GlassButton.tsx        # Button variants (primary, ghost, danger)
    │   ├── GlassInput.tsx         # Text input with glass styling
    │   ├── GlassBadge.tsx         # Status/tag badges
    │   ├── GlassChip.tsx          # Clickable tag/filter chips
    │   ├── GlassDropdown.tsx      # Autocomplete dropdown (for /commands)
    │   ├── GlassModal.tsx         # Confirmation dialogs
    │   └── GlassTooltip.tsx       # Hover tooltips
    │
    ├── hooks/
    │   ├── useStream.ts           # Stream state: items array, add/clear/pin
    │   ├── useCommands.ts         # Command parsing + autocomplete + execution
    │   ├── useContext.ts          # Context switching (home/page/settings/history)
    │   ├── useCanvas.ts           # Canvas state: nodes, edges, elements
    │   ├── useCanvasSearch.ts     # Search/highlight on canvas
    │   └── useKeyboard.ts        # ⌘K focus, ESC close, arrow nav
    │
    └── api/
        └── client.ts              # API calls — EXPANDED with new endpoints
```

### 6.2 New Package.json Dependencies

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "@xyflow/react": "^12.0.0",
    "roughjs": "^4.6.0",
    "elkjs": "^0.9.0",
    "d3-force": "^3.0.0",
    "framer-motion": "^11.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/d3-force": "^3.0.0",
    "typescript": "^5.6.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

### 6.3 Types (Complete)

```tsx
// src/types.ts — ALL TypeScript interfaces

// ─── Stream ──────────────────────────────────────────

export interface StreamItem {
  id: string
  type: "user" | "assistant" | "block" | "system"

  // For text messages
  content?: string

  // For rich blocks
  blockType?: BlockType
  blockData?: any

  // For AI responses
  sources?: ChatSource[]
  followUps?: string[]

  // Metadata for context awareness
  metadata?: {
    noteIds?: string[]        // which notes are visible in this block
    query?: string            // what query produced this
    tag?: string              // what tag filter is active
    pageId?: string           // which page context
    command?: string          // what command triggered this
  }

  timestamp: number
  loading?: boolean
}

export type BlockType =
  | "welcome"
  | "help"
  | "note-grid"
  | "note-detail"
  | "search-results"
  | "stats"
  | "tag-cloud"
  | "task-list"
  | "page-list"
  | "reading-path"
  | "gap-analysis"
  | "curator-report"
  | "settings"
  | "history"

// ─── Context ─────────────────────────────────────────

export type ContextType = "home" | "page" | "settings" | "history"

export interface AppContext {
  type: ContextType
  pageId?: string         // when type === "page"
  pageName?: string       // display name
  previousContext?: AppContext  // for /back navigation
}

// ─── Notes ───────────────────────────────────────────

export interface Note {
  id: string
  title: string | null
  raw_text: string
  summary: string | null
  tags: string[]
  tasks: string[]
  entities: string[]
  source_url: string | null
  page_title: string | null
  capture_type: string
  processing_status: string
  related_note_ids: string[]
  // New fields:
  page_id: string | null
  canvas_x: number | null
  canvas_y: number | null
  canvas_width: number
  canvas_height: number | null
  cluster_id: string | null
  centrality: number
  is_bridge: boolean
  //
  created_at: string
  updated_at: string
  similarity?: number      // from search results
}

// ─── Pages ───────────────────────────────────────────

export interface Page {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  is_archived: boolean
  canvas_data: Record<string, any>
  viewport: { x: number; y: number; zoom: number }
  note_count: number
  last_activity: string
  created_at: string
  updated_at: string
}

// ─── Edges ───────────────────────────────────────────

export type EdgeType =
  | "related"
  | "depends_on"
  | "extends"
  | "contradicts"
  | "summarizes"
  | "example_of"

export interface NoteEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: EdgeType
  strength: number
  label: string | null
  created_by: string
  created_at: string
}

// ─── Clusters ────────────────────────────────────────

export interface Cluster {
  id: string
  page_id: string
  label: string
  description: string | null
  color: string
  center_x: number | null
  center_y: number | null
  created_at: string
  updated_at: string
}

// ─── Canvas Elements ─────────────────────────────────

export type ElementType = "sticky" | "drawing" | "annotation" | "image"

export interface CanvasElement {
  id: string
  page_id: string
  element_type: ElementType
  content: string | null
  canvas_data: Record<string, any> | null
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  style: Record<string, any>
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Canvas State ────────────────────────────────────

export interface CanvasState {
  page: Page
  notes: Note[]
  edges: NoteEdge[]
  elements: CanvasElement[]
  clusters: Cluster[]
  viewport: { x: number; y: number; zoom: number }
}

// ─── Chat ────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  sources?: ChatSource[]
  followUps?: string[]
}

export interface ChatSource {
  id: string
  title: string
  similarity: number
}

// ─── Stats ───────────────────────────────────────────

export interface WorkspaceStats {
  total_notes: number
  total_pages: number
  total_tags: number
  total_tasks: number
  status_counts: Record<string, number>
  last_capture: string | null
}

// ─── Tags ────────────────────────────────────────────

export interface TagWithCount {
  name: string
  count: number
}

// ─── Curator ─────────────────────────────────────────

export interface CuratorReport {
  potential_duplicates: Array<{
    note_a: string; note_b: string; similarity: number;
    suggestion: string; reason: string
  }>
  orphan_notes: Array<{
    note_id: string; title: string; suggestion: string; reason: string
  }>
  stale_notes: Array<{
    note_id: string; title: string; days_old: number
  }>
  cluster_issues: Array<{
    cluster_id: string; issue: string; size?: number; suggestion: string
  }>
  missing_connections: Array<{
    note_a: string; note_b: string; similarity: number;
    suggested_type: string; reason: string
  }>
  auto_applied: number
  needs_confirmation: Array<{
    action_type: string; params: Record<string, any>; reason: string
  }>
}

// ─── Commands ────────────────────────────────────────

export interface Command {
  name: string           // e.g., "/notes"
  aliases: string[]      // e.g., ["/note", "/n"]
  description: string
  context: ContextType[] // which contexts this works in
  args?: string          // description of expected args
  handler: string        // function name to call
}

// ─── History ─────────────────────────────────────────

export interface ChatConversation {
  id: string
  context_type: string
  context_id: string | null
  messages: ChatMessage[]
  title: string | null
  created_at: string
  updated_at: string
}
```

### 6.4 API Client (Expanded)

```tsx
// src/api/client.ts — COMPLETE with all endpoints

const API_BASE = import.meta.env.VITE_API_URL || "<http://localhost:8000/api>"

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  // ─── Notes ──────────────────────────────────────
  listNotes: (page = 1, limit = 20, tag?: string, pageId?: string) =>
    request(`/notes?page=${page}&limit=${limit}${tag ? `&tag=${tag}` : ""}${pageId ? `&page_id=${pageId}` : ""}`),
  getNote: (id: string) => request(`/notes/${id}`),
  updateNote: (id: string, data: Record<string, unknown>) =>
    request(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    request(`/notes/${id}`, { method: "DELETE" }),
  retryNote: (id: string) =>
    request(`/notes/${id}/retry`, { method: "POST" }),
  moveNote: (id: string, pageId: string) =>
    request(`/notes/${id}/move`, { method: "POST", body: JSON.stringify({ page_id: pageId }) }),

  // ─── Capture ────────────────────────────────────
  capture: (data: { text: string; source_url?: string; page_title?: string; capture_type?: string; page_hint?: string; custom_command?: string }) =>
    request("/capture", { method: "POST", body: JSON.stringify(data) }),

  // ─── Pages ──────────────────────────────────────
  listPages: () => request("/pages"),
  createPage: (data: { name: string; description?: string; icon?: string; color?: string }) =>
    request("/pages", { method: "POST", body: JSON.stringify(data) }),
  getPage: (id: string) => request(`/pages/${id}`),
  updatePage: (id: string, data: Record<string, unknown>) =>
    request(`/pages/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePage: (id: string) =>
    request(`/pages/${id}`, { method: "DELETE" }),
  getPageCanvas: (id: string) => request(`/pages/${id}/canvas`),
  savePageViewport: (id: string, viewport: { x: number; y: number; zoom: number }) =>
    request(`/pages/${id}/canvas`, { method: "PUT", body: JSON.stringify({ viewport }) }),
  triggerPageLayout: (id: string) =>
    request(`/pages/${id}/layout`, { method: "POST" }),

  // ─── Edges ──────────────────────────────────────
  listEdges: (pageId?: string, noteId?: string) =>
    request(`/edges?${pageId ? `page_id=${pageId}` : ""}${noteId ? `&note_id=${noteId}` : ""}`),
  createEdge: (data: { source_id: string; target_id: string; edge_type: string; label?: string }) =>
    request("/edges", { method: "POST", body: JSON.stringify(data) }),
  deleteEdge: (id: string) =>
    request(`/edges/${id}`, { method: "DELETE" }),

  // ─── Clusters ───────────────────────────────────
  listClusters: (pageId?: string) =>
    request(`/clusters${pageId ? `?page_id=${pageId}` : ""}`),
  createCluster: (data: { page_id: string; label: string; description?: string; color?: string }) =>
    request("/clusters", { method: "POST", body: JSON.stringify(data) }),
  updateCluster: (id: string, data: Record<string, unknown>) =>
    request(`/clusters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCluster: (id: string) =>
    request(`/clusters/${id}`, { method: "DELETE" }),

  // ─── Canvas Elements ────────────────────────────
  listElements: (pageId: string) =>
    request(`/pages/${pageId}/elements`),
  createElement: (pageId: string, data: Record<string, unknown>) =>
    request(`/pages/${pageId}/elements`, { method: "POST", body: JSON.stringify(data) }),
  updateElement: (id: string, data: Record<string, unknown>) =>
    request(`/elements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteElement: (id: string) =>
    request(`/elements/${id}`, { method: "DELETE" }),

  // ─── Search ─────────────────────────────────────
  search: (q: string, limit = 10, pageId?: string) =>
    request(`/search?q=${encodeURIComponent(q)}&limit=${limit}${pageId ? `&page_id=${pageId}` : ""}`),
  searchCanvas: (pageId: string, query: string) =>
    request("/search/canvas", { method: "POST", body: JSON.stringify({ page_id: pageId, query }) }),

  // ─── Chat ───────────────────────────────────────
  chat: (question: string, history: Array<{ role: string; content: string }>, contextType = "home", pageId?: string) =>
    request("/chat", {
      method: "POST",
      body: JSON.stringify({ question, history, context_type: contextType, page_id: pageId }),
    }),

  // ─── Tags ───────────────────────────────────────
  getTags: () => request("/tags"),

  // ─── Stats ──────────────────────────────────────
  getStats: () => request("/stats"),
  getPageStats: (pageId: string) => request(`/pages/${pageId}/stats`),

  // ─── History ────────────────────────────────────
  listHistory: (limit = 20) => request(`/history?limit=${limit}`),
  getHistory: (id: string) => request(`/history/${id}`),
  saveHistory: (data: { context_type: string; context_id?: string; messages: any[]; title?: string }) =>
    request("/history", { method: "POST", body: JSON.stringify(data) }),
  deleteHistory: (id: string) =>
    request(`/history/${id}`, { method: "DELETE" }),

  // ─── Curator ────────────────────────────────────
  curatorScan: () =>
    request("/curator/scan", { method: "POST" }),
  curatorApply: (action: { action_type: string; params: Record<string, unknown> }) =>
    request("/curator/apply", { method: "POST", body: JSON.stringify(action) }),

  // ─── Health ─────────────────────────────────────
  health: () => fetch(`${API_BASE.replace("/api", "")}/health`).then(r => r.json()).catch(() => null),
}
```

### 6.5 Stream System (useStream hook)

```
STATE:
  items: StreamItem[]          — the conversation stream
  isLoading: boolean           — global loading state

METHODS:
  addUserMessage(content)      — adds user message to stream
  addAssistantMessage(content, sources?, followUps?)  — adds AI response
  addBlock(blockType, blockData, metadata?)  — adds rich block
  addSystemMessage(content)    — adds system notification
  setBlockLoading(id, loading) — toggle loading state on a block
  clearStream()                — resets to [welcomeBlock]
  getLastBlock()               — returns most recent block (for context)
  getVisibleNoteIds()          — collects all noteIds from visible blocks

ON MOUNT:
  Stream starts with WelcomeBlock showing stats + page cards

CONTEXT AWARENESS:
  When AI needs to answer "explain the first one":
    1. getLastBlock() → finds the most recent note-grid block
    2. Gets metadata.noteIds from that block
    3. "first one" = noteIds[0]
    4. Fetches that note as context for AI
```

### 6.6 Command System (useCommands hook)

```
STATE:
  inputValue: string
  suggestions: Command[]       — autocomplete suggestions
  selectedIndex: number        — arrow key navigation in dropdown

METHODS:
  handleInput(value)           — updates inputValue, triggers autocomplete if starts with /
  handleSubmit()               — parses and executes command or sends to AI
  getAutoComplete(partial)     — returns matching commands for dropdown

COMMAND DEFINITIONS:
  Each command has:
    name: string               — "/notes"
    aliases: string[]          — ["/n"]
    description: string        — "Browse all notes"
    context: ContextType[]     — ["home", "page"] (which contexts it works in)
    args?: string              — "tag or 'recent'"
    execute: (args, context, stream, api) → Promise<void>

PARSING:
  Input starts with "/" → parse as command
    Split by space: command = parts[0], args = parts.slice(1).join(" ")
    Find matching command definition
    Check if command is valid in current context
    Execute command.execute(args)

  Input doesn't start with "/" → natural language
    Send to POST /api/chat with current context info
    Add user message + AI response to stream
```

### 6.7 Context System (useContext hook)

```
STATE:
  current: AppContext          — {type, pageId?, pageName?, previousContext?}

METHODS:
  switchTo(contextType, pageId?, pageName?)
    Saves current as previousContext
    Sets new context
    Updates command bar placeholder
    If type === "page" → load canvas
    If type === "settings" → add SettingsBlock to stream
    If type === "history" → add HistoryBlock to stream

  goBack()
    Restores previousContext
    If no previous → go to home

  goHome()
    Switches to {type: "home"}
    Adds WelcomeBlock to stream

CONTEXT-DEPENDENT BEHAVIOR:
  Home:
    Command bar placeholder: "Type a message or /command..."
    Natural language → global RAG search
    Stream shows: welcome, notes, search results, stats, etc.

  Page:
    Command bar placeholder: "Search, add notes, or ask about {pageName}..."
    Natural language → page-scoped RAG (only this page's notes)
    Canvas overlay is visible
    Chat panel on right side
    /find → canvas search
    Paste → "Add to canvas?" prompt

  Settings:
    Command bar placeholder: "Change a setting or type to adjust..."
    Natural language → settings adjustment
    Settings form rendered inline

  History:
    Command bar placeholder: "Search past conversations..."
    Natural language → search history
    Conversation list rendered inline
```

---

## 7. EXTENSION — Updates

```
CURRENT EXTENSION (mostly keep, small modifications):

background.ts — MODIFY:
  captureNote payload gains: page_hint field
  After successful capture, response now includes page_name
  Toast message changes to: "✓ Saved to {page_name}"

content.ts — KEEP as-is (no changes needed)

popup.tsx — MODIFY:
  Add page selector dropdown:
    On load: fetch GET /api/pages → populate dropdown
    Default: "Auto-detect" (AI decides)
    User can select specific page

  Send page_hint in capture payload:
    If "Auto-detect" → page_hint = null
    If specific page → page_hint = page.name

  Show which page related notes are from:
    Each related note shows its page name as a badge

  "Dashboard →" button → opens frontend root (now shows chat-first UI)

Updated popup layout:
  ┌──────────────────────────────────────┐
  │  🧠 Mnemos                          │
  │                                      │
  │  Captured text preview...            │
  │                                      │
  │  📄 Page: [Auto-detect ▼]           │
  │    ├── Auto-detect                   │
  │    ├── 🐳 Docker                     │
  │    ├── 🤖 RAG                        │
  │    ├── ⚛️ React                      │
  │    └── + Create new page             │
  │                                      │
  │  💬 Command (optional):              │
  │  ┌──────────────────────────────┐    │
  │  │                              │    │
  │  └──────────────────────────────┘    │
  │                                      │
  │  [Save]  [Save & Open]              │
  │                                      │
  │  ─────────────────────────────────   │
  │  📌 Related (from Docker page):      │
  │  • Docker Networking (87%)           │
  │  • Docker Best Practices (82%)       │
  └──────────────────────────────────────┘
```

---

## 8. LIBRARY STACK (Complete)

```
BACKEND (Python):
  EXISTING (keep):
    fastapi>=0.115.0           — API server
    uvicorn>=0.30.0            — ASGI server
    supabase>=2.0.0            — Database client
    google-genai>=1.0.0        — Gemini LLM + embeddings
    pydantic>=2.0.0            — Data validation
    pydantic-settings>=2.0.0   — Settings from .env
    python-dotenv>=1.0.0       — .env file loading

  NEW (add):
    umap-learn>=0.5.0          — 768D → 2D embedding projection
    hdbscan>=0.8.0             — Auto-clustering
    scikit-learn>=1.4.0        — ML utilities (normalization, k-means fallback)
    networkx>=3.2              — Graph analysis (centrality, bridges, communities)
    numpy>=1.26.0              — Required by UMAP/HDBSCAN

FRONTEND (JavaScript):
  EXISTING (keep):
    react                      — UI framework
    react-dom                  — DOM rendering
    react-router-dom           — Routing (minimal use — just for URL sync)
    tailwindcss                — Utility CSS
    @tailwindcss/vite          — Vite plugin for Tailwind v4

  NEW (add):
    @xyflow/react              — Canvas rendering, pan/zoom, node/edge system
    roughjs                    — Hand-drawn SVG edges (sketchy aesthetic)
    elkjs                      — Smart graph layout (better than dagre)
    d3-force                   — Physics-based overlap resolution
    framer-motion              — Animations (block appear, transitions, hover)

EXTENSION:
  EXISTING (keep):
    plasmo                     — Extension framework
    typescript                 — Type safety
    react / react-dom          — Popup UI

  No new extension dependencies needed.
```

---

## 9. BUILD ORDER (Detailed)

```
WAVE 1: Database + Backend Foundation (Days 1-3)
├── Day 1: Database
│   ├── Run new SQL in Supabase (pages, note_edges, clusters, canvas_elements, chat_history)
│   ├── Run ALTER TABLE on notes (add page_id, canvas_x/y, cluster_id, centrality, is_bridge)
│   ├── Run new indexes
│   ├── Run match_notes_in_page RPC function
│   ├── Insert "Uncategorized" default page
│   ├── Assign all existing 20 notes to "Uncategorized" page
│   └── Verify in Supabase dashboard
│
├── Day 2: Backend — New DB methods + Page CRUD
│   ├── Update db/supabase.py with all new methods (pages, edges, clusters, elements, history, stats)
│   ├── Update models/schemas.py with all new models
│   ├── Create routes/pages.py (GET/POST/PUT/DELETE /api/pages, /api/pages/:id/canvas)
│   ├── Create routes/edges.py (GET/POST/DELETE /api/edges)
│   ├── Create routes/clusters.py (GET/POST/PUT/DELETE /api/clusters)
│   ├── Create routes/canvas.py (GET/POST elements, POST layout trigger)
│   ├── Create routes/stats.py (GET /api/stats, GET /api/pages/:id/stats)
│   ├── Create routes/history.py (GET/POST/DELETE /api/history)
│   ├── Register all new routers in main.py
│   ├── Modify routes/notes.py: add page_id filter, move endpoint
│   ├── Modify routes/tags.py: return counts
│   └── Test all new endpoints with curl
│
├── Day 3: Backend — Page Router + Processor Update
│   ├── Create services/page_router.py (AI page routing)
│   ├── Update services/llm.py (add edge classification, page routing, cluster naming prompts)
│   ├── Update services/processor.py (add steps 4-8: route, classify edges, position, cluster)
│   ├── Update routes/capture.py (accept page_hint, pass to processor)
│   ├── Modify routes/search.py (add page_id scoped search)
│   ├── Modify routes/chat.py (add context_type, page_id, follow-ups)
│   ├── Test: capture a note → verify it routes to correct page
│   ├── Test: capture with page_hint → verify override works
│   └── Test: edges created in note_edges table

WAVE 2: Cartographer + Curator (Days 4-5)
├── Day 4: Cartographer Service
│   ├── pip install umap-learn hdbscan scikit-learn networkx numpy
│   ├── Create services/cartographer.py
│   ├── Implement compute_full_layout(page_id)
│   ├── Implement place_single_note(note_id, page_id)
│   ├── Wire into processor.py (step 6-7)
│   ├── Wire into routes/canvas.py (POST /api/pages/:id/layout)
│   ├── Test: trigger layout → verify positions and clusters saved
│   └── Test: capture note → verify incremental placement works
│
├── Day 5: Curator Service
│   ├── Create services/curator.py
│   ├── Implement full_scan()
│   ├── Implement apply_action()
│   ├── Create routes/curator.py (POST /api/curator/scan, POST /api/curator/apply)
│   ├── Test: run curator scan on existing 20 notes
│   └── Test: apply a suggested action (e.g., add missing edge)

WAVE 3: Frontend — Glass Shell (Days 6-8)
├── Day 6: Glass Design System + App Shell
│   ├── Gut existing frontend/src/ (remove all current components/pages/hooks)
│   ├── Create index.css with glass design tokens
│   ├── Create glass/ components (GlassCard, GlassButton, GlassInput, etc.)
│   ├── Create App.tsx (Stream + CommandBar + ContextProvider)
│   ├── Create core/Stream.tsx
│   ├── Create core/CommandBar.tsx (with / autocomplete dropdown)
│   ├── Create core/ContextProvider.tsx
│   ├── Create hooks/useStream.ts
│   ├── Create hooks/useCommands.ts
│   ├── Create hooks/useContext.ts
│   ├── Create hooks/useKeyboard.ts (⌘K, ESC, arrows)
│   └── Test: app loads, command bar visible, can type
│
├── Day 7: Blocks — Core
│   ├── Create core/StreamMessage.tsx
│   ├── Create core/StreamBlock.tsx (routes blockType → component)
│   ├── Create blocks/WelcomeBlock.tsx
│   ├── Create blocks/HelpBlock.tsx
│   ├── Create blocks/PageListBlock.tsx (/pages)
│   ├── Create blocks/NoteGridBlock.tsx (/notes, /notes #tag)
│   ├── Create blocks/NoteDetailBlock.tsx (click card)
│   ├── Create blocks/SearchResultsBlock.tsx (/search)
│   ├── Create blocks/StatsBlock.tsx (/stats)
│   ├── Create blocks/TagCloudBlock.tsx (/tags)
│   ├── Create blocks/TaskListBlock.tsx (/tasks)
│   ├── Wire: commands execute → blocks render in stream
│   └── Test: /notes → grid shows, /search → results show, etc.
│
├── Day 8: Blocks — Advanced + Chat
│   ├── Wire natural language → POST /api/chat → AI response in stream
│   ├── Create follow-up suggestion chips (clickable)
│   ├── Create blocks/ReadingPathBlock.tsx (/reading)
│   ├── Create blocks/GapAnalysisBlock.tsx (/gaps)
│   ├── Create blocks/CuratorReportBlock.tsx (/curator)
│   ├── Create blocks/SettingsBlock.tsx (/settings)
│   ├── Create blocks/HistoryBlock.tsx (/history)
│   ├── Implement context switching (home ↔ page ↔ settings ↔ history)
│   └── Test: full command flow, context switches, AI chat works

WAVE 4: Canvas (Days 9-11)
├── Day 9: Canvas Foundation
│   ├── npm install @xyflow/react roughjs elkjs d3-force framer-motion
│   ├── Create canvas/CanvasOverlay.tsx (full-screen, z-50)
│   ├── Create canvas/CanvasView.tsx (React Flow setup)
│   ├── Create canvas/NoteNode.tsx (glass note card as custom node)
│   ├── Create canvas/StickyNode.tsx (handwriting sticky note)
│   ├── Create canvas/SketchyEdge.tsx (rough.js SVG paths)
│   ├── Create canvas/ClusterRegion.tsx (background regions)
│   ├── Create hooks/useCanvas.ts
│   ├── Wire: "open [page]" → canvas opens with notes + edges
│   └── Test: canvas renders, can pan/zoom, nodes + edges visible
│
├── Day 10: Canvas Interactions
│   ├── Create canvas/CanvasControls.tsx (zoom, fit, layout, add-sticky, draw)
│   ├── Create canvas/CanvasMinimap.tsx
│   ├── Create canvas/CanvasChatPanel.tsx (right-side chat in page context)
│   ├── Create canvas/CanvasSearch.tsx (Ctrl+F style)
│   ├── Create hooks/useCanvasSearch.ts
│   ├── Wire: /find → highlights on canvas
│   ├── Wire: /add → creates element on canvas
│   ├── Wire: paste in page context → add to canvas prompt
│   ├── Wire: click node → detail in chat panel
│   ├── Wire: drag node → save position
│   └── Test: full canvas interaction flow
│
├── Day 11: Canvas Polish
│   ├── Edge type colors (gray/blue/green/red/purple/orange)
│   ├── Node visual cues (size, border, glow, opacity, icons)
│   ├── Cluster region labeling
│   ├── Framer-motion animations (node appear, edge draw, zoom)
│   ├── Canvas background (dot grid)
│   └── Test: visual polish, smooth interactions

WAVE 5: Extension Update + Integration (Days 12-13)
├── Day 12: Extension
│   ├── Update popup.tsx: add page selector dropdown
│   ├── Update background.ts: include page_hint in capture
│   ├── Update toast messages: "Saved to {page_name}"
│   ├── Test: capture with page selection
│   └── Test: capture with auto-detect
│
├── Day 13: Integration + E2E Testing
│   ├── End-to-end: capture via extension → routes to page → appears on canvas
│   ├── End-to-end: chat in home context → global RAG
│   ├── End-to-end: chat in page context → page-scoped RAG
│   ├── End-to-end: /curator → scan → apply action
│   ├── End-to-end: /reading → reading path
│   ├── End-to-end: /gaps → gap analysis
│   ├── Update eval/smoke_test.py with new test cases
│   ├── Fix edge cases, error handling
│   ├── Test on Windows
│   └── Performance check (stream with 50+ items, canvas with 20+ nodes)

WAVE 6: DevOps (Days 14-16, DEFERRED)
├── Dockerfile for backend
├── docker-compose.yml
├── K8s manifests
├── Prometheus metrics
├── Grafana dashboards
├── GitHub Actions CI/CD
└── README with architecture diagrams
```

---

## 10. DEFERRED SCOPE

```
| Feature                          | Status              | Revisit When                    |
|----------------------------------|---------------------|---------------------------------|
| Docker + Dockerfile              | Phase 6 — DevOps    | After product works             |
| docker-compose.yml               | Phase 6             | After product works             |
| Kubernetes manifests             | Phase 6             | After product works             |
| Prometheus /metrics              | Phase 6             | After product works             |
| Grafana dashboards               | Phase 6             | After product works             |
| GitHub Actions CI/CD             | Phase 6             | After product works             |
| HPA autoscaling                  | Phase 6             | After product works             |
| Streaming chat (SSE)             | v3                  | When latency bothers you        |
| LangChain/LangGraph              | Maybe never         | If agent complexity demands it  |
| Redis caching                    | v3                  | If performance needs it         |
| Auth                             | v3                  | If you share the tool           |
| tldraw                           | Dropped             | Using React Flow instead        |
| Excalidraw library               | Partial             | rough.js for edges, custom for drawings |
| CRAG / reranking                 | v3                  | When RAG quality needs improving|
| Query decomposition              | v3                  | When single-query RAG fails     |
| Weekly digest                    | v3                  | After daily use is solid        |
| Mobile app                       | v3                  | Browser + extension sufficient  |
| RAGAS eval in CI                 | v3                  | After manual tests are robust   |
| LangSmith tracing                | v3                  | When debugging agent flows      |
| Real-time collaboration          | Never (solo tool)   | N/A                             |
| Image/screenshot capture         | v2.5                | After text capture is perfect   |
| Voice input                      | v3                  | Nice to have, not core          |
| Freehand drawing (full Excalidraw)| v2.5               | After basic canvas works        |
```

---

## 11. CREDENTIALS & ENVIRONMENT

```
Gemini API Key: AIzaSyDY1XGiA3hewdxRb-c5lWsxvEUWJy8tog4

# backend/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
GEMINI_API_KEY=AIzaSyDY1XGiA3hewdxRb-c5lWsxvEUWJy8tog4
BACKEND_PORT=8000

# frontend/.env
VITE_API_URL=http://localhost:8000/api

# extension/.env
PLASMO_PUBLIC_BACKEND_URL=http://localhost:8000

Running:
  Backend:   cd backend && .\\venv\\Scripts\\activate && uvicorn main:app --reload --port 8000
  Frontend:  cd frontend && npm run dev → <http://localhost:5173>
  Extension: cd extension && npm run dev → Load build/chrome-mv3-dev/ in chrome://extensions
  Tests:     cd Mnemos && python eval/smoke_test.py
```

---

**END OF SINGLE SOURCE OF TRUTH v2**

**This document is the ONLY reference. All code changes depend on this.When starting a new chat, paste the original spec + this document.Start from WAVE 1, Day 1: Database changes.**