# Backend README + API Documentation

## `backend/README.md`

```markdown
# Mnemos Backend — v2.0

Personal AI-powered knowledge workspace backend.
FastAPI + Supabase (pgvector) + Gemini 2.5 Flash.

---

## Quick Start

```bash
cd backend

# Activate virtual environment
.\venv\Scripts\activate          # Windows PowerShell
# source venv/bin/activate       # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --reload --port 8000
```

Server runs at `http://localhost:8000`
Health check: `http://localhost:8000/health`

---

## Environment Variables

File: `backend/.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-key
BACKEND_PORT=8000
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         FastAPI                              │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ capture   │  │ notes    │  │ search   │  │ chat     │    │
│  │ pages     │  │ edges    │  │ clusters │  │ canvas   │    │
│  │ stats     │  │ history  │  │ curator  │  │ context  │    │
│  └────┬──────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│  ┌────▼──────────────▼──────────────▼──────────────▼─────┐   │
│  │                    SERVICES                            │   │
│  │  processor    │ page_router │ cartographer │ curator   │   │
│  │  llm          │ embeddings  │ retry                    │   │
│  └────────────────────────┬──────────────────────────────┘   │
│                           │                                   │
│  ┌────────────────────────▼──────────────────────────────┐   │
│  │                   DB (Supabase)                        │   │
│  │  notes │ pages │ note_edges │ clusters │ canvas_elems │   │
│  │  chat_history │ vector search (pgvector)               │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## The Five Agents

| Agent | Service File | Trigger | Duration |
|-------|-------------|---------|----------|
| **Processor** | `processor.py` + `page_router.py` | Every capture | 5-15s (background) |
| **Cartographer** | `cartographer.py` | After processor / manual `/layout` | 1-30s |
| **Researcher** | `chat.py` route + `llm.py` | User asks question | 3-8s |
| **Observer** | `context.py` route | Browser page visit | 1-3s |
| **Curator** | `curator.py` | Manual `/curator` or every 20 notes | 10-30s |

---

## Processing Pipeline (8 Steps)

When a note is captured via `POST /api/capture`:

```
Step 1: LLM → title, summary, tags, tasks, entities
Step 2: Generate 768D embedding (gemini-embedding-001)
Step 3: Vector search → find related notes
Step 4: Route to page (AI decides or user override)
Step 5: Classify edge types between related notes
Step 6: Compute canvas position (UMAP projection)
Step 7: Assign to nearest cluster
Step 8: Update page statistics
```

Steps 1-8 run in background. User gets instant response after save.

---

## File Structure

```
backend/
├── main.py                    # FastAPI app, CORS, routers, lifespan
├── requirements.txt           # Python dependencies
├── .env                       # Secrets (not in git)
├── venv/                      # Virtual environment
└── app/
    ├── __init__.py
    ├── config.py              # Settings from .env
    ├── routes/
    │   ├── capture.py         # POST /api/capture
    │   ├── notes.py           # CRUD notes + tags + move + retry
    │   ├── search.py          # Semantic search + canvas search
    │   ├── chat.py            # RAG chat with context
    │   ├── context.py         # Browser context check (extension)
    │   ├── pages.py           # Page CRUD + canvas state + layout
    │   ├── edges.py           # Edge CRUD
    │   ├── clusters.py        # Cluster CRUD
    │   ├── canvas.py          # Canvas element CRUD
    │   ├── stats.py           # Global + page stats
    │   ├── history.py         # Chat history CRUD
    │   └── curator.py         # Maintenance scan + apply
    ├── services/
    │   ├── llm.py             # Gemini calls (process, chat, classify, route, etc.)
    │   ├── embeddings.py      # Embedding generation (document + query)
    │   ├── processor.py       # 8-step processing pipeline
    │   ├── page_router.py     # AI page routing logic
    │   ├── cartographer.py    # UMAP + HDBSCAN + NetworkX layout
    │   ├── curator.py         # Duplicate/orphan/stale detection
    │   └── retry.py           # Exponential backoff decorator
    ├── db/
    │   └── supabase.py        # All database operations
    └── models/
        └── schemas.py         # Pydantic models
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `notes` | Captured text, AI fields, embedding, canvas position |
| `pages` | Topic canvases ("Docker", "RAG", etc.) |
| `note_edges` | Typed relationships between notes |
| `clusters` | Auto-grouped note clusters per page |
| `canvas_elements` | Sticky notes, drawings, annotations |
| `chat_history` | Saved conversations |

