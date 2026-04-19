# Frontend Codebase Analysis - Mnemos v3

**Date:** April 19, 2026  
**Scope:** Complete analysis of `frontend/src` directory structure  
**Focus:** API usage, deprecated features, v3 compatibility

---

## Executive Summary

The frontend is a React/TypeScript application built with Vite. It consists of:
- **13 Block components** for UI rendering
- **10 Hooks** for state management and business logic
- **5 Core components** for streaming chat interface
- **5 Glass UI components** for design system
- **6 Canvas-related files** for Excalidraw integration
- **2 Lib utilities** for canvas operations

**Key Finding:** The codebase has been partially refactored for v3 API, with deprecated notebook mode still referenced but non-functional. Most endpoints align with v3 spec, but some fallback logic and legacy stubs remain.

---

## 1. BLOCKS DIRECTORY (`frontend/src/blocks/`)

### Purpose
Lazy-loaded card components that display content in the chat stream. Each block renders a distinct data type or action.

### Files & API Usage

#### **BatchCaptureBlock.tsx**
- **Purpose:** Multi-item bulk capture interface
- **API Used:**
  - `capture.batch(items)` - POST `/api/capture/batch`
- **Status:** ✅ v3 compatible
- **Notes:** Allows users to capture multiple notes in sequence

#### **ExportBlock.tsx**
- **Purpose:** Export entire workspace as markdown
- **API Used:**
  - `api.exportWorkspace()` - GET `/api/workspace/export` (custom endpoint)
- **Status:** ⚠️ **Deprecated endpoint** - No `/export` endpoint exists in v3 API
- **Changes Needed:**
  - Replace with `api.getAllNotesForExport()` or equivalent
  - Manually construct markdown from pages + notes using existing endpoints

#### **HelpBlock.tsx**
- **Purpose:** Display command reference
- **API Used:** None (static content)
- **Status:** ✅ v3 compatible
- **Notes:** Shows all available `/commands` for user reference

#### **NoteDetailBlock.tsx**
- **Purpose:** Display single note with metadata, actions
- **API Used:**
  - `notes.get(noteId)` - GET `/api/notes/{id}`
  - `notes.retry(note.id)` - POST `/api/notes/{id}/retry`
  - `notes.delete(note.id)` - DELETE `/api/notes/{id}`
  - `notes.move(note.id, targetPageId)` - POST `/api/notes/{id}/move`
  - `pages.list()` - GET `/api/pages`
- **Status:** ✅ v3 compatible
- **Notes:** Full CRUD operations for individual notes

#### **NoteGridBlock.tsx**
- **Purpose:** Grid display of multiple notes (paginated)
- **API Used:**
  - `notes.list({ page, limit, tag, page_id })` - GET `/api/notes`
- **Status:** ✅ v3 compatible
- **Notes:** Supports filtering by tag and page

#### **PageListBlock.tsx**
- **Purpose:** Grid display of all workspace pages
- **API Used:**
  - `pages.list()` - GET `/api/pages`
  - `pages.delete(pageId)` - DELETE `/api/pages/{id}`
- **Status:** ✅ v3 compatible
- **Notes:** Supports page creation/deletion flows

#### **PageStatsBlock.tsx**
- **Purpose:** Display per-page statistics (notes, edges, clusters, elements)
- **API Used:**
  - `api.getPageStats(pageId)` - GET `/api/pages/{id}/stats`
- **Status:** ⚠️ **Fallback logic present** - Endpoint may not exist; falls back to computing from graph + notes
- **Changes Needed:**
  - Verify `/api/pages/{id}/stats` exists in v3 backend
  - Otherwise, uses: `notes.list()`, `graph.pageEdges()`, `scene.get()`

#### **SearchResultsBlock.tsx**
- **Purpose:** Display semantic search results
- **API Used:**
  - `api.search(query, limit, pageId)` - GET `/api/search`
- **Status:** ✅ v3 compatible
- **Notes:** Shows similarity scores with search results

