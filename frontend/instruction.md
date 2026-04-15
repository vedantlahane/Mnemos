
# Mnemos Backend v2.0 — Complete Frontend Integration Reference

> **Purpose:** This document is a self-contained, exhaustive reference for the Mnemos backend. It describes every endpoint, every data shape, every streaming event, every side-effect, and every behavioral contract. It is designed so that any developer (or AI) can build or refactor a frontend against this backend without access to the source code.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication System](#2-authentication-system)
3. [Data Models & Database Schema](#3-data-models--database-schema)
4. [API Endpoints — Complete Reference](#4-api-endpoints)
5. [Canvas Chat — SSE Streaming Protocol](#5-canvas-chat--sse-streaming-protocol)
6. [Note Processing Pipeline](#6-note-processing-pipeline)
7. [Scene Format & Excalidraw Conventions](#7-scene-format--excalidraw-conventions)
8. [Visual Context System](#8-visual-context-system)
9. [Spatial Layout & Placement Logic](#9-spatial-layout--placement-logic)
10. [Caching Behavior](#10-caching-behavior)
11. [Error Handling & Conventions](#11-error-handling--conventions)
12. [Enums, Constants & Defaults](#12-enums-constants--defaults)
13. [CORS & Connectivity](#13-cors--connectivity)
14. [Missing/Placeholder Endpoints](#14-missingplaceholder-endpoints)
15. [Frontend Integration Checklist](#15-frontend-integration-checklist)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend                           │
│                    All routes under /api                        │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  14 Routers  │→│  13 Services  │→│  LLM Layer            │ │
│  │  (REST+SSE)  │  │              │  │  Primary: Gemini      │ │
│  └─────────────┘  └──────────────┘  │  Fallback: Groq/Llama │ │
│         │               │           └───────────────────────┘ │
│         ▼               ▼                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Auth (JWT)   │  │  LangGraph   │  │  Supabase             │ │
│  │ Optional     │  │  Agent       │  │  PostgreSQL + pgvector│ │
│  └─────────────┘  │  Pipeline    │  └───────────────────────┘ │
│                    └──────────────┘         │                   │
│                                    ┌───────┴────────┐          │
│                                    │ Redis (optional)│          │
│                                    └────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle | Detail |
|---|---|
| **Scene is authority** | Canvas layout lives in Excalidraw scene JSON (`page_scenes` table), not on note records. Notes never store x/y positions. |
| **Dual page modes** | Each page has `layout_mode: "canvas"` or `"notebook"`. Canvas uses Excalidraw; notebook uses a block-based document model with fractional ordering. |
| **Auth is optional** | Controlled by `auth_enabled` env var. When disabled, everything works anonymously. When enabled, all data is user-scoped. |
| **All routes under `/api`** | Exception: `GET /health` is at root. |
| **SSE for canvas chat** | The canvas chat endpoint streams `CanvasOp` JSON events via Server-Sent Events. |
| **LLM with fallback** | Primary model (configurable per user) with automatic fallback to secondary model. |
| **Background processing** | Note capture triggers a LangGraph pipeline (extract → embed → route → connect → place). |
| **Visual analysis on every save** | After every scene save, the backend analyzes the canvas and updates visual context + element registry. |

---

## 2. Authentication System

### 2.1 Auth Mode Detection

Call `GET /api/auth/me` on app startup. The response tells you whether auth is enabled.

**When auth is DISABLED:**
```json
{
  "auth_enabled": false,
  "user": { "id": "anonymous", "email": "anonymous@local", "name": "Anonymous" },
  "google_client_id": ""
}
```
- No `Authorization` header needed anywhere
- All data is shared (no user isolation)
- `POST /api/auth/google` returns dummy tokens

**When auth is ENABLED:**
```json
{
  "auth_enabled": true,
  "user": null,
  "google_client_id": "xxx.apps.googleusercontent.com"
}
```
- `user` is null if not logged in, populated if valid Bearer token is provided
- All data endpoints filter by `user_id`

### 2.2 Login Flow

1. Frontend obtains Google OAuth access token or ID token
2. `POST /api/auth/google` → `{ "token": "<google_token>" }`
3. Backend verifies with Google, upserts user in DB, returns:
```json
{
  "access_token": "jwt_string",
  "refresh_token": "jwt_string",
  "user": { "id": "uuid", "email": "...", "name": "...", "avatar_url": "..." }
}
```
4. Store both tokens. Include on all requests: `Authorization: Bearer <access_token>`
5. When access token expires (72h), call `POST /api/auth/refresh` → `{ "refresh_token": "..." }` → `{ "access_token": "new_jwt" }`

### 2.3 Token Details

| Token | Lifetime | Contains |
|---|---|---|
| Access token | 72 hours | `sub` (user_id), `email`, `exp`, `iat` |
| Refresh token | 30 days | `sub` (user_id), `type: "refresh"`, `exp` |

---

## 3. Data Models & Database Schema

### 3.1 Page

```typescript
interface Page {
  id: string                    // UUID, auto-generated
  user_id: string | null        // UUID, null if auth disabled
  name: string                  // unique per user
  description: string | null
  icon: string                  // emoji, default "📄"
  color: string                 // hex, default "#6366f1"
  layout_mode: "canvas" | "notebook"   // default "canvas"
  is_archived: boolean          // default false
  created_at: string            // ISO 8601
  updated_at: string            // ISO 8601
}
```

**Side effects on page creation:**
- A `page_scenes` row is created with empty scene: `{"elements":[],"appState":{"viewBackgroundColor":"#0e0e1a","theme":"dark"},"files":{}}`
- A `page_visual_context` row is created with defaults

### 3.2 Note

```typescript
interface Note {
  id: string                    // UUID
  user_id: string | null
  page_id: string | null        // which page this note lives on
  raw_text: string              // original captured text
  title: string | null          // extracted by AI
  summary: string | null        // extracted by AI
  tags: string[]                // extracted by AI, lowercase
  tasks: string[]               // extracted action items
  entities: string[]            // extracted people/places/concepts
  content_type: "note" | "code" | "url" | "thought" | "question" | "clip"
  source_url: string | null     // if captured from a URL
  source_title: string | null   // title of source page
  capture_type: string          // "manual", "extension", "canvas_chat", etc.
  processing_status: "pending" | "processing" | "done" | "failed"
  metadata: Record<string, any> // arbitrary JSON
  created_at: string
  updated_at: string
}
```

**Important:** Notes do NOT contain x/y position data. Canvas position is determined by the scene and element registry.

### 3.3 Edge (Note Relationship)

```typescript
interface Edge {
  id: string
  source_id: string             // Note UUID
  target_id: string             // Note UUID
  edge_type: "related" | "depends_on" | "extends" | "contradicts" | "summarizes" | "example_of"
  label: string | null          // human-readable description
  strength: number              // 0.0 - 1.0 (similarity or confidence)
  created_by: "processor" | "curator" | "user"
  created_at: string
}
```

**Constraints:** No self-edges. Unique on `(source_id, target_id)`.

### 3.4 Scene (Excalidraw)

```typescript
interface Scene {
  elements: ExcalidrawElement[]
  appState: {
    viewBackgroundColor: string  // hex, default "#0e0e1a"
    theme: "dark" | "light"
    [key: string]: any
  }
  files: Record<string, any>    // Excalidraw file attachments
}
```

Stored as JSONB in `page_scenes.scene_data`. See [Section 7](#7-scene-format--excalidraw-conventions) for element structure details.

### 3.5 Visual Context

```typescript
interface VisualContext {
  page_id: string
  background_color: string      // hex
  theme: "dark" | "light"
  dominant_colors: string[]     // up to 8 hex values
  layout_pattern: "freeform" | "grid" | "timeline" | "mindmap" | "flow" | "columns"
  reading_direction: "left-to-right" | "top-to-bottom" | "radial" | "mixed"
  density: "empty" | "sparse" | "moderate" | "dense"
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  element_count: number
}
```

**Auto-updated:** Recalculated on every scene save.

### 3.6 Region

```typescript
interface Region {
  id: string
  page_id: string
  label: string | null
  description: string | null
  color: string | null
  region_type: "cluster" | "section" | "timeline-segment" | "comparison-column" | "freeform"
  layout_hint: string           // "auto" etc.
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}
```

### 3.7 PageDocument (Notebook Mode)

```typescript
interface PageDocument {
  page_id: string
  user_id: string | null
  default_font: string          // default "Virgil"
  content_width: number         // default 840
  line_height: number           // default 1.5
  left_padding: number          // default 40
  right_padding: number         // default 40
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}
```

### 3.8 PageBlock (Notebook Block)

```typescript
interface PageBlock {
  id: string
  page_id: string
  block_type: string            // "paragraph", "heading", "list", "code", etc.
  text_content: string | null
  order_key: number             // float, fractional indexing
  depth: number                 // nesting level, default 0
  parent_block_id: string | null
  note_id: string | null        // link to source note
  attrs: Record<string, any>    // e.g. { level: 2 } for headings
  provenance: Record<string, any>  // who/what created this block
  version: number               // auto-incremented on content changes
  is_deleted: boolean           // soft delete
  created_by: string            // "user", "ai", etc.
  created_at: string
  updated_at: string
}
```

**Ordering:** Blocks use fractional indexing (`order_key`). New blocks are placed between neighbors using midpoint. Call rebalance when keys get too deep.

### 3.9 BlockReference

```typescript
interface BlockReference {
  id: string
  page_id: string
  block_id: string
  ref_type: string              // "note_citation", "page_link", etc.
  ref_id: string                // UUID of referenced entity
  start_offset: number
  end_offset: number | null
  label: string | null
  metadata: Record<string, any>
  created_at: string
}
```

### 3.10 InlineEmbed

```typescript
interface InlineEmbed {
  id: string
  page_id: string
  block_id: string
  embed_type: string
  target_page_id: string | null  // exactly ONE of these four must be set
  target_note_id: string | null
  target_block_id: string | null
  url: string | null
  inline_position: Record<string, any>
  display_mode: string          // "inline-card" etc.
  width: number | null
  height: number | null
  attrs: Record<string, any>
  created_by: string
  created_at: string
  updated_at: string
}
```

### 3.11 ChatHistory

```typescript
interface ChatHistory {
  id: string
  user_id: string | null
  context_type: "home" | string
  context_id: string | null     // page_id when context is page-specific
  messages: Array<{ role: "user" | "assistant"; content: string }>
  title: string | null
  created_at: string
  updated_at: string
}
```

### 3.12 UserSettings

```typescript
interface UserSettings {
  theme: "dark" | "light"
  model: string                 // primary LLM model name
  groq_model: string            // secondary/fallback model name
  similarity_threshold: number  // 0.0-1.0, default 0.65
  embedding_dimensions: number  // default 768
  auto_layout: boolean          // auto-place notes on canvas
  auto_connect: boolean         // auto-create edges between related notes
}
```

---

## 4. API Endpoints

**Base prefix:** All endpoints start with `/api` (exception: `GET /health`)

**Auth header:** `Authorization: Bearer <jwt>` — required when auth enabled, optional/ignored when disabled.

---

### 4.1 Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/google` | Login with Google OAuth token |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/auth/me` | Get auth state + current user |

#### `POST /api/auth/google`

**Request:**
```json
{ "token": "google_oauth_or_id_token" }
```

**Success (200):**
```json
{
  "access_token": "jwt",
  "refresh_token": "jwt",
  "user": { "id": "uuid", "email": "user@example.com", "name": "Name", "avatar_url": "https://..." }
}
```

**When auth disabled (200):**
```json
{
  "access_token": "auth-disabled",
  "refresh_token": "auth-disabled",
  "user": { "id": "anonymous", "email": "anonymous@local", "name": "Anonymous" }
}
```

**Error:** `401` — Invalid Google token

---

#### `POST /api/auth/refresh`

**Request:** `{ "refresh_token": "jwt" }`

**Success (200):** `{ "access_token": "new_jwt" }`

**Error:** `401` — Invalid/expired refresh token, or user not found

---

#### `GET /api/auth/me`

**Headers:** Optional `Authorization: Bearer <token>`

**Success (200):**
```json
{
  "auth_enabled": true | false,
  "user": { "id": "uuid", "email": "...", "name": "...", "avatar_url": "..." } | null,
  "google_client_id": "string" | ""
}
```

---

### 4.2 Pages

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pages` | List pages |
| `POST` | `/api/pages` | Create page |
| `GET` | `/api/pages/{page_id}` | Get page |
| `PUT` | `/api/pages/{page_id}` | Update page |
| `DELETE` | `/api/pages/{page_id}` | Delete page |

#### `GET /api/pages`

**Query:** `?include_archived=false` (boolean, default false)

**Response (200):**
```json
{
  "pages": [ /* Page objects, ordered by updated_at DESC */ ]
}
```

---

#### `POST /api/pages`

**Request:**
```json
{
  "name": "Machine Learning",            // REQUIRED, must be unique per user
  "description": "ML research notes",    // optional
  "icon": "🧠",                          // optional, default "📄"
  "color": "#6366f1",                    // optional, default "#6366f1"
  "layout_mode": "canvas"               // optional, "canvas"|"notebook", default "canvas"
}
```

**Success (200):** Created Page object

**Side effects:** Creates empty scene + visual context rows

**Error:** `400` — Name already exists

---

#### `GET /api/pages/{page_id}`

**Response (200):** Page object (cached via Redis, TTL 600s)

**Error:** `404`

---

#### `PUT /api/pages/{page_id}`

**Request:** All fields optional:
```json
{
  "name": "New Name",
  "description": "...",
  "icon": "📊",
  "color": "#ef4444",
  "is_archived": true,
  "layout_mode": "notebook"
}
```

**Success (200):** Updated Page object. Invalidates Redis cache.

**Errors:** `400` (no fields or name taken), `404`

---

#### `DELETE /api/pages/{page_id}`

Moves all notes to "Uncategorized" page, then deletes. Invalidates caches.

**Success (200):** `{ "status": "deleted" }`

**Errors:** `400` (cannot delete "Uncategorized"), `404`

---

### 4.3 Notes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notes` | List notes (paginated, filterable) |
| `GET` | `/api/notes/{note_id}` | Get single note |
| `PUT` | `/api/notes/{note_id}` | Update note |
| `DELETE` | `/api/notes/{note_id}` | Delete note |
| `POST` | `/api/notes/{note_id}/retry` | Retry failed processing |
| `POST` | `/api/notes/{note_id}/move` | Move to different page |
| `GET` | `/api/tags` | Get all tags with counts |

#### `GET /api/notes`

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number (1-indexed) |
| `limit` | int | 20 | Items per page |
| `tag` | string | null | Filter by single tag |
| `page_id` | string | null | Filter by page UUID |

**Response (200):**
```json
{
  "notes": [ /* Note objects, ordered by created_at DESC */ ],
  "total": 42
}
```

---

#### `GET /api/notes/{note_id}`

**Response (200):** Note object

**Error:** `404`

---

#### `PUT /api/notes/{note_id}`

**Request:** All optional:
```json
{
  "title": "Updated title",
  "summary": "Updated summary",
  "tags": ["ml", "pytorch"],
  "tasks": ["Read the paper"],
  "entities": ["PyTorch", "GPT-4"],
  "page_id": "new-page-uuid",
  "metadata": { "custom": "data" }
}
```

**Success (200):** Updated Note object

**Side effect:** If note has a `page_id`, the note card on the canvas scene is re-rendered with updated title/summary/tags.

**Errors:** `400` (no fields), `404`

---

#### `DELETE /api/notes/{note_id}`

**Success (200):** `{ "status": "deleted" }`

**Side effect:** Removes the note card from the canvas scene.

---

#### `POST /api/notes/{note_id}/retry`

Retries the full processing pipeline in background.

**Success (200):** `{ "status": "retrying" }`

**Error:** `400` — Note must have `processing_status` of `"failed"` or `"pending"`

---

#### `POST /api/notes/{note_id}/move`

**Request:** `{ "page_id": "target-page-uuid" }`

**Success (200):**
```json
{ "status": "moved", "from_page": "old-uuid", "to_page": "new-uuid" }
```

**Side effects:**
1. Removes note card from old page's scene
2. Updates note's `page_id`
3. Computes placement on new page using spatial planner
4. Creates note card on new page's scene

**Error:** `404` (note or target page not found)

---

#### `GET /api/tags`

**Response (200):**
```json
{
  "tags": [
    { "name": "machine-learning", "count": 15 },
    { "name": "python", "count": 8 }
  ]
}
```

Sorted by count descending.

---

### 4.4 Chat (Home)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | RAG-powered Q&A (non-streaming) |

#### `POST /api/chat`

**Request:**
```json
{
  "question": "What do I know about transformers?",
  "history": [
    { "role": "user", "content": "previous question" },
    { "role": "assistant", "content": "previous answer" }
  ],
  "context_type": "home",
  "page_id": null
}
```

**Response (200):**
```json
{
  "response": "Based on your notes...",
  "sources": [
    { "id": "uuid", "title": "Attention Is All You Need", "similarity": 0.87 }
  ]
}
```

**Behavior:**
1. Embeds the question using `RETRIEVAL_QUERY` task type
2. Vector searches across all user notes (top 8, threshold 0.55)
3. Builds context from note summaries
4. Sends to LLM with system prompt instructing note citation
5. Last 6 history messages are included

---

### 4.5 Canvas Chat (SSE Streaming)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/pages/{page_id}/chat` | Streaming canvas AI chat |

**This is the most complex endpoint. See [Section 5](#5-canvas-chat--sse-streaming-protocol) for full streaming protocol details.**

#### `POST /api/pages/{page_id}/chat`

**Request:**
```json
{
  "message": "write about neural networks",
  "viewport": {
    "x": 0, "y": 0,
    "width": 1920, "height": 1080,
    "zoom": 1.0
  },
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "selected_element_ids": [],
  "context_type": "page"
}
```

All fields except `message` are optional.

**Response:** `Content-Type: text/event-stream`

```
Cache-Control: no-cache
X-Accel-Buffering: no
```

Each SSE line: `data: <CanvasOp JSON>\n\n`

**Error:** `404` — Page not found

---

### 4.6 Document (Notebook Mode)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pages/{page_id}/document` | Get document + blocks |
| `PUT` | `/api/pages/{page_id}/document` | Update document settings |
| `GET` | `/api/pages/{page_id}/blocks` | List blocks |
| `POST` | `/api/pages/{page_id}/blocks` | Create block |
| `PUT` | `/api/pages/{page_id}/blocks/{block_id}` | Update block |
| `DELETE` | `/api/pages/{page_id}/blocks/{block_id}` | Soft-delete block |
| `POST` | `/api/pages/{page_id}/blocks/{block_id}/move` | Move block |
| `POST` | `/api/pages/{page_id}/blocks/rebalance` | Rebalance order keys |
| `GET` | `/api/pages/{page_id}/blocks/{block_id}/references` | List references |
| `POST` | `/api/pages/{page_id}/blocks/{block_id}/references` | Create reference |
| `DELETE` | `/api/pages/{page_id}/references/{ref_id}` | Delete reference |
| `GET` | `/api/pages/{page_id}/blocks/{block_id}/embeds` | List inline embeds |
| `POST` | `/api/pages/{page_id}/blocks/{block_id}/embeds` | Create inline embed |
| `DELETE` | `/api/pages/{page_id}/embeds/{embed_id}` | Delete inline embed |

#### `GET /api/pages/{page_id}/document`

**Response (200):**
```json
{
  "document": { /* PageDocument or null */ },
  "blocks": [ /* PageBlock objects, ordered by order_key */ ],
  "page": { /* Page object */ }
}
```

---

#### `PUT /api/pages/{page_id}/document`

**Request:** All optional:
```json
{
  "default_font": "Helvetica",
  "content_width": 720,
  "line_height": 1.6,
  "left_padding": 60,
  "right_padding": 60,
  "metadata": {}
}
```

**Response (200):** Updated PageDocument

---

#### `POST /api/pages/{page_id}/blocks`

**Request:**
```json
{
  "block_type": "paragraph",
  "text_content": "Hello world",
  "parent_block_id": null,
  "prev_block_id": "uuid-of-block-before",
  "next_block_id": "uuid-of-block-after",
  "order_key": null,
  "depth": 0,
  "attrs": {},
  "note_id": null,
  "provenance": { "source": "user-typed" },
  "metadata": {},
  "created_by": "user"
}
```

**Order key computation:** If `order_key` is null:
- If both `prev_block_id` and `next_block_id` provided → midpoint of their order_keys
- If only `prev_block_id` → prev's order_key + 1000
- If only `next_block_id` → next's order_key - 1000
- If neither → max existing order_key + 1000

**Response (200):** Created PageBlock

---

#### `PUT /api/pages/{page_id}/blocks/{block_id}`

**Request:** All optional. `version` auto-increments when content-affecting fields change (`text_content`, `attrs`, `metadata`, `provenance`, `block_type`).

**Response (200):** Updated PageBlock

---

#### `DELETE /api/pages/{page_id}/blocks/{block_id}`

Soft delete — sets `is_deleted = true`.

**Response (200):** `{ "status": "deleted" }`

---

#### `POST /api/pages/{page_id}/blocks/{block_id}/move`

**Request:**
```json
{
  "prev_block_id": "uuid",
  "next_block_id": "uuid",
  "order_key": null
}
```

---

#### `POST /api/pages/{page_id}/blocks/rebalance`

Reassigns all order_keys to clean multiples of 1000. Call when fractional keys get too deep.

**Response (200):** `{ "status": "rebalanced" }`

---

#### `POST /api/pages/{page_id}/blocks/{block_id}/references`

**Request:**
```json
{
  "ref_type": "note_citation",
  "ref_id": "note-uuid",
  "start_offset": 10,
  "end_offset": 45,
  "label": "See also",
  "metadata": {}
}
```

---

#### `POST /api/pages/{page_id}/blocks/{block_id}/embeds`

**Request:** Must point to exactly ONE target (validation error if 0 or 2+):
```json
{
  "embed_type": "page_link",
  "target_page_id": "uuid",
  "target_note_id": null,
  "target_block_id": null,
  "url": null,
  "inline_position": { "offset": 15 },
  "display_mode": "inline-card",
  "width": 300,
  "height": 200,
  "attrs": {},
  "created_by": "user"
}
```

**Error:** `422` — Must point to exactly one target

---

### 4.7 Graph

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/graph/edges` | All user's edges |
| `GET` | `/api/graph/edges/note/{note_id}` | Edges for a note |
| `GET` | `/api/graph/edges/page/{page_id}` | Edges for a page |
| `POST` | `/api/graph/edges` | Create edge |
| `DELETE` | `/api/graph/edges/{edge_id}` | Delete edge |
| `GET` | `/api/graph/full` | Full knowledge graph |

#### `POST /api/graph/edges`

**Request:**
```json
{
  "source_id": "note-uuid-1",
  "target_id": "note-uuid-2",
  "edge_type": "related",
  "label": "builds upon",
  "strength": 0.8,
  "created_by": "user"
}
```

**Errors:** `400` (self-edge), `409` (already exists)

---

#### `GET /api/graph/full`

**Response (200):**
```json
{
  "nodes": [
    { "id": "uuid", "title": "Title", "tags": ["tag"], "page_id": "uuid", "content_type": "note" }
  ],
  "edges": [ /* Edge objects */ ]
}
```

Returns up to 500 notes.

---

### 4.8 Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/search` | Semantic vector search |
| `GET` | `/api/search/tags` | Search by tags |

#### `GET /api/search`

**Query params:**

| Param | Type | Default | Required | Description |
|---|---|---|---|---|
| `q` | string | — | **yes** | Search query |
| `page_id` | string | null | no | Scope to page |
| `limit` | int | 10 | no | Max results |
| `threshold` | float | 0.55 | no | Min similarity |

**Response (200):**
```json
{
  "results": [
    {
      "id": "uuid", "title": "...", "summary": "...", "raw_text": "...",
      "tags": [], "similarity": 0.82, "page_id": "uuid",
      "user_id": "uuid", "content_type": "note", "source_url": null,
      "processing_status": "done", "metadata": {},
      "created_at": "...", "updated_at": "..."
    }
  ],
  "count": 5,
  "query": "neural networks"
}
```

**Error:** `400` (empty query), `500` (embedding generation failed)

---

#### `GET /api/search/tags`

**Query:** `?tags=machine-learning,python` (comma-separated)

**Response (200):**
```json
{ "results": [ /* Note objects */ ], "count": 3, "tags": ["machine-learning", "python"] }
```

**Error:** `400` (no tags)

---

### 4.9 Workspace

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workspace/overview` | Dashboard data (cached 5min) |
| `GET` | `/api/workspace/stats` | System statistics |

#### `GET /api/workspace/overview`

**Response (200):**
```json
{
  "pages": [
    {
      "id": "uuid", "name": "ML", "icon": "🧠", "color": "#6366f1",
      "note_count": 15, "layout_mode": "canvas",
      "is_archived": false, "updated_at": "..."
    }
  ],
  "total_notes": 42,
  "total_pages": 5,
  "top_tags": [ { "name": "python", "count": 12 } ]
}
```

Returns up to 20 pages and 20 tags. Cached for 300 seconds.

---

#### `GET /api/workspace/stats`

**Response (200):**
```json
{
  "notes": 42,
  "pages": 5,
  "edges": 23,
  "stuck_notes": 0,
  "cache": { "enabled": true, "hits": 150, "misses": 23 }
}
```

---

### 4.10 AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/curator/scan` | Run AI curator scan |
| `POST` | `/api/ai/curator/apply` | Apply curator action |
| `POST` | `/api/ai/analyze/page/{page_id}` | Full page analysis |
| `POST` | `/api/ai/retry-stuck` | Retry stuck notes |

#### `POST /api/ai/curator/scan`

No request body. Scans all user's notes.

**Response (200):**
```json
{
  "potential_duplicates": [
    {
      "note_a": "uuid", "note_b": "uuid",
      "similarity": 0.95, "suggestion": "merge",
      "reason": "'Title A' and 'Title B' are 95% similar"
    }
  ],
  "orphan_notes": [
    { "note_id": "uuid", "title": "...", "suggestion": "connect_orphan", "reason": "No connections" }
  ],
  "stale_notes": [
    { "note_id": "uuid", "title": "...", "days_old": 45 }
  ],
  "region_issues": [
    { "region_id": "uuid", "issue": "too_large" | "empty", "size": 20, "suggestion": "..." }
  ],
  "missing_connections": [
    { "note_a": "uuid", "note_b": "uuid", "similarity": 0.85, "suggested_type": "related", "reason": "..." }
  ],
  "auto_applied": 3,
  "needs_confirmation": [
    { "action_type": "merge_notes" | "delete_note", "params": { ... }, "reason": "..." }
  ]
}
```

**Side effect:** Auto-creates up to 5 missing edge connections.

---

#### `POST /api/ai/curator/apply`

**Request:**
```json
{
  "action_type": "merge_notes",
  "params": { "note_a": "uuid", "note_b": "uuid" }
}
```

Supported actions:

| action_type | params | Effect |
|---|---|---|
| `merge_notes` | `{ note_a, note_b }` | Merges B into A (combines text, tags, tasks, entities, edges). Deletes B. |
| `delete_note` | `{ note_id }` | Deletes note and removes from scene. |
| `connect_orphan` | `{ note_id }` | Finds related notes via embeddings, creates up to 3 edges. |

---

#### `POST /api/ai/analyze/page/{page_id}`

**Response (200):**
```json
{
  "visual_context": { /* VisualContext object */ },
  "note_count": 12,
  "edge_count": 8,
  "region_count": 3,
  "analysis": {
    "layout_pattern": "grid",
    "density": "moderate",
    "reading_direction": "left-to-right",
    "theme": "dark",
    "colors": ["#6366f1", "#374151"]
  }
}
```

**Side effects:** Triggers full visual analysis + element registry sync.

---

#### `POST /api/ai/retry-stuck`

Retries notes stuck in `pending`/`processing` for >5 minutes. Max 10.

**Response (200):** `{ "retrying": 3 }`

---

### 4.11 Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Get user settings |
| `PUT` | `/api/settings` | Update settings |

#### `GET /api/settings`

**Response (200):**
```json
{
  "theme": "dark",
  "model": "gemini-2.5-flash",
  "groq_model": "llama-3.3-70b-versatile",
  "similarity_threshold": 0.65,
  "embedding_dimensions": 768,
  "auto_layout": true,
  "auto_connect": true
}
```

Returns defaults if no saved settings.

---

#### `PUT /api/settings`

**Request:** Only whitelisted keys accepted:
```json
{
  "theme": "light",
  "model": "gemini-2.5-flash",
  "groq_model": "llama-3.3-70b-versatile",
  "similarity_threshold": 0.7,
  "embedding_dimensions": 768,
  "auto_layout": false,
  "auto_connect": true
}
```

**Allowed keys:** `theme`, `model`, `groq_model`, `similarity_threshold`, `embedding_dimensions`, `auto_layout`, `auto_connect`

**Response (200):** `{ "status": "saved" }`

---

### 4.12 Health

#### `GET /health`

**⚠️ NOT prefixed with `/api`**

**Response (200):**
```json
{ "status": "healthy", "version": "2.0.0", "cache": { "enabled": true, "hits": 150, "misses": 23 } }
```

---

## 5. Canvas Chat — SSE Streaming Protocol

### 5.1 Connection

```javascript
// Frontend example
const response = await fetch(`/api/pages/${pageId}/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,  // if auth enabled
  },
  body: JSON.stringify({
    message: "write about neural networks",
    viewport: { x: 0, y: 0, width: 1920, height: 1080, zoom: 1.0 },
    history: [],
    selected_element_ids: [],
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const op = JSON.parse(line.slice(6));
      handleCanvasOp(op);
    }
  }
}
```

### 5.2 CanvasOp Shape

```typescript
interface CanvasOp {
  op: OpType
  element_id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  color?: string
  theme?: string
  zoom?: number
  style?: string
  note?: Note                    // full Note object
  note_id?: string
  elements?: object[]
  connections?: object[]
  operations?: CanvasOp[]
  topology?: DiagramTopology
  message?: string               // human-readable text
  metadata?: Record<string, any>
  timestamp: number              // unix milliseconds
}
```

### 5.3 OpType Values

```typescript
type OpType =
  | "create_note"        // Note card placed on canvas
  | "create_text"        // Text element placed
  | "create_diagram"     // Diagram generated
  | "create_sticky"      // Sticky note
  | "update_element"     // Element modified
  | "move_element"       // Element repositioned
  | "delete_element"     // Element removed
  | "group_elements"     // Elements grouped
  | "create_edge_line"   // Edge visualization
  | "set_background"     // Background color changed
  | "set_theme"          // Theme toggled
  | "pan_to"             // Pan camera
  | "zoom_to"            // Zoom camera
  | "stream_start"       // Begin text streaming
  | "stream_chunk"       // Incremental text chunk
  | "stream_end"         // Streaming complete
  | "arrange_cluster"    // Layout reorganization done
  | "batch"              // Multiple operations
  | "info"               // Informational message / chat answer
  | "error"              // Error occurred
  | "done"               // Stream finished (ALWAYS last event)
```

### 5.4 Intent Classification

User messages are classified before handling:

| Intent | Example triggers | Action |
|---|---|---|
| `compose` | "write about X", "explain X", "add note about X", "summarize X" | Stream-generate text onto canvas |
| `command` | "set background blue", "dark mode", "light theme" | Change canvas settings |
| `diagram` | "draw a diagram of X", "create flowchart about X", "visualize X" | Generate structured diagram |
| `capture` | "capture X", "remember X", "note down X" | Create note, full processing pipeline |
| `arrange` | "organize", "layout", "tidy up", "sort" | Reorganize entire canvas |
| `search` | "find X", "search for X", "show me notes about X" | Semantic search |
| `navigate` | "go to page X", "open X" | Navigate to another page |
| `query` | *(anything else)* | RAG Q&A over notes |

**Slash commands:** `/compose X`, `/diagram X`, `/search X`, `/capture X`, `/bg blue`, `/dark`, `/light`, `/organize`, `/find X`, `/go PageName`

**Special prefix:** `exact: some text` places the literal text as-is without AI expansion.

### 5.5 Complete Stream Patterns by Intent

#### COMPOSE (text generation)

```
data: {"op":"info","message":"Intent: compose, Topic: neural networks","metadata":{"intent":"compose","topic":"neural networks"},"timestamp":...}

data: {"op":"stream_start","element_id":"compose-1234567890","x":100,"y":200,"message":"Writing about: neural networks","timestamp":...}

data: {"op":"stream_chunk","element_id":"compose-1234567890","text":"Neural networks ","timestamp":...}

data: {"op":"stream_chunk","element_id":"compose-1234567890","text":"are computational models ","timestamp":...}

data: {"op":"stream_chunk","element_id":"compose-1234567890","text":"inspired by biological...","timestamp":...}

... (many chunks, ~20ms delay between each)

data: {"op":"stream_end","element_id":"compose-1234567890","x":100,"y":200,"width":500,"height":320,"text":"Neural networks are computational models...","message":"Composition complete","timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:**
1. On `stream_start`: Create a placeholder text element at `(x, y)` with the given `element_id`
2. On `stream_chunk`: Append `text` to the element
3. On `stream_end`: Finalize with exact `width`, `height`, and full `text`. The backend has already saved this to the scene.

#### COMPOSE (literal text — via `exact:` prefix)

```
data: {"op":"info","message":"Intent: compose, Topic: ...","timestamp":...}

data: {"op":"create_text","element_id":"compose-1234567890","x":100,"y":200,"width":350,"height":42,"text":"exact text as typed","message":"Text placed","timestamp":...}

data: {"op":"done","timestamp":...}
```

#### DIAGRAM

```
data: {"op":"info","message":"Intent: diagram, Topic: REST API architecture","timestamp":...}

data: {"op":"info","message":"Generating diagram: REST API architecture","timestamp":...}

data: {"op":"create_diagram","x":100,"y":200,"topology":{"layout_type":"flow","elements":[{"id":"node1","label":"Client","type":"box","style":"accent","width":200,"height":60},{"id":"node2","label":"API Gateway","type":"box","style":"default","width":200,"height":60}],"connections":[{"from":"node1","to":"node2","label":"HTTP","style":"solid"}]},"message":"Diagram created","timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** The backend has already saved the diagram elements to the scene. The `topology` field describes what was generated. The frontend should reload the scene to see the new elements, or apply them optimistically.

**Topology shape:**
```typescript
interface DiagramTopology {
  layout_type: "flow" | "mindmap" | "list" | "comparison" | "timeline"
  elements: Array<{
    id: string
    label: string
    type: "box" | "text"
    style: "default" | "accent" | "muted" | "warning" | "success"
    width: number
    height: number
  }>
  connections: Array<{
    from: string
    to: string
    label?: string
    style: "solid" | "dashed" | "dotted"
  }>
}
```

#### CAPTURE (note creation)

```
data: {"op":"info","message":"Intent: compose, Topic: ...","timestamp":...}

data: {"op":"info","note_id":"uuid","message":"Captured note, processing...","timestamp":...}

... (processing happens synchronously for canvas chat)

data: {"op":"create_note","note_id":"uuid","note":{"id":"uuid","title":"Extracted Title","summary":"...","tags":["tag1"],"raw_text":"...","processing_status":"done",...},"message":"Note placed: Extracted Title","timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** On `create_note`, the backend has already placed the note card on the scene. Reload scene or apply the note card optimistically.

#### ARRANGE (reorganize canvas)

```
data: {"op":"info","message":"Reorganizing canvas...","timestamp":...}

data: {"op":"arrange_cluster","message":"Arranged 12 notes, resolved 3 overlaps","metadata":{"positions":12,"overlaps":3},"timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** Reload the scene — all elements have been repositioned.

#### COMMAND (set background / theme)

```
data: {"op":"info","message":"Intent: command, Topic: blue","timestamp":...}

data: {"op":"set_background","color":"#3b82f6","message":"Background set to #3b82f6","timestamp":...}

data: {"op":"done","timestamp":...}
```

Or for theme:
```
data: {"op":"set_theme","theme":"dark","message":"Switched to dark mode","timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** Apply the background color / theme to Excalidraw's appState.

#### SEARCH

```
data: {"op":"info","message":"Intent: search, Topic: neural networks","timestamp":...}

data: {"op":"info","message":"Found 3 notes:\n• Attention Paper (87%)\n• BERT Overview (72%)\n• CNN Basics (65%)","metadata":{"results":[{"id":"uuid","title":"Attention Paper"},{"id":"uuid","title":"BERT Overview"}]},"timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** Display the results message. Use `metadata.results` array for clickable links.

#### NAVIGATE

```
data: {"op":"info","message":"Navigate to: Machine Learning","metadata":{"navigate_to_page":"page-uuid","page_name":"Machine Learning"},"timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** If `metadata.navigate_to_page` is present, navigate to that page.

#### QUERY (RAG Q&A — default)

```
data: {"op":"info","message":"Intent: query, Topic: ...","timestamp":...}

data: {"op":"info","message":"Based on your notes, transformers use self-attention mechanisms as described in your note [Attention Is All You Need]...","metadata":{"type":"chat_response","sources":[{"id":"uuid","title":"Attention Is All You Need"}]},"timestamp":...}

data: {"op":"done","timestamp":...}
```

**Frontend handling:** Display the message as a chat response. Use `metadata.sources` for citations. `metadata.type === "chat_response"` distinguishes this from other info messages.

#### ERROR

```
data: {"op":"error","message":"Embedding generation failed: API quota exceeded","timestamp":...}

data: {"op":"done","timestamp":...}
```

### 5.6 Stream Always Ends with DONE

Every stream — successful or not — ends with a `"done"` op. The frontend should use this as the stream completion signal.

---

## 6. Note Processing Pipeline

When a note is captured (via canvas chat `/capture`, or any future capture endpoint), it goes through a LangGraph pipeline:

```
Extract → Save Extraction → Embed → Find Related → Route → Connect Edges → Place on Scene → Finalize
```

### Pipeline Steps

| Step | What happens | Can fail gracefully |
|---|---|---|
| **Extract** | LLM extracts title, summary, tags, tasks, entities, content_type from raw_text | Yes — falls back to raw text truncation |
| **Save Extraction** | Writes extracted fields to the note record | No |
| **Embed** | Generates 768-dim embedding via Gemini `text-embedding-004` | Yes — skips related finding |
| **Find Related** | Vector search for similar notes (top 5, threshold 0.7) | Yes — proceeds without related |
| **Route** | LLM decides which page the note belongs to, or creates new page | Yes — falls back to "Uncategorized" |
| **Connect Edges** | LLM classifies relationship between this note and top 3 related notes, creates edges | Yes — creates generic "related" edges on failure |
| **Place on Scene** | Spatial planner finds position, scene manager creates note card elements | Yes — note exists but might not be on canvas |
| **Finalize** | Sets `processing_status = "done"` | No |

### Processing Status Lifecycle

```
pending → processing → done
                    → failed (on unrecoverable error)
```

The frontend should poll or check `processing_status` on notes. For canvas chat, processing happens synchronously (the stream waits). For background processing (via `/retry`), the note transitions through statuses.

---

## 7. Scene Format & Excalidraw Conventions

### 7.1 Note Card Structure

Each note on the canvas is represented by **multiple grouped Excalidraw elements**:

| Element ID Pattern | Type | customData.type | Content |
|---|---|---|---|
| `note-frame-{noteId}` | `rectangle` | `"note-frame"` | Card background/border |
| `note-title-{noteId}` | `text` | `"note-title"` | Note title |
| `note-summary-{noteId}` | `text` | `"note-summary"` | Note summary (wrapped, max 6 lines) |
| `note-accent-{noteId}` | `line` | `"note-accent"` | Left accent bar |
| `note-tags-{noteId}` | `text` | `"note-tags"` | Tags as `#tag1  #tag2` |

All elements in a note card share a `groupIds` array containing `"note-group-{noteId}"`.

All elements have `customData.noteId` set to the note's UUID.

### 7.2 Card Dimensions

| Property | Value |
|---|---|
| Card width | 360px |
| Card height | 240px |
| Title font | 18px, family 1 (Virgil) |
| Summary font | 13px, family 1, max 336px wide, max 6 lines |
| Tags font | 11px, family 3 (Cascadia) |
| Accent bar | 3px stroke, left edge |

### 7.3 Theme-Aware Colors

**Dark theme (background luminance < 0.4):**

| Element | Color |
|---|---|
| Card background | `#1e1e2e` |
| Card border | `#374151` |
| Title text | `#f3f4f6` |
| Summary text | `#9ca3af` |
| Accent bar | `#818cf8` |
| Tag text | `#818cf8` |

**Light theme:**

| Element | Color |
|---|---|
| Card background | `#ffffff` |
| Card border | `#e5e7eb` |
| Title text | `#111827` |
| Summary text | `#6b7280` |
| Accent bar | `#6366f1` |
| Tag text | `#6366f1` |

### 7.4 Diagram Elements

Diagrams use `customData.type` values:
- `"diagram-node"` — rectangle box
- `"diagram-label"` — text inside box
- `"diagram-arrow"` — connecting arrow

Style colors by diagram style + theme:

**Dark:**
| Style | Background | Border | Text |
|---|---|---|---|
| default | `#1e1e2e` | `#374151` | `#e5e7eb` |
| accent | `#312e81` | `#6366f1` | `#c7d2fe` |
| muted | `#1f2937` | `#4b5563` | `#9ca3af` |
| warning | `#431407` | `#ea580c` | `#fed7aa` |
| success | `#052e16` | `#16a34a` | `#bbf7d0` |

**Light:**
| Style | Background | Border | Text |
|---|---|---|---|
| default | `#ffffff` | `#e5e7eb` | `#1f2937` |
| accent | `#eef2ff` | `#6366f1` | `#312e81` |
| muted | `#f9fafb` | `#d1d5db` | `#6b7280` |
| warning | `#fff7ed` | `#ea580c` | `#7c2d12` |
| success | `#f0fdf4` | `#16a34a` | `#14532d` |

### 7.5 Other Element Types

| customData.type | Description |
|---|---|
| `"composed-text"` | AI-generated text block |
| `"sticky-bg"` | Sticky note background |
| `"sticky-text"` | Sticky note text |

### 7.6 Theme Detection

Theme is determined by background color luminance:
- Luminance < 0.4 → `"dark"`
- Luminance ≥ 0.4 → `"light"`

Default background: `#0e0e1a` (dark)

---

## 8. Visual Context System

Visual context is automatically computed on every scene save and persisted to `page_visual_context`.

### 8.1 Layout Pattern Detection

| Pattern | Detection criteria |
|---|---|
| `grid` | ≥2 aligned columns AND ≥2 aligned rows (tolerance 50px) |
| `columns` | ≥2 aligned columns but ≤2 row clusters |
| `timeline` | Horizontal spread > 3× vertical spread |
| `flow` | Vertical spread > 3× horizontal spread |
| `mindmap` | Central element with min distance < 15% of max distance |
| `freeform` | Default / < 3 content elements |

### 8.2 Density Calculation

Based on elements per million pixels:
- `empty`: 0 elements
- `sparse`: < 2 per Mpx
- `moderate`: 2-8 per Mpx
- `dense`: > 8 per Mpx

### 8.3 Element Registry

On every scene save, the backend syncs all non-deleted Excalidraw elements to `canvas_element_registry`, recording:
- Position (x, y, width, height)
- Element type and content source
- Associated note_id (for note cards)
- Style snapshot

This registry is used by the spatial planner to avoid overlaps.

---

## 9. Spatial Layout & Placement Logic

When placing new elements on the canvas, the spatial planner uses this priority:

### Strategy Selection (auto mode)

1. **pattern_aware** — If visual context shows a non-freeform layout, continue the pattern
2. **region** — If a topic is specified, find the most semantically similar region
3. **related** — If the note has an embedding, place near the most similar existing note
4. **viewport** — Place in the visible area
5. **sequential** — Append below all existing content

### Placement Details

| Strategy | Behavior |
|---|---|
| Pattern (grid) | Continue current row; start new row if row full |
| Pattern (timeline) | Add to right end, at average y |
| Pattern (flow) | Add below, at average x |
| Region | Place at edge of region's bounding box (right → below → left → above) |
| Related | Place one `card_spacing_x` (420px) to the right of most similar note |
| Viewport | Try center, then sweep 10 positions. Overflow to right of viewport if full. |
| Sequential | Place at x=100, below the lowest existing element |

### Overlap Resolution

After placement, the backend runs up to 50 iterations of force-directed overlap resolution, pushing overlapping elements apart until minimum gap (80px) is achieved.

### Layout Constants

| Constant | Value |
|---|---|
| `default_card_width` | 360 |
| `default_card_height` | 240 |
| `card_spacing_x` | 420 |
| `card_spacing_y` | 350 |
| `min_element_gap` | 80 |
| `cluster_padding` | 60 |

---

## 10. Caching Behavior

Redis is optional. When unavailable, everything works without caching.

| Cache key | TTL | Invalidated by |
|---|---|---|
| `mnemos:page:{id}` | 600s | Page update, page delete |
| `mnemos:scene:{id}` | 120s | Any scene save |
| `mnemos:overview:global` | 300s | Page delete |

---

## 11. Error Handling & Conventions

### HTTP Status Codes Used

| Code | Meaning |
|---|---|
| `200` | Success (all successful responses) |
| `400` | Bad request (missing fields, invalid state, duplicate name) |
| `401` | Authentication failure |
| `404` | Resource not found |
| `409` | Conflict (duplicate edge) |
| `422` | Validation error (Pydantic) |
| `500` | Server error |

### Error Response Format

FastAPI default:
```json
{ "detail": "Human-readable error message" }
```

Pydantic validation errors (422):
```json
{
  "detail": [
    { "loc": ["body", "field_name"], "msg": "error description", "type": "error_type" }
  ]
}
```

### SSE Error Pattern

Errors during canvas chat streaming:
```
data: {"op":"error","message":"Description of what went wrong","timestamp":...}
data: {"op":"done","timestamp":...}
```

---

## 12. Enums, Constants & Defaults

### Content Types (notes)
`"note"` | `"code"` | `"url"` | `"thought"` | `"question"` | `"clip"`

### Edge Types
`"related"` | `"depends_on"` | `"extends"` | `"contradicts"` | `"summarizes"` | `"example_of"`

### Processing Statuses
`"pending"` | `"processing"` | `"done"` | `"failed"`

### Layout Modes (pages)
`"canvas"` | `"notebook"`

### Layout Patterns (visual context)
`"freeform"` | `"grid"` | `"timeline"` | `"mindmap"` | `"flow"` | `"columns"`

### Reading Directions
`"left-to-right"` | `"top-to-bottom"` | `"radial"` | `"mixed"`

### Density Levels
`"empty"` | `"sparse"` | `"moderate"` | `"dense"`

### Region Types
`"cluster"` | `"section"` | `"timeline-segment"` | `"comparison-column"` | `"freeform"`

### Element Types (registry)
`"note-card"` | `"composed-text"` | `"diagram-node"` | `"diagram-arrow"` | `"sticky"` | `"freehand"` | `"image"` | `"group"`

### Content Sources (registry)
`"note"` | `"ai-compose"` | `"ai-diagram"` | `"user-draw"` | `"clip"`

### Canvas Op Types
See [Section 5.3](#53-optype-values)

### Default Colors

| Purpose | Value |
|---|---|
| Default background | `#0e0e1a` |
| Default page color | `#6366f1` |
| Dark accent | `#818cf8` |
| Light accent | `#6366f1` |

### Embedding Config

| Setting | Default |
|---|---|
| Model | `text-embedding-004` |
| Dimensions | 768 |
### LLM Config

| Setting | Default |
|---|---|
| Primary model | `gemini-2.5-flash` |
| Secondary model | `llama-3.3-70b-versatile` |
| Stream chunk delay | 20ms |

### Curator Thresholds

| Setting | Default |
|---|---|
| Duplicate threshold | 0.92 (cosine similarity) |
| Missing edge threshold | 0.80 |
| Stale note days | 30 |
| Max notes to compare | 200 |

### Text Layout Fonts (Excalidraw)

| Font Family ID | Name | Avg char width at 16px |
|---|---|---|
| 1 | Virgil (handwritten) | 8.4px |
| 2 | Helvetica | 7.8px |
| 3 | Cascadia (monospace) | 9.6px |
| 4 | Excalifont | 8.0px |

---

## 13. CORS & Connectivity

### Allowed Origins (default)

```
http://localhost:5173
http://localhost:3000
chrome-extension://*
```

### CORS Config

```
allow_credentials: true
allow_methods: ["*"]
allow_headers: ["*"]
```

### Default Backend Port

`8000` (configurable via `BACKEND_PORT` env var)

### Running the Server

```bash
# From backend directory
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or via the entry point:
```bash
python main.py  # imports app from app.main
```

### Required Environment Variables

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-key
GEMINI_API_KEY=your-gemini-api-key

# Optional
GROQ_API_KEY=your-groq-key
AUTH_ENABLED=false
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
JWT_SECRET=your-secret
REDIS_URL=redis://localhost:6379
```

---

## 14. Missing/Placeholder Endpoints

The following route files exist but are **empty placeholders** (no endpoints defined):

| File | Expected purpose | What to do |
|---|---|---|
| `routes/pages_scene.py` | Scene CRUD REST endpoints | Frontend needs to call scene_manager directly or these need to be implemented |
| `routes/pages_canvas.py` | Canvas-specific operations | Viewport save/load, element registry queries |
| `routes/capture.py` | Note capture endpoint | Currently capture happens via canvas chat `CAPTURE` intent |

### Endpoints the Frontend Likely Needs (Not Yet Implemented)

Based on the backend's internal capabilities (scene_manager, viewport storage, etc.), these REST endpoints should exist but don't have routes yet:

```
GET  /api/pages/{page_id}/scene              → Scene JSON
PUT  /api/pages/{page_id}/scene              → Save scene
GET  /api/pages/{page_id}/scene/version      → Scene version number

GET  /api/pages/{page_id}/visual-context     → VisualContext
GET  /api/pages/{page_id}/stats              → Page-level stats

GET  /api/pages/{page_id}/viewport           → User's saved viewport
PUT  /api/pages/{page_id}/viewport           → Save viewport { scroll_x, scroll_y, zoom }

GET  /api/pages/{page_id}/regions            → List regions
POST /api/pages/{page_id}/regions            → Create region
PUT  /api/pages/{page_id}/regions/{id}       → Update region
DELETE /api/pages/{page_id}/regions/{id}     → Delete region

GET  /api/pages/{page_id}/elements           → Element registry for page

POST /api/capture                            → Capture note (independent of canvas chat)

GET  /api/pages/{page_id}/revisions          → Page revision history
POST /api/pages/{page_id}/revisions          → Create revision snapshot

GET  /api/chat/history                       → Chat history list
POST /api/chat/save                          → Save chat conversation
DELETE /api/chat/{chat_id}                   → Delete chat
```

**The backend has full DB methods and service layer for all of these** — only the route wiring is missing. The frontend should be built expecting these endpoints and they can be trivially added as needed.

### DB Methods Available but Unrouted

| DB method | What it does | Suggested route |
|---|---|---|
| `db.get_scene(page_id)` | Returns scene JSON | `GET /api/pages/{pid}/scene` |
| `db.save_scene(page_id, data)` | Saves scene | `PUT /api/pages/{pid}/scene` |
| `db.get_scene_version(page_id)` | Returns version int | `GET /api/pages/{pid}/scene/version` |
| `db.get_viewport(user_id, page_id)` | Returns `{scroll_x, scroll_y, zoom}` | `GET /api/pages/{pid}/viewport` |
| `db.save_viewport(...)` | Saves viewport | `PUT /api/pages/{pid}/viewport` |
| `db.get_visual_context(page_id)` | Returns visual context | `GET /api/pages/{pid}/visual-context` |
| `db.list_regions(page_id)` | Returns regions | `GET /api/pages/{pid}/regions` |
| `db.insert_region(...)` | Creates region | `POST /api/pages/{pid}/regions` |
| `db.update_region(...)` | Updates region | `PUT /api/pages/{pid}/regions/{id}` |
| `db.delete_region(...)` | Deletes region | `DELETE /api/pages/{pid}/regions/{id}` |
| `db.get_element_registry(page_id)` | Returns registry entries | `GET /api/pages/{pid}/elements` |
| `db.get_page_stats(page_id)` | Returns note/edge/region/element counts | `GET /api/pages/{pid}/stats` |
| `db.insert_note(...)` | Creates note | `POST /api/capture` |
| `db.list_page_revisions(page_id)` | Returns revision history | `GET /api/pages/{pid}/revisions` |
| `db.insert_page_revision(...)` | Creates revision | `POST /api/pages/{pid}/revisions` |
| `db.list_chats(...)` | List chat sessions | `GET /api/chat/history` |
| `db.get_chat(chat_id)` | Get specific chat | `GET /api/chat/{id}` |
| `db.insert_chat(...)` | Save chat | `POST /api/chat/save` |
| `db.delete_chat(chat_id)` | Delete chat | `DELETE /api/chat/{id}` |
| `scene_manager.sync_all_notes(page_id)` | Re-render all note cards | `POST /api/pages/{pid}/scene/sync` |
| `scene_manager.add_sticky(...)` | Add sticky note | `POST /api/pages/{pid}/sticky` |

---

## 15. Frontend Integration Checklist

### Startup Flow

```
1. GET /health                         → Verify backend is running
2. GET /api/auth/me                    → Determine auth mode
3. If auth_enabled && no token:
     → Show login with Google (use google_client_id)
     → POST /api/auth/google
     → Store tokens
4. GET /api/workspace/overview         → Load dashboard data
5. GET /api/settings                   → Load user preferences
```

### Page View Flow (Canvas Mode)

```
1. GET /api/pages/{page_id}            → Page metadata
2. GET /api/pages/{page_id}/scene      → Load Excalidraw scene ⚠️ NEEDS ROUTE
3. GET /api/pages/{page_id}/viewport   → Restore camera ⚠️ NEEDS ROUTE
4. Render Excalidraw with scene data
5. On scene change from user:
     → PUT /api/pages/{page_id}/scene  → Save ⚠️ NEEDS ROUTE
     → PUT /api/pages/{page_id}/viewport → Save camera ⚠️ NEEDS ROUTE
6. Chat input:
     → POST /api/pages/{page_id}/chat  → SSE stream
     → Process CanvasOp events
     → On operations that modify scene: reload scene or apply optimistically
```

### Page View Flow (Notebook Mode)

```
1. GET /api/pages/{page_id}            → Page metadata
2. GET /api/pages/{page_id}/document   → Document settings + blocks
3. Render block editor
4. On block edit:
     → PUT /api/pages/{pid}/blocks/{bid}
5. On block create:
     → POST /api/pages/{pid}/blocks (with prev_block_id/next_block_id)
6. On block delete:
     → DELETE /api/pages/{pid}/blocks/{bid}
7. On block reorder:
     → POST /api/pages/{pid}/blocks/{bid}/move
8. Periodically or on threshold:
     → POST /api/pages/{pid}/blocks/rebalance
```

### Note Capture Flow

```
Currently via canvas chat:
  → POST /api/pages/{pid}/chat { message: "capture: my note text" }

Or direct (needs route):
  → POST /api/capture { text: "...", page_hint: "PageName", ... }

Expected POST /api/capture request:
{
  "text": "raw note text",
  "source_url": "https://...",
  "source_title": "Page Title",
  "capture_type": "manual" | "extension",
  "page_hint": "Suggested Page Name",
  "custom_command": null,
  "viewport": { "x": 0, "y": 0, "width": 1920, "height": 1080, "zoom": 1.0 }
}
```

### Chat Flow (Home)

```
1. POST /api/chat { question: "...", history: [...] }
2. Display response
3. Display sources as clickable note links
4. Maintain history array for follow-ups
```

### Graph View Flow

```
1. GET /api/graph/full                 → nodes + edges
2. Render force-directed or other graph
3. Click node → GET /api/notes/{id}
4. Manual edge creation → POST /api/graph/edges
```

### Curator Flow

```
1. POST /api/ai/curator/scan           → Get all findings
2. Display potential_duplicates, orphans, stale notes
3. Show needs_confirmation actions with approve/reject
4. On approve → POST /api/ai/curator/apply { action_type, params }
```

### Search Flow

```
1. GET /api/search?q=query              → Semantic results
2. GET /api/search/tags?tags=a,b        → Tag-based results
3. Display results, click to navigate
```

### Settings Flow

```
1. GET /api/settings                    → Current settings
2. PUT /api/settings { theme: "dark", model: "gemini-2.5-flash", ... }
```

### SSE Canvas Chat — Complete Frontend Handler Pattern

```typescript
async function handleCanvasChat(pageId: string, message: string, viewport?: Viewport) {
  const response = await fetch(`/api/pages/${pageId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, viewport, history: chatHistory }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      if (!event.startsWith('data: ')) continue;
      const op: CanvasOp = JSON.parse(event.slice(6));

      switch (op.op) {
        case 'info':
          if (op.metadata?.type === 'chat_response') {
            // Display as chat message
            addChatMessage('assistant', op.message!, op.metadata.sources);
          } else if (op.metadata?.navigate_to_page) {
            navigateToPage(op.metadata.navigate_to_page);
          } else if (op.metadata?.results) {
            showSearchResults(op.metadata.results);
          } else {
            showStatusMessage(op.message!);
          }
          break;

        case 'stream_start':
          createPlaceholderElement(op.element_id!, op.x!, op.y!);
          break;

        case 'stream_chunk':
          appendToElement(op.element_id!, op.text!);
          break;

        case 'stream_end':
          finalizeElement(op.element_id!, op.text!, op.width!, op.height!);
          break;

        case 'create_note':
          // Scene already updated server-side; reload or add optimistically
          reloadScene();
          break;

        case 'create_diagram':
          reloadScene();
          break;

        case 'create_text':
          addTextElement(op.element_id!, op.x!, op.y!, op.width!, op.height!, op.text!);
          break;

        case 'set_background':
          updateBackground(op.color!);
          break;

        case 'set_theme':
          updateTheme(op.theme!);
          break;

        case 'arrange_cluster':
          reloadScene(); // All positions changed
          break;

        case 'error':
          showError(op.message!);
          break;

        case 'done':
          // Stream complete
          break;
      }
    }
  }
}
```

### Key Behavioral Notes for Frontend

1. **Scene reloads after mutations:** When the backend performs `create_note`, `create_diagram`, `arrange_cluster`, or any mutation via canvas chat, the scene is saved server-side. The frontend should reload the scene to see changes (or apply them optimistically from the CanvasOp data).

2. **Note cards are multi-element groups:** Don't try to create note cards client-side. The backend's scene_manager handles the complex element creation with proper text wrapping, theming, and grouping. Let the backend place them and reload the scene.

3. **Viewport is separate from scene:** The viewport (scroll position + zoom) should be saved/loaded independently per user per page. This is a per-user preference, not part of the shared scene.

4. **Block ordering is fractional:** In notebook mode, blocks use float `order_key` values. When inserting between blocks, compute the midpoint. Call rebalance when values get too close (e.g., < 0.001 apart).

5. **Processing is async for retries:** When a note is retried via `POST /api/notes/{id}/retry`, processing happens in the background. Poll the note's `processing_status` to track progress. For canvas chat captures, processing is synchronous within the stream.

6. **Auth header is always safe to include:** When auth is disabled, the backend ignores the Authorization header. So the frontend can always include it without conditional logic.

7. **Tags are always lowercase:** The backend normalizes tags to lowercase during processing.

8. **Edge uniqueness is directional:** `(A → B)` and `(B → A)` are different edges in the constraint. But the backend's `get_edges_for_note` returns edges in both directions.

9. **Soft deletes for blocks:** `DELETE` on blocks sets `is_deleted = true`. They're excluded from normal queries but still exist in DB. No hard delete endpoint is exposed.

10. **Cache invalidation is automatic:** The backend handles all Redis cache invalidation internally. The frontend doesn't need to worry about stale cache — just make the API calls.

---

## Appendix A: Complete Supabase Table Summary

| Table | Primary Key | Key Relationships |
|---|---|---|
| `users` | `id` (UUID) | — |
| `pages` | `id` (UUID) | `user_id → users` |
| `page_scenes` | `page_id` (FK) | `page_id → pages` (1:1) |
| `page_visual_context` | `page_id` (FK) | `page_id → pages` (1:1) |
| `user_viewports` | `(user_id, page_id)` | Both FK |
| `notes` | `id` (UUID) | `user_id → users`, `page_id → pages` |
| `note_embeddings` | `note_id` (FK) | `note_id → notes` (1:1) |
| `note_edges` | `id` (UUID) | `source_id → notes`, `target_id → notes` |
| `canvas_regions` | `id` (UUID) | `page_id → pages` |
| `canvas_element_registry` | `id` (UUID) | `page_id → pages`, unique `(page_id, element_id)` |
| `page_documents` | `page_id` (FK) | `page_id → pages` (1:1) |
| `page_blocks` | `id` (UUID) | `page_id → pages`, `parent_block_id → page_blocks`, `note_id → notes` |
| `block_references` | `id` (UUID) | `page_id → pages`, `block_id → page_blocks` |
| `inline_embeds` | `id` (UUID) | `page_id → pages`, `block_id → page_blocks`, optional FKs to pages/notes/blocks |
| `chat_history` | `id` (UUID) | `user_id → users` |
| `settings` | `id` (UUID) | `user_id → users` |
| `agent_runs` | `id` (UUID) | — |
| `page_revisions` | `id` (UUID) | `page_id → pages` |
| `page_operation_log` | `id` (UUID) | `page_id → pages` |

### Supabase RPC Functions

| Function | Parameters | Returns | Purpose |
|---|---|---|---|
| `match_notes` | `query_embedding`, `match_threshold`, `match_count` | Table of notes + similarity | Global vector search |
| `match_notes_in_page` | `query_embedding`, `target_page_id`, `match_threshold`, `match_count` | Table of notes + similarity | Page-scoped vector search |
| `mnemos_next_order_key` | `p_page_id`, `p_prev_block_id`, `p_next_block_id` | FLOAT | Compute block order key |
| `mnemos_rebalance_page_blocks` | `p_page_id` | VOID | Rebalance all block order keys |

---

## Appendix B: Entity Relationship Diagram (Text)

```
users ──1:N──→ pages ──1:1──→ page_scenes
   │              │──1:1──→ page_visual_context
   │              │──1:N──→ notes ──1:1──→ note_embeddings
   │              │              │──N:M──→ note_edges (via source_id/target_id)
   │              │              │──1:N──→ canvas_element_registry
   │              │              │──1:N──→ page_blocks (via note_id)
   │              │──1:N──→ canvas_regions ──1:N──→ canvas_element_registry (via region_id)
   │              │──1:1──→ page_documents
   │              │──1:N──→ page_blocks ──1:N──→ block_references
   │              │                       ──1:N──→ inline_embeds
   │              │──1:N──→ page_revisions
   │              │──1:N──→ page_operation_log
   │──1:N──→ user_viewports (per user per page)
   │──1:N──→ chat_history
   │──1:1──→ settings
```

---

*This document covers the complete Mnemos v2.0 backend as of the current codebase. All 14 route modules, 13 service modules, the LangGraph agent pipeline, the full Supabase schema with 19 tables and 4 RPC functions, and all behavioral contracts are documented.*

## Appendix C: Complete TypeScript Type Definitions

Copy-paste ready types for the frontend:

```typescript
// ══════════════════════════════════════════════════════
// CORE ENTITIES
// ══════════════════════════════════════════════════════

interface Page {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  layout_mode: "canvas" | "notebook";
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface Note {
  id: string;
  user_id: string | null;
  page_id: string | null;
  raw_text: string;
  title: string | null;
  summary: string | null;
  tags: string[];
  tasks: string[];
  entities: string[];
  content_type: ContentType;
  source_url: string | null;
  source_title: string | null;
  capture_type: string;
  processing_status: ProcessingStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  label: string | null;
  strength: number;
  created_by: "processor" | "curator" | "user";
  created_at: string;
}

interface Region {
  id: string;
  page_id: string;
  label: string | null;
  description: string | null;
  color: string | null;
  region_type: RegionType;
  layout_hint: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ══════════════════════════════════════════════════════
// SCENE & VISUAL
// ══════════════════════════════════════════════════════

interface Scene {
  elements: ExcalidrawElement[];
  appState: {
    viewBackgroundColor: string;
    theme: "dark" | "light";
    [key: string]: any;
  };
  files: Record<string, any>;
}

interface VisualContext {
  page_id: string;
  background_color: string;
  theme: "dark" | "light";
  dominant_colors: string[];
  layout_pattern: LayoutPattern;
  reading_direction: ReadingDirection;
  density: Density;
  bounds: Bounds;
  element_count: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

interface ElementRegistryEntry {
  id: string;
  page_id: string;
  element_id: string;
  element_type: ElementType;
  content_source: ContentSource;
  note_id: string | null;
  region_id: string | null;
  cached_x: number | null;
  cached_y: number | null;
  cached_width: number | null;
  cached_height: number | null;
  style_snapshot: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ══════════════════════════════════════════════════════
// DOCUMENT / NOTEBOOK MODE
// ══════════════════════════════════════════════════════

interface PageDocument {
  page_id: string;
  user_id: string | null;
  default_font: string;
  content_width: number;
  line_height: number;
  left_padding: number;
  right_padding: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface PageBlock {
  id: string;
  page_id: string;
  block_type: string;
  text_content: string | null;
  order_key: number;
  depth: number;
  parent_block_id: string | null;
  note_id: string | null;
  attrs: Record<string, any>;
  provenance: Record<string, any>;
  version: number;
  is_deleted: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface BlockReference {
  id: string;
  page_id: string;
  block_id: string;
  ref_type: string;
  ref_id: string;
  start_offset: number;
  end_offset: number | null;
  label: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface InlineEmbed {
  id: string;
  page_id: string;
  block_id: string;
  embed_type: string;
  target_page_id: string | null;
  target_note_id: string | null;
  target_block_id: string | null;
  url: string | null;
  inline_position: Record<string, any>;
  display_mode: string;
  width: number | null;
  height: number | null;
  attrs: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ══════════════════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════════════════

interface ChatHistory {
  id: string;
  user_id: string | null;
  context_type: string;
  context_id: string | null;
  messages: ChatMessage[];
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ══════════════════════════════════════════════════════
// SETTINGS & AUTH
// ══════════════════════════════════════════════════════

interface UserSettings {
  theme: "dark" | "light";
  model: string;
  groq_model: string;
  similarity_threshold: number;
  embedding_dimensions: number;
  auto_layout: boolean;
  auto_connect: boolean;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

interface AuthState {
  auth_enabled: boolean;
  user: User | null;
  google_client_id: string;
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: User;
}

// ══════════════════════════════════════════════════════
// CANVAS CHAT SSE
// ══════════════════════════════════════════════════════

interface CanvasOp {
  op: OpType;
  element_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  theme?: string;
  zoom?: number;
  style?: string;
  note?: Note;
  note_id?: string;
  elements?: Record<string, any>[];
  connections?: Record<string, any>[];
  operations?: CanvasOp[];
  topology?: DiagramTopology;
  message?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface DiagramTopology {
  layout_type: "flow" | "mindmap" | "list" | "comparison" | "timeline";
  elements: DiagramElement[];
  connections: DiagramConnection[];
}

interface DiagramElement {
  id: string;
  label: string;
  type: "box" | "text";
  style: "default" | "accent" | "muted" | "warning" | "success";
  width: number;
  height: number;
}

interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed" | "dotted";
}

interface CanvasStreamRequest {
  message: string;
  viewport?: Viewport;
  history?: ChatMessage[];
  selected_element_ids?: string[];
  context_type?: string;
}

// ══════════════════════════════════════════════════════
// WORKSPACE & STATS
// ══════════════════════════════════════════════════════

interface WorkspaceOverview {
  pages: PageSummary[];
  total_notes: number;
  total_pages: number;
  top_tags: TagCount[];
}

interface PageSummary {
  id: string;
  name: string;
  icon: string;
  color: string;
  note_count: number;
  layout_mode: "canvas" | "notebook";
  is_archived: boolean;
  updated_at: string;
}

interface TagCount {
  name: string;
  count: number;
}

interface WorkspaceStats {
  notes: number;
  pages: number;
  edges: number;
  stuck_notes: number;
  cache: CacheStats;
}

interface CacheStats {
  enabled: boolean;
  hits?: number;
  misses?: number;
  error?: string;
}

interface PageStats {
  note_count: number;
  edge_count: number;
  region_count: number;
  element_count: number;
  tags: TagCount[];
}

// ══════════════════════════════════════════════════════
// CURATOR
// ══════════════════════════════════════════════════════

interface CuratorScanResult {
  potential_duplicates: DuplicateInfo[];
  orphan_notes: OrphanInfo[];
  stale_notes: StaleInfo[];
  region_issues: RegionIssue[];
  missing_connections: MissingConnectionInfo[];
  auto_applied: number;
  needs_confirmation: ConfirmationAction[];
}

interface DuplicateInfo {
  note_a: string;
  note_b: string;
  similarity: number;
  suggestion: "merge";
  reason: string;
}

interface OrphanInfo {
  note_id: string;
  title: string;
  suggestion: "connect_orphan";
  reason: string;
}

interface StaleInfo {
  note_id: string;
  title: string;
  days_old: number;
}

interface RegionIssue {
  region_id: string;
  issue: "too_large" | "empty";
  size: number;
  suggestion: string;
}

interface MissingConnectionInfo {
  note_a: string;
  note_b: string;
  similarity: number;
  suggested_type: EdgeType;
  reason: string;
}

interface ConfirmationAction {
  action_type: "merge_notes" | "delete_note";
  params: Record<string, string>;
  reason: string;
}

interface CuratorApplyRequest {
  action_type: "merge_notes" | "delete_note" | "connect_orphan";
  params: Record<string, string>;
}

// ══════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════

interface SearchResult extends Note {
  similarity: number;
}

interface SearchResponse {
  results: SearchResult[];
  count: number;
  query: string;
}

interface TagSearchResponse {
  results: Note[];
  count: number;
  tags: string[];
}

// ══════════════════════════════════════════════════════
// GRAPH
// ══════════════════════════════════════════════════════

interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  page_id: string | null;
  content_type: ContentType;
}

interface FullGraph {
  nodes: GraphNode[];
  edges: Edge[];
}

// ══════════════════════════════════════════════════════
// ENUMS
// ══════════════════════════════════════════════════════

type ContentType = "note" | "code" | "url" | "thought" | "question" | "clip";

type ProcessingStatus = "pending" | "processing" | "done" | "failed";

type EdgeType = "related" | "depends_on" | "extends" | "contradicts"
  | "summarizes" | "example_of";

type LayoutPattern = "freeform" | "grid" | "timeline" | "mindmap"
  | "flow" | "columns";

type ReadingDirection = "left-to-right" | "top-to-bottom" | "radial" | "mixed";

type Density = "empty" | "sparse" | "moderate" | "dense";

type RegionType = "cluster" | "section" | "timeline-segment"
  | "comparison-column" | "freeform";

type ElementType = "note-card" | "composed-text" | "diagram-node"
  | "diagram-arrow" | "sticky" | "freehand" | "image" | "group";

type ContentSource = "note" | "ai-compose" | "ai-diagram" | "user-draw" | "clip";

type OpType =
  | "create_note" | "create_text" | "create_diagram" | "create_sticky"
  | "update_element" | "move_element" | "delete_element" | "group_elements"
  | "create_edge_line" | "set_background" | "set_theme"
  | "pan_to" | "zoom_to"
  | "stream_start" | "stream_chunk" | "stream_end"
  | "arrange_cluster" | "batch"
  | "info" | "error" | "done";

type Intent = "compose" | "command" | "arrange" | "capture"
  | "query" | "diagram" | "search" | "navigate";

// ══════════════════════════════════════════════════════
// REQUEST BODIES
// ══════════════════════════════════════════════════════

interface PageCreateRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  layout_mode?: "canvas" | "notebook";
}

interface PageUpdateRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  is_archived?: boolean;
  layout_mode?: "canvas" | "notebook";
}

interface NoteUpdateRequest {
  title?: string;
  summary?: string;
  tags?: string[];
  tasks?: string[];
  entities?: string[];
  page_id?: string;
  metadata?: Record<string, any>;
}

interface NoteMoveRequest {
  page_id: string;
}

interface EdgeCreateRequest {
  source_id: string;
  target_id: string;
  edge_type?: EdgeType;
  label?: string;
  strength?: number;
  created_by?: string;
}

interface ChatRequest {
  question: string;
  history?: ChatMessage[];
  context_type?: string;
  page_id?: string;
}

interface ChatResponse {
  response: string;
  sources: Array<{
    id: string;
    title: string;
    similarity: number;
  }>;
}

interface CaptureRequest {
  text: string;
  source_url?: string;
  source_title?: string;
  capture_type?: string;
  page_hint?: string;
  custom_command?: string;
  viewport?: Viewport;
}

interface BlockCreateRequest {
  block_type?: string;
  text_content?: string;
  parent_block_id?: string;
  prev_block_id?: string;
  next_block_id?: string;
  order_key?: number;
  depth?: number;
  attrs?: Record<string, any>;
  note_id?: string;
  provenance?: Record<string, any>;
  metadata?: Record<string, any>;
  created_by?: string;
}

interface BlockUpdateRequest {
  text_content?: string;
  parent_block_id?: string;
  order_key?: number;
  depth?: number;
  block_type?: string;
  attrs?: Record<string, any>;
  provenance?: Record<string, any>;
  metadata?: Record<string, any>;
  is_deleted?: boolean;
}

interface BlockMoveRequest {
  prev_block_id?: string;
  next_block_id?: string;
  order_key?: number;
}

interface BlockReferenceCreateRequest {
  ref_type: string;
  ref_id: string;
  start_offset?: number;
  end_offset?: number;
  label?: string;
  metadata?: Record<string, any>;
}

interface InlineEmbedCreateRequest {
  embed_type: string;
  target_page_id?: string;
  target_note_id?: string;
  target_block_id?: string;
  url?: string;
  inline_position?: Record<string, any>;
  display_mode?: string;
  width?: number;
  height?: number;
  attrs?: Record<string, any>;
  created_by?: string;
}

interface DocumentUpdateRequest {
  default_font?: string;
  content_width?: number;
  line_height?: number;
  left_padding?: number;
  right_padding?: number;
  metadata?: Record<string, any>;
}

interface SceneSaveRequest {
  elements: any[];
  appState: Record<string, any>;
  files: Record<string, any>;
}

interface ViewportSaveRequest {
  scroll_x: number;
  scroll_y: number;
  zoom: number;
}

interface SettingsUpdateRequest {
  theme?: "dark" | "light";
  model?: string;
  groq_model?: string;
  similarity_threshold?: number;
  embedding_dimensions?: number;
  auto_layout?: boolean;
  auto_connect?: boolean;
}
```

---

## Appendix D: API Client Reference Implementation

A complete, copy-paste ready API client:

```typescript
// ══════════════════════════════════════════════════════
// api-client.ts — Complete Mnemos API Client
// ══════════════════════════════════════════════════════

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API = `${BASE_URL}/api`;

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onAuthError: (() => void) | null = null;

// ── Core fetch wrapper ──

async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && refreshToken) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      const retry = await fetch(`${API}${path}`, { ...options, headers });
      if (!retry.ok) throw await parseError(retry);
      return retry.json();
    }
    onAuthError?.();
    throw new Error("Authentication expired");
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
}

async function parseError(response: Response): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(data.detail || JSON.stringify(data));
  } catch {
    return new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const resp = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (resp.ok) {
      const data = await resp.json();
      accessToken = data.access_token;
      return true;
    }
  } catch {}
  return false;
}

// ── Auth ──

export const auth = {
  setTokens(access: string, refresh: string) {
    accessToken = access;
    refreshToken = refresh;
  },

  clearTokens() {
    accessToken = null;
    refreshToken = null;
  },

  onError(callback: () => void) {
    onAuthError = callback;
  },

  me(): Promise<AuthState> {
    return apiFetch("/auth/me");
  },

  loginGoogle(token: string): Promise<AuthTokens> {
    return apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  refresh(token: string): Promise<{ access_token: string }> {
    return apiFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: token }),
    });
  },
};

// ── Pages ──

export const pages = {
  list(includeArchived = false): Promise<{ pages: Page[] }> {
    return apiFetch(`/pages?include_archived=${includeArchived}`);
  },

  get(pageId: string): Promise<Page> {
    return apiFetch(`/pages/${pageId}`);
  },

  create(data: PageCreateRequest): Promise<Page> {
    return apiFetch("/pages", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(pageId: string, data: PageUpdateRequest): Promise<Page> {
    return apiFetch(`/pages/${pageId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(pageId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}`, { method: "DELETE" });
  },
};

// ── Notes ──

export const notes = {
  list(params: {
    page?: number;
    limit?: number;
    tag?: string;
    page_id?: string;
  } = {}): Promise<{ notes: Note[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.tag) qs.set("tag", params.tag);
    if (params.page_id) qs.set("page_id", params.page_id);
    return apiFetch(`/notes?${qs}`);
  },

  get(noteId: string): Promise<Note> {
    return apiFetch(`/notes/${noteId}`);
  },

  update(noteId: string, data: NoteUpdateRequest): Promise<Note> {
    return apiFetch(`/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(noteId: string): Promise<{ status: string }> {
    return apiFetch(`/notes/${noteId}`, { method: "DELETE" });
  },

  retry(noteId: string): Promise<{ status: string }> {
    return apiFetch(`/notes/${noteId}/retry`, { method: "POST" });
  },

  move(noteId: string, pageId: string): Promise<{
    status: string;
    from_page: string;
    to_page: string;
  }> {
    return apiFetch(`/notes/${noteId}/move`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId }),
    });
  },

  tags(): Promise<{ tags: TagCount[] }> {
    return apiFetch("/tags");
  },
};

// ── Chat (Home) ──

export const chat = {
  send(data: ChatRequest): Promise<ChatResponse> {
    return apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ── Canvas Chat (SSE) ──

export const canvasChat = {
  /**
   * Opens an SSE stream for canvas chat.
   * Returns an async iterator of CanvasOp events.
   */
  async *stream(
    pageId: string,
    data: CanvasStreamRequest
  ): AsyncGenerator<CanvasOp> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API}/pages/${pageId}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseError(response);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;

          try {
            const op: CanvasOp = JSON.parse(line.slice(6));
            yield op;

            if (op.op === "done") return;
          } catch (e) {
            console.warn("Failed to parse SSE event:", line);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};

// ── Document (Notebook Mode) ──

export const document = {
  get(pageId: string): Promise<{
    document: PageDocument | null;
    blocks: PageBlock[];
    page: Page;
  }> {
    return apiFetch(`/pages/${pageId}/document`);
  },

  updateSettings(
    pageId: string,
    data: DocumentUpdateRequest
  ): Promise<PageDocument> {
    return apiFetch(`/pages/${pageId}/document`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  listBlocks(pageId: string): Promise<{ blocks: PageBlock[] }> {
    return apiFetch(`/pages/${pageId}/blocks`);
  },

  createBlock(
    pageId: string,
    data: BlockCreateRequest
  ): Promise<PageBlock> {
    return apiFetch(`/pages/${pageId}/blocks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateBlock(
    pageId: string,
    blockId: string,
    data: BlockUpdateRequest
  ): Promise<PageBlock> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteBlock(
    pageId: string,
    blockId: string
  ): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}`, {
      method: "DELETE",
    });
  },

  moveBlock(
    pageId: string,
    blockId: string,
    data: BlockMoveRequest
  ): Promise<PageBlock> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/move`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  rebalanceBlocks(pageId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/blocks/rebalance`, {
      method: "POST",
    });
  },

  listReferences(
    pageId: string,
    blockId: string
  ): Promise<{ references: BlockReference[] }> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/references`);
  },

  createReference(
    pageId: string,
    blockId: string,
    data: BlockReferenceCreateRequest
  ): Promise<BlockReference> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/references`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  deleteReference(
    pageId: string,
    refId: string
  ): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/references/${refId}`, {
      method: "DELETE",
    });
  },

  listEmbeds(
    pageId: string,
    blockId: string
  ): Promise<{ embeds: InlineEmbed[] }> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/embeds`);
  },

  createEmbed(
    pageId: string,
    blockId: string,
    data: InlineEmbedCreateRequest
  ): Promise<InlineEmbed> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/embeds`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  deleteEmbed(
    pageId: string,
    embedId: string
  ): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/embeds/${embedId}`, {
      method: "DELETE",
    });
  },
};

// ── Graph ──

export const graph = {
  allEdges(): Promise<{ edges: Edge[] }> {
    return apiFetch("/graph/edges");
  },

  noteEdges(noteId: string): Promise<{ edges: Edge[] }> {
    return apiFetch(`/graph/edges/note/${noteId}`);
  },

  pageEdges(pageId: string): Promise<{ edges: Edge[] }> {
    return apiFetch(`/graph/edges/page/${pageId}`);
  },

  createEdge(data: EdgeCreateRequest): Promise<Edge> {
    return apiFetch("/graph/edges", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  deleteEdge(edgeId: string): Promise<{ status: string }> {
    return apiFetch(`/graph/edges/${edgeId}`, { method: "DELETE" });
  },

  full(): Promise<FullGraph> {
    return apiFetch("/graph/full");
  },
};

// ── Search ──

export const search = {
  semantic(params: {
    q: string;
    page_id?: string;
    limit?: number;
    threshold?: number;
  }): Promise<SearchResponse> {
    const qs = new URLSearchParams({ q: params.q });
    if (params.page_id) qs.set("page_id", params.page_id);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.threshold) qs.set("threshold", String(params.threshold));
    return apiFetch(`/search?${qs}`);
  },

  byTags(tags: string[]): Promise<TagSearchResponse> {
    return apiFetch(`/search/tags?tags=${tags.join(",")}`);
  },
};

// ── Workspace ──

export const workspace = {
  overview(): Promise<WorkspaceOverview> {
    return apiFetch("/workspace/overview");
  },

  stats(): Promise<WorkspaceStats> {
    return apiFetch("/workspace/stats");
  },
};

// ── AI ──

export const ai = {
  curatorScan(): Promise<CuratorScanResult> {
    return apiFetch("/ai/curator/scan", { method: "POST" });
  },

  curatorApply(data: CuratorApplyRequest): Promise<Record<string, any>> {
    return apiFetch("/ai/curator/apply", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  analyzePage(pageId: string): Promise<{
    visual_context: VisualContext;
    note_count: number;
    edge_count: number;
    region_count: number;
    analysis: {
      layout_pattern: string;
      density: string;
      reading_direction: string;
      theme: string;
      colors: string[];
    };
  }> {
    return apiFetch(`/ai/analyze/page/${pageId}`, { method: "POST" });
  },

  retryStuck(): Promise<{ retrying: number }> {
    return apiFetch("/ai/retry-stuck", { method: "POST" });
  },
};

// ── Settings ──

export const settings = {
  get(): Promise<UserSettings> {
    return apiFetch("/settings");
  },

  update(data: SettingsUpdateRequest): Promise<{ status: string }> {
    return apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// ── Health ──

export const health = {
  check(): Promise<{
    status: string;
    version: string;
    cache: CacheStats;
  }> {
    // NOTE: /health is NOT under /api
    return fetch(`${BASE_URL}/health`).then((r) => r.json());
  },
};
```

---

## Appendix E: Complete API Route Map (Quick Reference)

One-page view of every endpoint:

```
HEALTH
  GET    /health                                    → { status, version, cache }

AUTH
  POST   /api/auth/google                           → { access_token, refresh_token, user }
  POST   /api/auth/refresh                          → { access_token }
  GET    /api/auth/me                               → { auth_enabled, user, google_client_id }

PAGES
  GET    /api/pages                                 → { pages: Page[] }
  POST   /api/pages                                 → Page
  GET    /api/pages/:id                             → Page
  PUT    /api/pages/:id                             → Page
  DELETE /api/pages/:id                             → { status }

NOTES
  GET    /api/notes                                 → { notes: Note[], total }
  GET    /api/notes/:id                             → Note
  PUT    /api/notes/:id                             → Note
  DELETE /api/notes/:id                             → { status }
  POST   /api/notes/:id/retry                       → { status }
  POST   /api/notes/:id/move                        → { status, from_page, to_page }
  GET    /api/tags                                  → { tags: TagCount[] }

CHAT
  POST   /api/chat                                  → { response, sources }

CANVAS CHAT (SSE)
  POST   /api/pages/:id/chat                        → SSE stream of CanvasOp

DOCUMENT (NOTEBOOK)
  GET    /api/pages/:id/document                    → { document, blocks, page }
  PUT    /api/pages/:id/document                    → PageDocument
  GET    /api/pages/:id/blocks                      → { blocks: PageBlock[] }
  POST   /api/pages/:id/blocks                      → PageBlock
  PUT    /api/pages/:id/blocks/:bid                 → PageBlock
  DELETE /api/pages/:id/blocks/:bid                 → { status }
  POST   /api/pages/:id/blocks/:bid/move            → PageBlock
  POST   /api/pages/:id/blocks/rebalance            → { status }
  GET    /api/pages/:id/blocks/:bid/references      → { references }
  POST   /api/pages/:id/blocks/:bid/references      → BlockReference
  DELETE /api/pages/:id/references/:rid             → { status }
  GET    /api/pages/:id/blocks/:bid/embeds          → { embeds }
  POST   /api/pages/:id/blocks/:bid/embeds          → InlineEmbed
  DELETE /api/pages/:id/embeds/:eid                 → { status }

GRAPH
  GET    /api/graph/edges                           → { edges: Edge[] }
  GET    /api/graph/edges/note/:id                  → { edges: Edge[] }
  GET    /api/graph/edges/page/:id                  → { edges: Edge[] }
  POST   /api/graph/edges                           → Edge
  DELETE /api/graph/edges/:id                       → { status }
  GET    /api/graph/full                            → { nodes, edges }

SEARCH
  GET    /api/search?q=...                          → { results, count, query }
  GET    /api/search/tags?tags=...                  → { results, count, tags }

WORKSPACE
  GET    /api/workspace/overview                    → { pages, total_notes, total_pages, top_tags }
  GET    /api/workspace/stats                       → { notes, pages, edges, stuck_notes, cache }

AI
  POST   /api/ai/curator/scan                       → CuratorScanResult
  POST   /api/ai/curator/apply                      → varies
  POST   /api/ai/analyze/page/:id                   → { visual_context, analysis, counts }
  POST   /api/ai/retry-stuck                        → { retrying }

SETTINGS
  GET    /api/settings                              → UserSettings
  PUT    /api/settings                              → { status }

TOTAL: 42 endpoints (38 implemented + 4 empty placeholders)
```

---

## Appendix F: Common Frontend Workflows — Exact Call Sequences

### F.1 App Initialization

```
1. GET  /health                          → verify backend
2. GET  /api/auth/me                     → check auth mode
3. IF auth_enabled AND no stored token:
     → Show Google login
     → POST /api/auth/google             → store tokens
4. GET  /api/workspace/overview          → homepage data
5. GET  /api/settings                    → user preferences
```

### F.2 Open a Canvas Page

```
1. GET  /api/pages/{id}                  → page metadata
2. GET  /api/pages/{id}/scene            → Excalidraw scene  ⚠️ NEEDS ROUTE
3. GET  /api/pages/{id}/viewport         → saved camera      ⚠️ NEEDS ROUTE
4. GET  /api/notes?page_id={id}          → notes list (for sidebar)
5. GET  /api/graph/edges/page/{id}       → edges (for edge lines overlay)
6. Initialize Excalidraw with scene data + viewport
```

### F.3 Open a Notebook Page

```
1. GET  /api/pages/{id}                  → page metadata
2. GET  /api/pages/{id}/document         → document + blocks + page
3. Render block editor with ordered blocks
```

### F.4 Canvas Chat Interaction

```
1. User types message in chat input
2. POST /api/pages/{id}/chat (SSE)       → open stream
3. Read SSE events:
   - "info" with intent → show status
   - "stream_start" → create placeholder
   - "stream_chunk" → append text
   - "stream_end" → finalize element
   - "create_note" → reload scene
   - "create_diagram" → reload scene
   - "set_background" → update appState
   - "arrange_cluster" → reload scene
   - "error" → show error
   - "done" → stream complete
4. After "done" with scene-mutating ops:
   GET /api/pages/{id}/scene             → reload fresh scene ⚠️ NEEDS ROUTE
```

### F.5 Create a Note (from scratch)

```
Currently via canvas chat:
1. POST /api/pages/{id}/chat
   { "message": "capture: My new note text here" }
2. Process SSE stream
3. On "create_note" event → note is created and placed

Alternative (once capture route exists):
1. POST /api/capture                     ⚠️ NEEDS ROUTE
   { "text": "My note", "page_hint": "ML Research" }
2. Returns created note with processing_status: "pending"
3. Poll GET /api/notes/{id} until processing_status: "done"
```

### F.6 Edit a Note

```
1. PUT  /api/notes/{id}
   { "title": "Updated", "tags": ["new-tag"] }
2. Backend auto-syncs note card on canvas scene
3. IF canvas is open:
   GET /api/pages/{page_id}/scene        → reload scene with updated card ⚠️ NEEDS ROUTE
```

### F.7 Move a Note Between Pages

```
1. POST /api/notes/{id}/move
   { "page_id": "new-page-uuid" }
2. Response: { status: "moved", from_page: "...", to_page: "..." }
3. IF viewing old page: reload scene (card removed)
4. IF viewing new page: reload scene (card added)
```

### F.8 Run Curator

```
1. POST /api/ai/curator/scan             → get findings
2. Display results to user:
   - Duplicates → offer merge
   - Orphans → offer connect
   - Stale → offer delete
   - Auto-applied connections → show count
3. User approves action:
   POST /api/ai/curator/apply
   { "action_type": "merge_notes", "params": { "note_a": "...", "note_b": "..." } }
4. Refresh note list / graph after action
```

### F.9 View Knowledge Graph

```
1. GET  /api/graph/full                  → { nodes, edges }
2. Render graph visualization
3. Click node → GET /api/notes/{id} → show detail
4. User creates manual edge:
   POST /api/graph/edges
   { "source_id": "...", "target_id": "...", "edge_type": "extends" }
```

### F.10 Semantic Search

```
1. GET  /api/search?q=neural+networks&limit=10
2. Display results with similarity scores
3. Click result → navigate to note's page
```

### F.11 Save Excalidraw Scene (after user draws)

```
⚠️ NEEDS ROUTE — but the expected call would be:

1. PUT  /api/pages/{id}/scene
   { "elements": [...], "appState": {...}, "files": {...} }
2. Backend auto-runs visual analysis
3. Backend auto-syncs element registry

For viewport:
PUT  /api/pages/{id}/viewport
   { "scroll_x": 100, "scroll_y": 200, "zoom": 1.5 }
```

### F.12 Notebook — Add Block Between Existing Blocks

```
1. Identify prev and next block IDs
2. POST /api/pages/{id}/blocks
   {
     "block_type": "paragraph",
     "text_content": "New paragraph",
     "prev_block_id": "block-uuid-above",
     "next_block_id": "block-uuid-below"
   }
3. Backend computes order_key = midpoint
4. Insert response into blocks list at correct position
```

### F.13 Notebook — Reorder Blocks via Drag

```
1. User drags block to new position
2. Identify new prev and next block IDs at drop position
3. POST /api/pages/{id}/blocks/{bid}/move
   { "prev_block_id": "...", "next_block_id": "..." }
4. Update local order

IF many moves have been done:
POST /api/pages/{id}/blocks/rebalance
(Reassigns all order_keys to clean 1000-multiples)
```

---

## Appendix G: Excalidraw customData Conventions

The backend uses `customData` on Excalidraw elements to track semantic meaning. The frontend should preserve these when modifying elements.

### Note Card Elements

| customData | Description |
|---|---|
| `{ noteId: "uuid", type: "note-frame" }` | Card background rectangle |
| `{ noteId: "uuid", type: "note-title" }` | Title text |
| `{ noteId: "uuid", type: "note-summary" }` | Summary text |
| `{ noteId: "uuid", type: "note-accent" }` | Left accent line |
| `{ noteId: "uuid", type: "note-tags" }` | Tags text |

### AI-Generated Elements

| customData | Description |
|---|---|
| `{ type: "composed-text" }` | Text generated by AI compose |
| `{ type: "diagram-node", diagramId: "id" }` | Diagram box |
| `{ type: "diagram-label", diagramId: "id" }` | Text inside diagram box |
| `{ type: "diagram-arrow" }` | Diagram connection arrow |

### Sticky Notes

| customData | Description |
|---|---|
| `{ type: "sticky-bg" }` | Sticky note background |
| `{ type: "sticky-text" }` | Sticky note text |

### Element ID Conventions

| Pattern | Meaning |
|---|---|
| `note-frame-{noteId}` | Note card frame |
| `note-title-{noteId}` | Note title text |
| `note-summary-{noteId}` | Note summary text |
| `note-accent-{noteId}` | Note accent line |
| `note-tags-{noteId}` | Note tags text |
| `note-group-{noteId}` | Group ID for all note elements |
| `{nodeId}-rect` | Diagram node rectangle |
| `{nodeId}-text` | Diagram node label |
| `arrow-{fromId}-{toId}` | Diagram arrow |
| `compose-{timestamp}` | Composed text element |
| `sticky-{timestamp}-{random}` | Sticky note |
| `sticky-group-{id}` | Sticky note group |
| `diagram-{nodeId}` | Diagram element group |

### Important: Grouping

Note card elements are grouped via `groupIds: ["note-group-{noteId}"]`. Moving or deleting a note card should affect all elements in the group.

---

## Appendix H: Color Reference

### Theme-Aware Note Card Colors

```typescript
const NOTE_CARD_COLORS = {
  dark: {
    cardBg: "#1e1e2e",
    cardBorder: "#374151",
    titleText: "#f3f4f6",
    summaryText: "#9ca3af",
    accent: "#818cf8",
    tagText: "#818cf8",
  },
  light: {
    cardBg: "#ffffff",
    cardBorder: "#e5e7eb",
    titleText: "#111827",
    summaryText: "#6b7280",
    accent: "#6366f1",
    tagText: "#6366f1",
  },
};
```

### Diagram Style Colors

```typescript
const DIAGRAM_COLORS = {
  dark: {
    default:  { bg: "#1e1e2e", border: "#374151", text: "#e5e7eb" },
    accent:   { bg: "#312e81", border: "#6366f1", text: "#c7d2fe" },
    muted:    { bg: "#1f2937", border: "#4b5563", text: "#9ca3af" },
    warning:  { bg: "#431407", border: "#ea580c", text: "#fed7aa" },
    success:  { bg: "#052e16", border: "#16a34a", text: "#bbf7d0" },
  },
  light: {
    default:  { bg: "#ffffff", border: "#e5e7eb", text: "#1f2937" },
    accent:   { bg: "#eef2ff", border: "#6366f1", text: "#312e81" },
    muted:    { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280" },
    warning:  { bg: "#fff7ed", border: "#ea580c", text: "#7c2d12" },
    success:  { bg: "#f0fdf4", border: "#16a34a", text: "#14532d" },
  },
};
```

### Named Colors (Canvas Chat Commands)

When users say "set background to blue", the backend maps names to hex:

```typescript
const COLOR_MAP: Record<string, string> = {
  "black": "#000000",
  "white": "#ffffff",
  "dark blue": "#1a1a2e",
  "navy": "#1a1a2e",
  "dark": "#0e0e1a",
  "midnight": "#0e0e1a",
  "red": "#ef4444",
  "green": "#22c55e",
  "blue": "#3b82f6",
  "purple": "#8b5cf6",
  "indigo": "#6366f1",
  "yellow": "#eab308",
  "orange": "#f97316",
  "pink": "#ec4899",
  "teal": "#14b8a6",
  "cyan": "#06b6d4",
};
```

---

*End of document. This reference covers the complete Mnemos v2.0 backend: 42 API endpoints, 19 database tables, 4 RPC functions, the SSE streaming protocol with all 20 operation types, the LangGraph note processing pipeline, the visual context analysis system, the spatial layout engine, all data models with TypeScript types, a complete API client implementation, and step-by-step workflow sequences for every frontend feature.*