---

## Dependencies

```
fastapi          — API framework
uvicorn          — ASGI server
supabase         — Database client
google-genai     — Gemini LLM + embeddings
pydantic         — Validation
umap-learn       — 768D → 2D projection
hdbscan          — Auto-clustering
scikit-learn     — ML utilities
networkx         — Graph analysis
numpy            — Numeric operations
```

---

## Common Commands

```bash
# Start server
uvicorn main:app --reload --port 8000

# Install new dependency
pip install <package> && pip freeze > requirements.txt

# Run smoke tests
cd .. && python eval/smoke_test.py

# Check health
curl http://localhost:8000/health
```

---

## Error Handling

- All processing is wrapped in try/except with fallbacks
- Failed notes get `processing_status: "failed"` and can be retried
- Stuck notes (pending > 5 min) are auto-recovered on startup
- LLM calls use exponential backoff (3 retries, 2s base delay)
- Edge classification falls back to "related" type on LLM failure
- Page routing falls back to "Uncategorized" on any failure
- Canvas placement falls back to random position on failure
```

---

## `backend/API_DOCS.md`

```markdown
# Mnemos API Reference v2.0

Base URL: `http://localhost:8000`
All data endpoints prefixed with `/api`
Content-Type: `application/json`

---

## Table of Contents