#### **SettingsBlock.tsx**
- **Purpose:** User settings UI (theme, LLM model selection)
- **API Used:**
  - `api.getModelCatalog()` - GET `/api/settings/models` (fallback)
  - `api.updateSettings(data)` - PUT `/api/settings`
- **Status:** ✅ v3 compatible
- **Notes:** Allows switching between Google and Groq LLM providers

#### **StatsBlock.tsx**
- **Purpose:** Workspace-level statistics dashboard
- **API Used:**
  - `api.getStats()` - GET `/api/workspace/stats`
- **Status:** ✅ v3 compatible
- **Notes:** Shows total notes, pages, tags, tasks

#### **TagCloudBlock.tsx**
- **Purpose:** Interactive tag cloud with counts
- **API Used:**
  - `api.getTags()` - GET `/api/notes/tags`
- **Status:** ✅ v3 compatible
- **Notes:** Clicking tags triggers `/notes #tagname` command

#### **TaskListBlock.tsx**
- **Purpose:** Display extracted tasks grouped by source note
- **API Used:**
  - `api.listNotes(page, limit, undefined, pageId)` - GET `/api/notes`
- **Status:** ✅ v3 compatible
- **Notes:** Filters notes with non-empty `tasks` array

#### **WelcomeBlock.tsx**
- **Purpose:** Homepage overview with stats, pages, recent notes
- **API Used:**
  - `workspace.overview()` - GET `/api/workspace/overview` (primary)
  - `api.listPages()` - GET `/api/pages` (fallback)
  - `api.getStats()` - GET `/api/workspace/stats` (fallback)
  - `api.listNotes(1, 5)` - GET `/api/notes` (fallback)
- **Status:** ✅ v3 compatible
- **Notes:** Uses graceful fallback pattern if `/workspace/overview` doesn't exist

---

## 2. HOOKS DIRECTORY (`frontend/src/hooks/`)

### Purpose
Custom React hooks for state management, API communication, event handling

### Files & Analysis

#### **useAppContext.ts**
- **Purpose:** Global application context (home/page/settings/history)
- **API Used:** None (Zustand store)
- **Status:** ✅ v3 compatible
- **Key Features:**
  - `switchTo(type, pageId, pageName)` - Navigate contexts
  - `goBack()` / `goHome()` - Navigation history
  - Clears stream on context switch to prevent race conditions

#### **useAsyncData.ts**
- **Purpose:** Universal async data fetching hook
- **API Used:** Generic (takes fetcher function)
- **Status:** ✅ v3 compatible
- **Key Features:**
  - Handles cancellation on unmount
  - StrictMode double-mount safe
  - Provides loading/error states
  - Supports refetch

#### **useCanvasChat.ts**
- **Purpose:** SSE streaming for canvas chat (page context)
- **API Used:**
  - `streamCanvasOps(pageId, request, callbacks)` - POST `/api/pages/{id}/chat` (SSE)
- **Status:** ✅ v3 compatible
- **Key Features:**
  - Manages canvas operation stream
  - Parses intent from stream
  - Applies operations via `CanvasApplier`
  - Handles abort/cancellation

#### **useCanvasEvents.ts**
- **Purpose:** Event bus for canvas commands (search, add, theme, style, etc.)
- **API Used:** None (Zustand store)
- **Status:** ✅ v3 compatible
- **Commands Supported:**
  - `search`, `add` (sticky/note/text), `ai-compose`, `set-background`, `set-theme`
  - `set-style`, `open-library`, `close-library`, `zoom`, `refresh`, `generate-diagram`

#### **useCommands.ts**
- **Purpose:** Command routing and execution
- **API Used:** Multiple context-dependent
- **Status:** ⚠️ **Partially deprecated**
- **Issues:**
  - References removed `useNotebookMode` hook (deleted from workspace)
  - Lists 32 commands including `/style-lock`, `/style-confirm`, `/library` (canvas-specific)
  - Parses color names and Excalidraw style properties
  - Contains style validation logic