1. [Health](#health)
2. [Capture](#capture)
3. [Notes](#notes)
4. [Pages](#pages)
5. [Search](#search)
6. [Chat](#chat)
7. [Edges](#edges)
8. [Clusters](#clusters)
9. [Canvas Elements](#canvas-elements)
10. [Stats](#stats)
11. [History](#history)
12. [Context](#context)
13. [Curator](#curator)
14. [Data Models](#data-models)

---

## Health

### `GET /health`

```
Response: { "status": "ok", "version": "2.0" }
```

---

## Capture

### `POST /api/capture`

Capture text. Returns instantly. Processing happens in background.

**Request Body:**
```json
{
  "text": "string (required, 3-50000 chars)",
  "source_url": "string | null",
  "page_title": "string | null",
  "capture_type": "highlight | full_page | manual",
  "page_hint": "string | null — page name to route to",
  "custom_command": "string | null"
}
```

**Response:**
```json
{
  "status": "saved",
  "note_id": "uuid",
  "page_hint": "Docker | null"
}
```

**What happens in background (5-15s):**
1. LLM extracts title, summary, tags, tasks, entities
2. Generates 768D embedding
3. Finds related notes via vector search
4. Routes to page (AI or page_hint override)
5. Classifies edge types with related notes
6. Computes canvas position
7. Assigns to cluster
8. Updates page stats

**Frontend usage:**
```typescript
const result = await api.capture({
  text: "Docker uses cgroups for resource isolation",
  page_hint: "Docker",  // optional, let AI decide if null
});
// result.note_id → can poll GET /api/notes/{id} for processing_status
```

---

## Notes

### `GET /api/notes`

List notes with pagination and filters.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page |
| `tag` | string | null | Filter by tag |
| `page_id` | string | null | Filter by page UUID |

**Response:**
```json
{
  "notes": [Note],
  "total": 42
}
```

**Frontend usage:**
```typescript
// All notes
const all = await api.listNotes();

// Notes on Docker page
const docker = await api.listNotes(1, 20, undefined, dockerPageId);

// Notes tagged "kubernetes"
const k8s = await api.listNotes(1, 20, "kubernetes");
```

---

### `GET /api/notes/{note_id}`

Get single note with all fields.

**Response:** Full [Note](#note) object.

**Key fields for frontend:**
```json
{
  "id": "uuid",
  "title": "Docker Networking",
  "summary": "Explains bridge and overlay networks...",
  "raw_text": "full captured text...",
  "tags": ["docker", "networking"],
  "tasks": ["Set up overlay network"],
  "entities": ["Docker", "bridge network"],
  "processing_status": "done | pending | processing | failed",
  "page_id": "uuid",
  "canvas_x": 450.5,
  "canvas_y": 320.0,
  "canvas_width": 280,
  "cluster_id": "uuid | null",
  "centrality": 0.45,
  "is_bridge": false,
  "related_note_ids": ["uuid", "uuid"],
  "source_url": "https://docs.docker.com/...",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:05Z"
}
```

---

### `PUT /api/notes/{note_id}`

Update note fields.

**Request Body (all optional):**
```json
{
  "title": "string",
  "summary": "string",
  "tags": ["string"],
  "tasks": ["string"],
  "page_id": "uuid",
  "canvas_x": 100.0,
  "canvas_y": 200.0
}
```

**Response:** Updated note object.

**Frontend usage — save canvas position after drag:**
```typescript
await api.updateNote(noteId, {
  canvas_x: newX,
  canvas_y: newY,
});
```

---

### `DELETE /api/notes/{note_id}`

Delete a note. Auto-decrements page note count.

**Response:** `{ "status": "deleted" }`

---

### `POST /api/notes/{note_id}/retry`

Retry processing for failed/pending notes.

**Response:** `{ "status": "retrying", "note_id": "uuid" }`

---

### `POST /api/notes/{note_id}/move`

Move note to a different page. Re-computes canvas position.

**Request Body:**
```json
{
  "page_id": "target-page-uuid"
}
```

**Response:**
```json
{
  "status": "moved",
  "note_id": "uuid",
  "page_id": "uuid",
  "page_name": "Docker"
}
```

---

### `GET /api/tags`

Get all tags with usage counts.

**Response:**
```json
{
  "tags": [
    { "name": "docker", "count": 8 },
    { "name": "kubernetes", "count": 5 },
    { "name": "react", "count": 3 }
  ]
}
```

Sorted by count descending.

---

## Pages

### `GET /api/pages`

List all pages.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_archived` | bool | false | Include archived pages |

**Response:**
```json
{
  "pages": [
    {
      "id": "uuid",
      "name": "Docker",
      "description": "Container orchestration knowledge",
      "icon": "🐳",
      "color": "#6366f1",
      "is_archived": false,
      "viewport": { "x": 0, "y": 0, "zoom": 1 },
      "note_count": 8,
      "last_activity": "2025-01-15T10:30:00Z",
      "created_at": "2025-01-10T08:00:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

Sorted by `last_activity` descending.

---

### `POST /api/pages`

Create a new page.

**Request Body:**
```json
{
  "name": "Docker (required, unique)",
  "description": "string | null",
  "icon": "🐳 (default: 📄)",
  "color": "#6366f1 (default: #6366f1)"
}
```

**Response:** Created page object.

**Errors:**
- `400` if name already exists

---

### `GET /api/pages/{page_id}`

Get page metadata.

**Response:** Full page object.

---

### `PUT /api/pages/{page_id}`

Update page.

**Request Body (all optional):**
```json
{
  "name": "string",
  "description": "string",
  "icon": "string",
  "color": "string",
  "viewport": { "x": 100, "y": 200, "zoom": 1.5 },
  "is_archived": false
}
```

---

### `DELETE /api/pages/{page_id}`

Delete page. All notes move to "Uncategorized".

**Errors:**
- `400` if trying to delete "Uncategorized"

---

### `GET /api/pages/{page_id}/canvas`

**⭐ KEY ENDPOINT FOR CANVAS**

Returns the complete canvas state for rendering.

**Response:**
```json
{
  "page": { Page object },
  "notes": [
    {
      "id": "uuid",
      "title": "Docker Networking",
      "summary": "...",
      "tags": ["docker"],
      "canvas_x": 450.5,
      "canvas_y": 320.0,
      "canvas_width": 280,
      "canvas_height": null,
      "cluster_id": "uuid",
      "centrality": 0.45,
      "is_bridge": false,
      "processing_status": "done",
      "...all other note fields"
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "source_id": "uuid",
      "target_id": "uuid",
      "edge_type": "depends_on",
      "strength": 0.85,
      "label": "requires understanding of",
      "created_by": "processor"
    }
  ],
  "elements": [
    {
      "id": "uuid",
      "element_type": "sticky",
      "content": "Remember to test this!",
      "position_x": 600,
      "position_y": 400,
      "width": 200,
      "height": 150,
      "style": { "color": "#fbbf24" }
    }
  ],
  "clusters": [
    {
      "id": "uuid",
      "label": "Container Networking",
      "description": "Notes about Docker network modes",
      "color": "#22c55e",
      "center_x": 500,
      "center_y": 350
    }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

**Frontend usage — load canvas:**
```typescript
const canvas = await api.getPageCanvas(pageId);
// canvas.notes → React Flow nodes
// canvas.edges → React Flow edges (with rough.js rendering)
// canvas.elements → additional custom nodes
// canvas.clusters → background region overlays
// canvas.viewport → initial viewport position
```

---

### `PUT /api/pages/{page_id}/canvas`

Save viewport position (called on pan/zoom).

**Request Body:**
```json
{
  "viewport": { "x": 150, "y": -30, "zoom": 1.2 }
}
```

---

### `POST /api/pages/{page_id}/layout`

**⭐ TRIGGERS CARTOGRAPHER**

Full UMAP + HDBSCAN + NetworkX recomputation.
Takes 5-30 seconds depending on note count.

**Response:** Full canvas state (same as `GET /canvas`).

**Frontend usage:**
```typescript
// User clicks "Reorganize" button or types /layout
const newCanvas = await api.triggerPageLayout(pageId);
// Animate all nodes to new positions
```

---

## Search

### `GET /api/search`

Semantic vector search across notes.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query |
| `limit` | int | 10 | Max results |
| `page_id` | string | null | Scope to page |

**Response:**
```json
{
  "query": "container networking",
  "results": [
    {
      "id": "uuid",
      "title": "Docker Networking",
      "summary": "...",
      "raw_text": "...",
      "tags": ["docker", "networking"],
      "tasks": [],
      "source_url": "https://...",
      "similarity": 0.89
    }
  ]
}
```

**Frontend usage:**
```typescript
// Global search (home context)
const global = await api.search("docker networking");

// Page-scoped search (page context)
const scoped = await api.search("networking", 10, dockerPageId);
```

---

### `POST /api/search/canvas`

Text search within a page's canvas (notes + elements).
Used for Ctrl+F style highlighting on canvas.

**Request Body:**
```json
{
  "page_id": "uuid",
  "query": "networking"
}
```

**Response:**
```json
{
  "results": [
    {
      "type": "note",
      "id": "uuid",
      "title": "Docker Networking",
      "canvas_x": 450.5,
      "canvas_y": 320.0
    },
    {
      "type": "element",
      "id": "uuid",
      "element_type": "sticky",
      "content": "Test the networking setup",
      "position_x": 600,
      "position_y": 400
    }
  ]
}
```

**Frontend usage — /find command:**
```typescript
const hits = await api.searchCanvas(pageId, "networking");
// Highlight matching nodes on canvas
// Pan to first result
```

---

## Chat

### `POST /api/chat`

**⭐ PRIMARY AI INTERACTION**

RAG-powered chat. Retrieves relevant notes, builds context, generates answer.

**Request Body:**
```json
{
  "question": "What do I know about Docker networking?",
  "history": [
    { "role": "user", "content": "previous question" },
    { "role": "assistant", "content": "previous answer" }
  ],
  "context_type": "home | page",
  "page_id": "uuid | null"
}
```

**Behavior by context:**
- `context_type: "home"` → searches ALL notes globally
- `context_type: "page"` + `page_id` → searches that page first, falls back to global if < 2 results

**Response:**
```json
{
  "answer": "Based on your notes, Docker networking uses bridge networks by default...",
  "sources": [
    { "id": "uuid", "title": "Docker Networking", "similarity": 0.89 },
    { "id": "uuid", "title": "Docker Best Practices", "similarity": 0.76 }
  ],
  "follow_ups": [
    "How do overlay networks differ from bridge networks?",
    "What are the security implications of Docker networking?",
    "How does Kubernetes networking compare?"
  ]
}
```

**Frontend usage:**
```typescript
// Home context — global search
const response = await api.chat(
  "What do I know about Docker?",
  conversationHistory,
  "home"
);

// Page context — scoped search
const response = await api.chat(
  "Explain the networking section",
  conversationHistory,
  "page",
  dockerPageId
);

// Display response.answer in stream
// Render response.sources as clickable citations
// Render response.follow_ups as suggestion chips
```

**Important for conversation history:**
```typescript
// Build history array from stream items
const history = streamItems
  .filter(item => item.type === "user" || item.type === "assistant")
  .map(item => ({
    role: item.type,
    content: item.content,
  }));
```

---

## Edges

### `GET /api/edges`

List edges with optional filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page_id` | string | Edges for notes on this page |
| `note_id` | string | Edges connected to this note |

**Response:**
```json
{
  "edges": [
    {
      "id": "uuid",
      "source_id": "uuid",
      "target_id": "uuid",
      "edge_type": "depends_on",
      "strength": 0.85,
      "label": "requires understanding of",
      "created_by": "processor | user | curator",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Edge types and how to render:**
| Type | Color | Style | Arrow |
|------|-------|-------|-------|
| `related` | gray (#9ca3af) | dashed | none |
| `depends_on` | blue (#3b82f6) | solid | → arrow |
| `extends` | green (#22c55e) | solid | none |
| `contradicts` | red (#ef4444) | dotted | none |
| `summarizes` | purple (#a855f7) | dashed | none |
| `example_of` | orange (#f59e0b) | dotted | ○ circle |

---

### `POST /api/edges`

Create a manual edge (e.g., user draws connection on canvas).

**Request Body:**
```json
{
  "source_id": "uuid",
  "target_id": "uuid",
  "edge_type": "related | depends_on | extends | contradicts | summarizes | example_of",
  "label": "optional description",
  "strength": 0.0,
  "created_by": "user"
}
```

---

### `DELETE /api/edges/{edge_id}`

Delete an edge.

---

## Clusters

### `GET /api/clusters`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page_id` | string | Filter by page |

**Response:**
```json
{
  "clusters": [
    {
      "id": "uuid",
      "page_id": "uuid",
      "label": "Container Networking",
      "description": "Notes about Docker network modes and configuration",
      "color": "#22c55e",
      "center_x": 500.0,
      "center_y": 350.0,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Frontend usage — render as background region on canvas:**
```typescript
// For each cluster, draw a semi-transparent colored region
// behind all notes with that cluster_id
// Use center_x, center_y as region center
// Expand to encompass all notes in cluster + padding
```

---

### `POST /api/clusters`

Create a cluster manually.

### `PUT /api/clusters/{cluster_id}`

Update cluster label, description, color.

### `DELETE /api/clusters/{cluster_id}`

Dissolve cluster. Notes lose their cluster assignment.

---

## Canvas Elements

### `GET /api/pages/{page_id}/elements`

List sticky notes, drawings, annotations for a page.

**Response:**
```json
{
  "elements": [
    {
      "id": "uuid",
      "page_id": "uuid",
      "element_type": "sticky | drawing | annotation | image",
      "content": "Remember to test this!",
      "canvas_data": null,
      "position_x": 600,
      "position_y": 400,
      "width": 200,
      "height": 150,
      "style": { "color": "#fbbf24", "font": "handwriting" },
      "created_by": "user | agent",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Element types and rendering:**
| Type | Description | Canvas Node |
|------|-------------|-------------|
| `sticky` | Manual text note | StickyNode (yellow, handwriting) |
| `drawing` | Freehand drawing | SVG path via rough.js |
| `annotation` | AI-created label | AnnotationNode (subtle, semi-transparent) |
| `image` | Image reference | ImageNode (deferred) |

---

### `POST /api/pages/{page_id}/elements`

Create element (e.g., user double-clicks empty canvas space → sticky).

**Request Body:**
```json
{
  "element_type": "sticky",
  "content": "TODO: research this more",
  "position_x": 600,
  "position_y": 400,
  "width": 200,
  "height": 150,
  "style": { "color": "#fbbf24" },
  "created_by": "user"
}
```

### `PUT /api/elements/{element_id}`

Update element position, content, size.

### `DELETE /api/elements/{element_id}`

Delete element from canvas.

---

## Stats

### `GET /api/stats`

**⭐ USED FOR WELCOME BLOCK**

Global workspace statistics.

**Response:**
```json
{
  "total_notes": 42,
  "total_pages": 5,
  "total_tags": 18,
  "total_tasks": 12,
  "status_counts": {
    "done": 38,
    "pending": 2,
    "failed": 1,
    "processing": 1
  },
  "last_capture": "2025-01-15T10:30:00Z"
}
```

**Frontend usage — WelcomeBlock:**
```typescript
const stats = await api.getStats();
// Render glass stat cards:
// "42 Notes" | "5 Pages" | "18 Tags" | "12 Tasks"
```

---

### `GET /api/pages/{page_id}/stats`

Page-specific statistics.

**Response:**
```json
{
  "note_count": 8,
  "edge_count": 12,
  "cluster_count": 3,
  "element_count": 2,
  "tags": [
    { "name": "docker", "count": 8 },
    { "name": "networking", "count": 3 }
  ]
}
```

---

## History

### `GET /api/history`

List saved chat conversations.

**Query Parameters:**
| Param | Type | Default |
|-------|------|---------|
| `limit` | int | 20 |

**Response:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "context_type": "home | page",
      "context_id": "page-uuid | null",
      "messages": [
        { "role": "user", "content": "What is Docker?" },
        { "role": "assistant", "content": "Based on your notes..." }
      ],
      "title": "Docker questions",
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:35:00Z"
    }
  ]
}
```

### `GET /api/history/{chat_id}`

Get single conversation.

### `POST /api/history`

Save a conversation.

**Request Body:**
```json
{
  "context_type": "home",
  "context_id": null,
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "title": "Docker questions"
}
```

### `DELETE /api/history/{chat_id}`

Delete a conversation.

---

## Context

### `POST /api/context`

**Used by Chrome extension only.**

Checks if current browser page relates to any saved notes.

**Request Body:**
```json
{
  "url": "https://docs.docker.com/networking/",
  "text": "first 1000 chars of page body text..."
}
```

**Response:**
```json
{
  "related_notes": [
    {
      "id": "uuid",
      "title": "Docker Networking",
      "summary": "...",
      "similarity": 0.82,
      "page_id": "uuid",
      "page_name": "Docker"
    }
  ]
}
```

**Skips:**
- URLs containing excluded domains (google, mail, localhost, etc.)
- Pages with < 200 chars of text

---

## Curator

### `POST /api/curator/scan`

**⭐ FULL KNOWLEDGE BASE MAINTENANCE SCAN**

Analyzes all notes for issues. Auto-applies safe fixes.

**Response:**
```json
{
  "potential_duplicates": [
    {
      "note_a": "uuid",
      "note_b": "uuid",
      "similarity": 0.95,
      "suggestion": "merge",
      "reason": "'Docker Networking' and 'Docker Networks' are 95% similar"
    }
  ],
  "orphan_notes": [
    {
      "note_id": "uuid",
      "title": "Random Thought",
      "suggestion": "connect_orphan",
      "reason": "Note has no connections to other notes"
    }
  ],
  "stale_notes": [
    {
      "note_id": "uuid",
      "title": "Old Config",
      "days_old": 45
    }
  ],
  "cluster_issues": [
    {
      "cluster_id": "uuid",
      "issue": "too_large",
      "size": 18,
      "suggestion": "Split cluster 'DevOps' (18 notes)"
    }
  ],
  "missing_connections": [
    {
      "note_a": "uuid",
      "note_b": "uuid",
      "similarity": 0.85,
      "suggested_type": "related",
      "reason": "'Docker' and 'Kubernetes' are 85% similar but have no edge"
    }
  ],
  "auto_applied": 3,
  "needs_confirmation": [
    {
      "action_type": "merge_notes",
      "params": { "note_a": "uuid", "note_b": "uuid" },
      "reason": "Notes are 95% similar"
    }
  ]
}
```

**Frontend usage — CuratorReportBlock:**
```typescript
const report = await api.curatorScan();
// Render each section with action buttons
// "Auto-fixed 3 issues"
// "3 items need your attention" → show confirmation buttons
```

---

### `POST /api/curator/apply`

Apply a single curator action (from needs_confirmation).

**Request Body:**
```json
{
  "action_type": "merge_notes | delete_note | add_edge | connect_orphan",
  "params": {
    "note_a": "uuid",
    "note_b": "uuid"
  }
}
```

**Response varies by action type.**

---

## Data Models

### Note

```typescript
interface Note {
  id: string
  title: string | null
  raw_text: string
  summary: string | null
  tags: string[]
  tasks: string[]
  entities: string[]
  source_url: string | null
  page_title: string | null
  capture_type: "highlight" | "full_page" | "manual"
  processing_status: "pending" | "processing" | "done" | "failed"
  related_note_ids: string[]
  embedding: number[] | null        // 768D, not returned in list queries
  embedding_model: string

  // Canvas fields
  page_id: string | null
  canvas_x: number | null
  canvas_y: number | null
  canvas_width: number              // default 280
  canvas_height: number | null
  cluster_id: string | null
  centrality: number                // 0.0-1.0, betweenness centrality
  is_bridge: boolean                // connects different clusters

  created_at: string
  updated_at: string

  // Only in search results
  similarity?: number               // 0.0-1.0
}
```

**Visual cues mapping (for canvas nodes):**
```
centrality > 0.5       → thicker border (important note)
is_bridge === true      → 🔗 icon (bridge between clusters)
cluster_id === null     → ⚠️ icon (orphan, no cluster)
tasks.length > 0        → ✅ icon (has tasks)
processing_status       → color badge (done=green, failed=red, pending=yellow)
Date < 1 hour ago       → glow effect (recently added)
Date > 30 days ago      → reduced opacity (stale)
raw_text.length         → node size scaling
```

### Page

```typescript
interface Page {
  id: string
  name: string                      // unique
  description: string | null
  icon: string                      // emoji, default "📄"
  color: string                     // hex, default "#6366f1"
  is_archived: boolean
  canvas_data: Record<string, any>  // reserved for future use
  viewport: {
    x: number
    y: number
    zoom: number
  }
  note_count: number
  last_activity: string
  created_at: string
  updated_at: string
}
```

### Edge (NoteEdge)

```typescript
interface NoteEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: "related" | "depends_on" | "extends" | "contradicts" | "summarizes" | "example_of"
  strength: number                  // 0.0-1.0
  label: string | null              // human-readable description
  created_by: "system" | "processor" | "user" | "curator"
  created_at: string
}
```

### Cluster

```typescript
interface Cluster {
  id: string
  page_id: string
  label: string                     // "Container Networking"
  description: string | null
  color: string                     // hex
  center_x: number | null
  center_y: number | null
  created_at: string
  updated_at: string
}
```

### Canvas Element

```typescript
interface CanvasElement {
  id: string
  page_id: string
  element_type: "sticky" | "drawing" | "annotation" | "image"
  content: string | null
  canvas_data: Record<string, any> | null    // for drawings: SVG path data
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  style: Record<string, any>        // { color, font, opacity, etc. }
  created_by: "user" | "agent"
  created_at: string
  updated_at: string
}
```

---

## Mapping: Commands → API Calls

Reference for `CommandRouter.ts` implementation:

```
COMMAND              → API CALL                           → BLOCK TYPE
─────────────────────────────────────────────────────────────────────
/pages               → GET /api/pages                     → page-list
/page create [name]  → POST /api/pages                    → system message
/page delete [name]  → DELETE /api/pages/:id              → system message
/open [name]         → GET /api/pages (find by name)      → context switch to page
                       GET /api/pages/:id/canvas           → canvas overlay
/notes               → GET /api/notes                     → note-grid
/notes recent        → GET /api/notes?limit=10            → note-grid
/notes #tag          → GET /api/notes?tag=docker          → note-grid
/search [query]      → GET /api/search?q=query            → search-results
/tags                → GET /api/tags                       → tag-cloud
/tasks               → GET /api/notes (extract tasks)     → task-list
/stats               → GET /api/stats                     → stats
/capture [text]      → POST /api/capture                  → system message
/settings            → (local state)                      → settings
/history             → GET /api/history                   → history
/curator             → POST /api/curator/scan             → curator-report
/help                → (local data)                       → help
/clear               → (local: reset stream)              → welcome

PAGE CONTEXT:
/find [text]         → POST /api/search/canvas            → highlight on canvas
/add [text]          → POST /api/pages/:id/elements       → element on canvas
/add note [text]     → POST /api/capture + page_hint      → system message
/layout              → POST /api/pages/:id/layout         → canvas update
/summarize           → POST /api/chat (page context)      → assistant message
/gaps                → POST /api/chat (gap analysis)      → gap-analysis
/reading             → POST /api/chat (reading order)     → reading-path
/export              → GET /api/pages/:id/canvas → local  → download
/close               → context switch to home             → welcome

NATURAL LANGUAGE:
"anything without /"  → POST /api/chat                    → assistant message
```

---

## Polling Pattern for Processing Status

After capture, the note starts as `pending`. Frontend can poll:

```typescript
async function waitForProcessing(noteId: string, maxAttempts = 20): Promise<Note> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = await api.getNote(noteId);
    if (note.processing_status === "done" || note.processing_status === "failed") {
      return note;
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
  }
  throw new Error("Processing timeout");
}

// Usage after capture:
const { note_id } = await api.capture({ text: "..." });
const processed = await waitForProcessing(note_id);
// Now has title, summary, tags, page_id, canvas_x/y, etc.
```

---

## CORS Configuration

Allowed origins:
- `http://localhost:5173` (frontend dev)
- `http://localhost:3000` (frontend alt)
- `chrome-extension://*` (extension)

---

## Error Responses

All errors return:
```json
{
  "detail": "Human-readable error message"
}
```

Common status codes:
- `400` — Bad request (validation, duplicate, etc.)
- `404` — Resource not found
- `500` — Server error (check backend logs)

---

## Rate Limits / Performance Notes

| Operation | Expected Latency | Notes |
|-----------|-----------------|-------|
| Capture (save) | < 500ms | Background processing 5-15s |
| Search | 1-3s | Embedding generation + vector search |
| Chat | 3-8s | Embedding + search + LLM generation |
| Canvas load | < 1s | Single DB query (parallel fetches) |
| Layout compute | 5-30s | UMAP + HDBSCAN + LLM cluster naming |
| Curator scan | 10-30s | Full DB scan + similarity computation |
| Context check | 1-3s | Embedding + search (high threshold) |

For the frontend: show loading states for anything > 1s.
The command bar should show a subtle "thinking" animation during API calls.
```

---

These two files give you everything needed to build the frontend, extension, or any client against this backend. The API_DOCS.md specifically maps every command to its API call and expected block type, which is exactly the lookup table `CommandRouter.ts` needs.