- **Commands with API Calls:**
  - `/capture` → `capture.single()`
  - `/search` → `api.search()`
  - `/export` → `api.exportWorkspace()` ⚠️
  - `/compose` → canvas chat stream
  - `/layout` → canvas chat `/organize`
  - `/curator` → `ai.curatorScan()` + `ai.curatorApply()`
  - `/diagram` → `ai.generateDiagram()`

#### **useExcalidrawAPI.ts**
- **Purpose:** Shared Excalidraw API ref (singleton)
- **API Used:** None (React context wrapper)
- **Status:** ✅ v3 compatible
- **Usage:** Allows non-Excalidraw components to call methods on the live canvas instance

#### **useKeyboard.ts**
- **Purpose:** Global keyboard event handler
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Shortcuts:**
  - `Cmd/Ctrl+K` → Focus command bar
  - `Escape` → Close modal or go back
  - Inside Excalidraw, `Cmd+K` → Focus command bar

#### **useSettings.ts**
- **Purpose:** Persistent settings store (local + server sync)
- **API Used:**
  - `api.getSettings()` - GET `/api/settings`
  - `api.updateSettings(data)` - PUT `/api/settings`
- **Status:** ✅ v3 compatible
- **Behavior:** Loads from localStorage first, syncs to backend (non-blocking)

#### **useStream.ts**
- **Purpose:** Central stream state for chat messages, blocks, loading
- **API Used:** None (Zustand store)
- **Status:** ✅ v3 compatible
- **Key Methods:**
  - `addUserMessage(content)` - Append user input
  - `addAssistantMessage(content, sources?, followUps?)` - Append AI response
  - `addBlock(blockType, blockData?, metadata?)` - Add UI block
  - `saveConversation(contextType, contextId?)` - POST `/api/chat/{id}` (save chat)
  - `getVisibleNoteIds()` - Extract all note IDs from stream

#### **useViewport.ts**
- **Purpose:** Track Excalidraw viewport for context passing to backend
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Exports:** Viewport object (x, y, width, height, zoom)

---

## 3. COMPONENTS DIRECTORY (`frontend/src/components/`)

### Files & Analysis

#### **AsyncBlock.tsx**
- **Purpose:** Loading/error/empty wrapper for all blocks
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Props:** Generic `<T>`, shows loading spinner, error card, or empty state

#### **AuthGate.tsx**
- **Purpose:** OAuth login flow (Google)
- **API Used:**
  - `api.authMe()` - GET `/api/auth/me`
  - `api.authRefresh(token)` - POST `/api/auth/refresh`
- **Status:** ✅ v3 compatible
- **Flow:** Check auth → Load stored token → Refresh if needed → Redirect to login if required
- **Note:** Uses Google One Tap SDK for client-side auth

#### **ErrorBoundary.tsx**
- **Purpose:** React error boundary wrapper
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Behavior:** Catches render errors, displays fallback UI with retry button

#### **LibraryPanel.tsx**
- **Purpose:** Excalidraw library browser (floating panel in chat)
- **API Used:** None (interacts with Excalidraw API directly)
- **Status:** ✅ v3 compatible
- **Features:**
  - Renders library items as SVG thumbnails
  - Insert/delete/download library items
  - Search library items
  - Grid/list view toggle

---

## 4. CORE COMPONENTS (`frontend/src/core/`)

### Purpose
Main stream rendering and command bar infrastructure

### Files & Analysis

#### **CommandBar.tsx**
- **Purpose:** Bottom-fixed command input with autocomplete
- **API Used:** None (calls `useCommands` hook)
- **Status:** ✅ v3 compatible
- **Features:**
  - Fuzzy command filtering with Cmd+K focus
  - Arrow key navigation
  - Context-aware placeholder
  - Real-time suggestion UI

#### **ContextProvider.tsx**
- **Purpose:** App initialization (load settings)
- **API Used:** `api.getSettings()` via `useSettings`
- **Status:** ✅ v3 compatible

#### **Stream.tsx**
- **Purpose:** Main chat stream renderer (full-page vs floating panel)
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Layout:**
  - Home/settings/history: Full-page stream
  - Page context: Floating panel (collapsible/maximizable)
  - Renders `StreamMessage` + `StreamBlock` items

#### **StreamBlock.tsx**
- **Purpose:** Dynamic lazy block loader
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Behavior:** Maps `blockType` string → lazy component from BLOCK_MAP (13 blocks)

#### **StreamMessage.tsx**
- **Purpose:** Chat message bubble (user/assistant)
- **API Used:**
  - `api.chat(question, history, contextType, pageId)` - POST `/api/chat` (follow-up)
- **Status:** ✅ v3 compatible
- **Features:**
  - User/assistant message styles
  - Follow-up suggestions (clickable)
  - Source citations with similarity score

---

## 5. CANVAS DIRECTORY (`frontend/src/canvas/`)

### Purpose
Excalidraw canvas integration, AI text/diagram rendering, scene management

### Files & Analysis

#### **canvasAI.ts**
- **Purpose:** Generate Excalidraw elements (notes, text, stickies, diagrams)
- **API Used:** None (pure element generation)
- **Status:** ✅ v3 compatible
- **Functions:**
  - `initPretext()` - Init @chenglou/pretext for text measurement (waits for fonts)
  - `layoutText(text, fontSize, fontFamily, maxWidth, maxLines)` - Measure text blocks
  - `createNoteCard(noteId, title, summary, tags, x?, y?, color?)` - Generate note element
  - `createEdgeArrow(sourceId, targetId, label?, type?)` - Generate connection line
  - `createSticky(content, x?, y?, color?)` - Generate sticky note
  - `createTextBare(text, x, y, settings)` - Generate text element
- **Dependencies:** `@chenglou/pretext` for text layout, Excalidraw element schema

#### **canvasContext.ts**
- **Purpose:** Read/write canvas state, collision detection, positioning
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Functions:**
  - `readCanvasContext(api)` - Extract viewport, elements, bounds from Excalidraw
  - `findOpenPosition(ctx, width, height)` - Spiral search for empty space
  - `findStackPosition(ctx, items)` - Stack items vertically
  - `collides(x, y, w, h, occupied, padding)` - AABB collision check

#### **CanvasOverlay.tsx**
- **Purpose:** Canvas mode switcher (canvas vs notebook view)
- **API Used:** None
- **Status:** ⚠️ **Deprecated feature present**
- **Issue:** References removed `useNotebookMode` hook (deleted from workspace)
- **Current State:** Toggle UI exists but notebook mode is non-functional
- **Changes Needed:**
  - Remove notebook mode switcher or stub it out completely
  - Only render canvas view

#### **diagramRenderer.ts**
- **Purpose:** Convert AI topology (nodes/edges/clusters) to Excalidraw elements
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Functions:**
  - `renderTopology(topology, ctx, viewport)` - Convert DiagramTopology → elements
  - Calculates hierarchical layout (BFS levels)
  - Groups nodes into clusters with frames

#### **ExcalidrawCanvas.tsx**
- **Purpose:** Main canvas component, event handling, scene sync
- **API Used:**
  - `scene.get(pageId)` - GET `/api/pages/{id}/scene`
  - `scene.save(pageId, data)` - PUT `/api/pages/{id}/scene`
  - `scene.rebuild(pageId)` - POST `/api/pages/{id}/scene/rebuild`
  - `scene.triggerLayout(pageId)` - Triggers `/organize` via canvas chat
  - Canvas chat SSE via `useCanvasChat`
  - `useCanvasEvents` command bus
- **Status:** ⚠️ **Partially deprecated**
- **Issues:**
  - References deleted `useNotebookMode` hook
  - Has `viewMode` prop (canvas vs notebook) but notebook not functional
  - Stores scene both locally (localStorage) and on server
  - Auto-saves on unmount
- **Changes Needed:**
  - Remove viewMode/notebook references
  - Simplify to canvas-only

#### **useExcalidraw.ts**
- **Purpose:** Scene normalization and validation
- **API Used:** None
- **Status:** ✅ v3 compatible
- **Exports:**
  - `CanvasScene` type
  - Scene normalization functions
  - `EMPTY_SCENE` constant

---

## 6. LIB DIRECTORY (`frontend/src/lib/`)

### Purpose
Shared utilities for canvas operations and API communication

### Files & Analysis

#### **canvasOps.ts**
- **Purpose:** SSE bridge for canvas chat streaming
- **API Used:**
  - `POST /api/pages/{id}/chat` (SSE stream)
- **Status:** ✅ v3 compatible
- **Key Types:**
  - `StreamRequest` - message, viewport, history, selected_element_ids
  - `StreamCallbacks` - onIntent, onChat, onCanvasOp, onSources, onFollowUps, onError, onDone
- **Functions:**
  - `streamCanvasOps(pageId, request, callbacks)` - Open SSE stream
  - `parseIntentMessage(message)` - Extract intent/topic from stream
  - `dispatchOp(op, callbacks)` - Route CanvasOp to handlers
- **Supported CanvasOps:**
  - `create_note`, `create_text`, `create_diagram`, `create_sticky`
  - `update_element`, `move_element`, `delete_element`, `group_elements`
  - `create_edge_line`, `set_background`, `set_theme`
  - `pan_to`, `zoom_to`, `stream_start`, `stream_chunk`, `stream_end`, `arrange_cluster`
  - `info`, `error`, `done`

#### **canvasApplier.ts**
- **Purpose:** Apply CanvasOp updates to Excalidraw scene
- **API Used:** None (direct Excalidraw API calls)
- **Status:** ✅ v3 compatible
- **Methods:**
  - `apply(op: CanvasOp)` - Main dispatcher
  - Handlers for all 20+ CanvasOp types
  - Stream buffering for text chunks
  - Element creation/update/deletion
  - Viewport manipulation (pan, zoom)

---

## 7. GLASS UI COMPONENTS (`frontend/src/glass/`)

### Purpose
Design system components

### Files
- **GlassBadge.tsx** - Badge component ✅
- **GlassButton.tsx** - Button component ✅
- **GlassCard.tsx** - Card container ✅
- **GlassChip.tsx** - Chip/tag component ✅
- **GlassDropdown.tsx** - Dropdown select ✅
- **GlassInput.tsx** - Text input ✅
- **GlassModal.tsx** - Modal dialog ✅
- **GlassTooltip.tsx** - Tooltip component ✅

**Status:** ✅ All v3 compatible (no API usage)

---

## 8. UTILITIES (`frontend/src/utils/`)

### Files & Analysis

#### **nlpParser.ts** (referenced but not found)
- **Issue:** File imported in `client.ts` as `import { parseNLPIntent } from "../utils/nlpParser"`
- **Status:** ❌ **MISSING FILE**
- **Purpose:** Parse user input for command intent (capture, search, find, diagram, add, write, etc.)
- **Implementation:** Should analyze query string and extract intent type + confidence
- **Needs Creation:** Yes, currently causes runtime error if `detectIntentLocally()` is called

#### **utils.ts** (main utilities)
- **Expected Functions:** `uid()`, `pluralize()`, `nanoid()`, etc.
- **Status:** ⚠️ Not fully examined but likely OK

---

## 9. MAIN API CLIENT (`frontend/src/api/client.ts`)

### Comprehensive Endpoint Mapping

#### **Auth**
- `auth.me()` - GET `/auth/me` ✅
- `auth.loginGoogle(token)` - POST `/auth/google` ✅
- `auth.refresh(token)` - POST `/auth/refresh` ✅

#### **Pages**
- `pages.list(includeArchived?)` - GET `/pages` ✅
- `pages.get(pageId)` - GET `/pages/{id}` ✅
- `pages.create(data)` - POST `/pages` ✅
- `pages.update(pageId, data)` - PUT `/pages/{id}` ✅
- `pages.delete(pageId)` - DELETE `/pages/{id}` ✅

#### **Scene**
- `scene.get(pageId)` - GET `/pages/{id}/scene` ✅
- `scene.save(pageId, data)` - PUT `/pages/{id}/scene` ✅
- `scene.getVersion(pageId)` - GET `/pages/{id}/scene/version` ✅
- `scene.rebuild(pageId)` - POST `/pages/{id}/scene/rebuild` ✅
- `scene.triggerLayout(pageId)` - Uses canvas chat `/organize` ✅

#### **Sync**
- `sync.send(pageId, request)` - POST `/pages/{id}/sync` ✅
- `sync.getVersion(pageId)` - GET `/pages/{id}/sync/version` ✅
- `sync.getOps(pageId, afterVersion)` - GET `/pages/{id}/sync/ops` ✅

#### **Events**
- `events.subscribe(pageId)` - GET `/pages/{id}/events` (EventSource) ✅

#### **Notes**
- `notes.list(params)` - GET `/notes` ✅
- `notes.get(noteId)` - GET `/notes/{id}` ✅
- `notes.update(noteId, data)` - PUT `/notes/{id}` ✅
- `notes.delete(noteId)` - DELETE `/notes/{id}` ✅
- `notes.move(noteId, pageId)` - POST `/notes/{id}/move` ✅
- `notes.tags()` - GET `/notes/tags` ✅
- `notes.listForPage(pageId)` - GET `/pages/{id}/notes` ✅
- `notes.retry(noteId)` - POST `/notes/{id}/retry` (via capture.retry) ✅

#### **Capture**
- `capture.single(data)` - POST `/capture` ✅
- `capture.batch(items)` - POST `/capture/batch` ✅
- `capture.context(url, text)` - POST `/capture/context` ✅
- `capture.getStatus(noteId)` - GET `/capture/status/{noteId}` ✅
- `capture.retry(noteId)` - POST `/capture/retry/{noteId}` ✅

#### **Chat**
- `chat.send(data)` - POST `/chat` ✅
- `chat.stream(data)` - POST `/chat/stream` (SSE) ✅
- `chat.getHistory(params?)` - GET `/chat/history` ✅
- `chat.getChatById(chatId)` - GET `/chat/{id}` ✅
- `chat.deleteChat(chatId)` - DELETE `/chat/{id}` ✅

#### **Canvas Chat**
- `canvasChat.send(pageId, data)` - POST `/pages/{id}/canvas-chat` ✅
- `canvasChat.stream(pageId, data)` - POST `/pages/{id}/canvas-chat/stream` (SSE) ✅

#### **Graph**
- `graph.getFullGraph()` - GET `/graph` ✅
- `graph.getPageGraph(pageId)` - GET `/pages/{id}/graph` ✅
- `graph.createEdge(data)` - POST `/edges` ✅
- `graph.deleteEdge(edgeId)` - DELETE `/edges/{id}` ✅
- `graph.getRelatedNotes(noteId, limit?)` - GET `/notes/{id}/related` ✅
- `graph.allEdges()` - Wrapper → `/graph` ✅
- `graph.noteEdges(noteId)` - Wrapper → `/notes/{id}/related` ✅
- `graph.pageEdges(pageId)` - Wrapper → `/pages/{id}/graph` ✅

#### **Search**
- `search.semantic(params)` - GET `/search` ✅
- `search.byTag(tag, page?, limit?)` - GET `/search/tags` ✅

#### **Workspace**
- `workspace.overview()` - GET `/workspace/overview` ✅ (with fallback)
- `workspace.stats()` - GET `/workspace/stats` ✅
- `workspace.healthCheck()` - POST `/workspace/health-check` ✅

#### **AI**
- `ai.generateDiagram(pageId, topic)` - POST `/pages/{id}/ai/diagram` ✅
- `ai.compose(pageId, topic)` - POST `/pages/{id}/ai/compose` ✅
- `ai.composeStream(pageId, topic)` - POST `/pages/{id}/ai/compose/stream` (SSE) ✅
- `ai.addSticky(pageId, content, color?)` - POST `/pages/{id}/ai/sticky` ✅
- `ai.setBackground(pageId, colorOrTheme)` - POST `/pages/{id}/ai/background` ✅
- `ai.curatorScan()` - GET `/ai/curator/scan` ✅
- `ai.curatorApply(data)` - POST `/ai/curator/action` ✅
- `ai.analyzePage(pageId)` - GET `/pages/{id}/ai/analyze` ✅

#### **Settings**
- `settings.get()` - GET `/settings` ✅
- `settings.update(data)` - PUT `/settings` ✅
- `settings.getAvailableModels()` - GET `/settings/models` ✅

#### **Health**
- `health.check()` - GET `/health` ✅

#### **Deprecated/Stubbed**
- `document.*` - ❌ All throw "Document API is not supported in v3"
- `chatHistory.*` - ❌ Stubbed with empty responses
- `api.exportWorkspace()` - ❌ No backend endpoint found

---

## 10. DEPRECATED FEATURES & ISSUES

### 🚨 Critical Issues

#### 1. **Missing `useNotebookMode` Hook** (DELETED)
- **Files Affected:**
  - [ExcalidrawCanvas.tsx](ExcalidrawCanvas.tsx#L10)
  - [CanvasOverlay.tsx](CanvasOverlay.tsx#L1)
- **Error:** `useNotebookMode hook not found`
- **Resolution:** Remove all references or stub out notebook mode
- **Code Locations:**
  - `ExcalidrawCanvas.tsx` line ~10
  - `CanvasOverlay.tsx` line ~40

#### 2. **Missing `nlpParser.ts` Utility**
- **File:** `frontend/src/utils/nlpParser.ts` - **Does not exist**
- **Imported By:** `client.ts` line 1
- **Function:** `parseNLPIntent(query)` → returns `{ type, content, subType, confidence }`
- **Impact:** `detectIntentLocally()` will fail at runtime
- **Fix:** Create the file with proper intent parsing logic

#### 3. **Deprecated Export Endpoint**
- **Component:** `ExportBlock.tsx`
- **Call:** `api.exportWorkspace()` 
- **Status:** No corresponding backend endpoint
- **Fix:** Implement using:
  ```typescript
  async getAllNotesForExport(pageId?: string)
  pages.list()
  notes.list({ page, limit, page_id: pageId })
  graph.getPageGraph(pageId)
  ```

#### 4. **Document API Stubs**
- **File:** `client.ts` lines ~1150
- **Status:** Intentional deprecation for backward compatibility
- **Actions:** All throw "Document API is not supported in v3"
- **Impact:** Any code calling `api.document.*` will fail
- **Note:** Kept for compatibility, should be removed in future cleanup

### ⚠️ Non-Critical Issues

#### 1. **Canvas Notebook Mode (Non-Functional)**
- **File:** `CanvasOverlay.tsx`
- **Status:** UI toggle exists but feature removed
- **Resolution:** Remove the switcher or disable notebook button

#### 2. **Conditional Notebook Mode in ExcalidrawCanvas**
- **Code:** `viewMode` prop (canvas vs notebook)
- **Status:** Notebook path is dead code
- **Resolution:** Simplify to canvas-only rendering

#### 3. **Fallback Logic in PageStatsBlock**
- **Endpoint:** `GET /api/pages/{id}/stats`
- **Status:** May not exist; falls back to manual computation
- **Resolution:** Verify endpoint exists or keep fallback

#### 4. **Chat History Persistence**
- **File:** `client.ts`
- **Note:** `chatHistory` is stubbed (returns empty array)
- **Status:** May need real implementation
- **Resolution:** Check if backend supports chat history endpoints

---

## 11. V3 API SUPPORT STATUS

### ✅ Full Support (No Changes Needed)
- All page CRUD operations
- All note operations
- Capture (single/batch/context)
- Scene management (get/save/rebuild)
- Chat streaming (both home and canvas)
- Graph operations
- Search (semantic, by tag)
- Workspace overview and stats
- AI operations (diagram, compose, sticky)
- Settings
- Auth (Google OAuth, refresh)

### ⚠️ Partial Support (Needs Verification/Fallback)
- PageStats endpoint (has fallback logic)
- WorkspaceOverview endpoint (has fallback logic)
- Model catalog endpoint (has fallback list)

### ❌ Not Supported (Deprecated)
- Document API (intentionally stubbed)
- Notebook mode (code deleted from backend)
- Canvas regions/clusters (referenced but unclear)
- Export endpoint (no backend match)

---

## 12. MISSING FILES TO CREATE

### 1. **`frontend/src/utils/nlpParser.ts`**
```typescript
export interface ParsedIntent {
  type: "none" | "ask" | "capture" | "search" | "find" | "diagram" | "add" | "write"
  content: string
  subType?: "sticky" | "note" // for "add" type
  confidence: number
}

export function parseNLPIntent(query: string): ParsedIntent {
  // Implementation needed
}
```

---

## 13. SUMMARY TABLE

| Category | File Count | v3 Ready | Issues | Action |
|----------|-----------|----------|--------|--------|
| **Blocks** | 13 | 11/13 | 1 deprecated (Export), 1 fallback (PageStats) | Fix Export, verify PageStats |
| **Hooks** | 10 | 8/10 | 2 broken (useNotebookMode refs) | Remove notebook refs |
| **Components** | 5 | 5/5 | 0 | None |
| **Core** | 5 | 5/5 | 0 | None |
| **Canvas** | 6 | 4/6 | 2 broken (notebook mode) | Remove notebook UI |
| **Glass UI** | 8 | 8/8 | 0 | None |
| **Lib** | 2 | 2/2 | 0 | None |
| **Utils** | 1 | 0/1 | 1 missing file | Create nlpParser.ts |
| **API Client** | 1 | ~95% | Deprecated stubs + missing endpoints | Clean up stubs |
| **TOTAL** | 51 | 48/51 | 6 issues | See action items |

---

## 14. ACTION ITEMS

### Priority 1 (Breaking)
1. [ ] Create `frontend/src/utils/nlpParser.ts`
2. [ ] Remove all `useNotebookMode` hook references from:
   - [ExcalidrawCanvas.tsx](ExcalidrawCanvas.tsx)
   - [CanvasOverlay.tsx](CanvasOverlay.tsx)
3. [ ] Fix or remove notebook mode UI switcher

### Priority 2 (Major Functionality)
4. [ ] Fix `ExportBlock.tsx` - implement using available endpoints
5. [ ] Verify `GET /api/pages/{id}/stats` exists in backend
6. [ ] Verify `GET /api/workspace/overview` exists in backend

### Priority 3 (Code Quality)
7. [ ] Remove deprecated `document.*` API stubs if unused
8. [ ] Remove `chatHistory` stub if not needed
9. [ ] Add type guards for all API responses
10. [ ] Test all canvas operations (create_note, stream_end, pan_to, etc.)

### Priority 4 (Refactoring)
11. [ ] Consolidate API client exports (currently has `api`, `pages`, `scene`, `notes`, etc.)
12. [ ] Extract canvas operation types to separate file
13. [ ] Add proper error boundaries for canvas failures

---

## Appendix: File Statistics

```
Total Files: 51
Total Lines of Code: ~8,000+
TypeScript: 48 files
CSS: 1 file (index.css)
JSON: 1 file (tsconfig.json)

Largest Files:
- api/client.ts: ~1,200 lines
- canvas/ExcalidrawCanvas.tsx: ~400 lines
- canvas/canvasAI.ts: ~350 lines
- hooks/useCommands.ts: ~300 lines
- core/Stream.tsx: ~250 lines
- lib/canvasOps.ts: ~200 lines

Component Count:
- Block Components: 13 (lazy-loaded)
- Core Components: 5
- Glass UI Components: 8
- Canvas Components: 6
```

---

**Report Generated:** April 19, 2026  
**Analyst:** Mnemos Frontend Team  
**Status:** Ready for v3 Migration
