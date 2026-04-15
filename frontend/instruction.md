# Mnemos Frontend Refactor — Complete Instructions & Context

## 1. What Changed and Why

The backend was completely rewritten. Here's what the frontend developer needs to understand:

### The Three Problems That Were Fixed

```
BEFORE (broken):
  Note has canvas_x/y → synced to scene → synced back to DB → drift, races
  
AFTER (clean):
  Scene JSON = single source of truth for ALL positions
  Element Registry = cached index for queries (secondary, derived)
  Notes have NO position fields
```

```
BEFORE: GET /pages/{id} returned multi-MB canvas_data blob with page metadata
AFTER:  GET /pages/{id} returns lightweight metadata only
        GET /pages/{id}/scene returns scene data separately
```

```
BEFORE: AI was blind — no awareness of canvas appearance
AFTER:  Visual context extracted on every save — AI reads layout pattern, theme, density
```

---

## 2. Complete API Endpoint Map

### Removed Endpoints
```
❌ DELETE  /canvas/elements/{id}          → use /pages/{id}/elements/{id}
❌ GET     /canvas/elements/page/{id}     → use /pages/{id}/elements
❌ POST    /canvas/stream/{id}            → use /pages/{id}/chat
❌ GET     /clusters                      → use /pages/{id}/regions
❌ POST    /clusters                      → use /pages/{id}/regions
❌ PUT     /clusters/{id}                 → use /pages/{id}/regions/{id}
❌ DELETE  /clusters/{id}                 → use /pages/{id}/regions/{id}
❌ GET     /edges                         → use /graph/edges
❌ POST    /edges                         → use /graph/edges
❌ DELETE  /edges/{id}                    → use /graph/edges/{id}
❌ POST    /notes/{id}/sync-to-canvas     → REMOVED (scene is authority now)
❌ POST    /pages/{id}/sync-notes-canvas  → use /pages/{id}/sync-notes
```

### New/Changed Endpoints

```yaml
# ── Pages (lightweight metadata only) ──
GET    /pages                              # list pages (no scene data!)
POST   /pages                              # create page
GET    /pages/{id}                         # page metadata only
PUT    /pages/{id}                         # update metadata
DELETE /pages/{id}                         # delete page

# ── Scene (separated — large payload) ──
GET    /pages/{id}/scene                   # ⭐ NEW: returns {page, scene_data, notes, edges, regions, visual_context, viewport}
PUT    /pages/{id}/scene                   # ⭐ NEW: save scene {elements, appState, files}
PUT    /pages/{id}/viewport                # ⭐ NEW: save viewport {scroll_x, scroll_y, zoom}
GET    /pages/{id}/visual-context          # ⭐ NEW: get visual analysis

# ── Canvas Operations ──
GET    /pages/{id}/elements                # ⭐ NEW: element registry
GET    /pages/{id}/elements/{eid}          # ⭐ NEW: single element
DELETE /pages/{id}/elements/{eid}          # ⭐ NEW: delete element
POST   /pages/{id}/layout                  # trigger AI layout
POST   /pages/{id}/sync-notes             # re-sync all notes to scene

# ── Regions (replace clusters) ──
GET    /pages/{id}/regions                 # ⭐ NEW: list regions
POST   /pages/{id}/regions                 # ⭐ NEW: create region
PUT    /pages/{id}/regions/{rid}           # ⭐ NEW: update region
DELETE /pages/{id}/regions/{rid}           # ⭐ NEW: delete region
POST   /pages/{id}/regions/{rid}/assign/{eid}    # ⭐ NEW
POST   /pages/{id}/regions/{rid}/unassign/{eid}  # ⭐ NEW

# ── Canvas Chat (SSE) ──
POST   /pages/{id}/chat                   # ⭐ MOVED from /canvas/stream/{id}

# ── Notes (no canvas positions) ──
GET    /notes                              # list (unchanged)
GET    /notes/{id}                         # get (no canvas_x/y in response!)
PUT    /notes/{id}                         # update (no canvas_x/y in payload!)
DELETE /notes/{id}                         # delete
POST   /notes/{id}/retry                   # retry processing
POST   /notes/{id}/move                    # move to different page
GET    /tags                               # all tags

# ── Capture ──
POST   /capture                            # unchanged
POST   /capture/batch                      # ⭐ NEW: batch capture

# ── Chat ──
POST   /chat                               # home chat (unchanged)

# ── Graph (replaces /edges and /clusters) ──
GET    /graph/edges                        # ⭐ MOVED from /edges
GET    /graph/edges/note/{id}              # edges for a note
GET    /graph/edges/page/{id}              # edges for a page
POST   /graph/edges                        # ⭐ MOVED from /edges
DELETE /graph/edges/{id}                   # ⭐ MOVED from /edges/{id}
GET    /graph/full                         # ⭐ NEW: full knowledge graph {nodes, edges}

# ── Search ──
GET    /search?q=...&page_id=...           # vector search
GET    /search/tags?tags=a,b               # ⭐ NEW: tag search

# ── Workspace ──
GET    /workspace/overview                 # ⭐ MOVED from various
GET    /workspace/stats                    # ⭐ NEW: system stats

# ── AI ──
POST   /ai/curator/scan                   # curator scan
POST   /ai/curator/apply                  # apply curator action
POST   /ai/analyze/page/{id}              # ⭐ NEW: full page analysis
POST   /ai/retry-stuck                    # retry stuck notes

# ── Document (notebook mode) ──
GET    /pages/{id}/document                # get document + blocks
PUT    /pages/{id}/document                # update document settings
GET    /pages/{id}/blocks                  # list blocks
POST   /pages/{id}/blocks                  # create block
PUT    /pages/{id}/blocks/{bid}            # update block
DELETE /pages/{id}/blocks/{bid}            # delete block
POST   /pages/{id}/blocks/{bid}/move       # move block
POST   /pages/{id}/blocks/rebalance        # rebalance order keys
GET    /pages/{id}/blocks/{bid}/references  # block references
POST   /pages/{id}/blocks/{bid}/references  # create reference
DELETE /pages/{id}/references/{rid}         # delete reference
GET    /pages/{id}/blocks/{bid}/embeds      # inline embeds
POST   /pages/{id}/blocks/{bid}/embeds      # create embed
DELETE /pages/{id}/embeds/{eid}             # delete embed

# ── Settings ──
GET    /settings
PUT    /settings

# ── Health ──
GET    /health
```

---

## 3. Data Shape Changes

### Page Object (Lighter)
```typescript
// BEFORE
interface Page {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  canvas_data: object;       // ❌ REMOVED — multi-MB blob
  notebook_data: object;     // ❌ REMOVED
  note_count: number;        // ❌ REMOVED — was stale
  viewport: object;          // ❌ REMOVED — per-user now
  layout_mode: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// AFTER
interface Page {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  layout_mode: 'canvas' | 'notebook';
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // NO canvas_data, NO viewport, NO note_count
}
```

### Note Object (No Positions)
```typescript
// BEFORE
interface Note {
  id: string;
  raw_text: string;
  title?: string;
  summary?: string;
  tags: string[];
  tasks: string[];
  entities: string[];
  canvas_x?: number;         // ❌ REMOVED
  canvas_y?: number;         // ❌ REMOVED
  canvas_width?: number;     // ❌ REMOVED
  canvas_height?: number;    // ❌ REMOVED
  cluster_id?: string;       // ❌ REMOVED
  related_note_ids: string[];// ❌ REMOVED
  embedding: number[];       // ❌ REMOVED (separate table)
  centrality?: number;       // ❌ REMOVED
  is_bridge?: boolean;       // ❌ REMOVED
  page_id?: string;
  content_type: string;
  source_url?: string;
  page_title?: string;       // ❌ RENAMED
  processing_status: string;
  // ...
}

// AFTER
interface Note {
  id: string;
  raw_text: string;
  title?: string;
  summary?: string;
  tags: string[];
  tasks: string[];
  entities: string[];
  content_type: 'note' | 'code' | 'url' | 'thought' | 'question' | 'clip';
  source_url?: string;
  source_title?: string;     // renamed from page_title
  capture_type: string;
  processing_status: 'pending' | 'processing' | 'done' | 'failed';
  page_id?: string;
  metadata: object;
  created_at: string;
  updated_at: string;
  // NO positions, NO embedding, NO cluster_id, NO related_note_ids
}
```

### Scene Response (New Combined Payload)
```typescript
// GET /pages/{id}/scene returns EVERYTHING the canvas needs in one call
interface SceneResponse {
  page: Page;
  scene_data: {
    elements: ExcalidrawElement[];
    appState: Record<string, any>;
    files: Record<string, any>;
  };
  notes: Note[];                    // all notes for this page
  edges: Edge[];                    // all edges between page notes
  regions: Region[];                // ⭐ NEW (replaces clusters)
  visual_context: VisualContext;    // ⭐ NEW
  viewport: {                       // ⭐ per-user viewport
    scroll_x: number;
    scroll_y: number;
    zoom: number;
  };
}
```

### New Types
```typescript
// ⭐ Region (replaces Cluster)
interface Region {
  id: string;
  page_id: string;
  label?: string;
  description?: string;
  color?: string;
  region_type: 'cluster' | 'section' | 'timeline-segment' | 'comparison-column' | 'freeform';
  layout_hint: string;
  metadata: object;
  element_count?: number;     // enriched by API
  created_at: string;
  updated_at: string;
}

// ⭐ Visual Context (AI's view of the canvas)
interface VisualContext {
  page_id: string;
  background_color: string;
  theme: 'dark' | 'light';
  dominant_colors: string[];
  layout_pattern: 'freeform' | 'grid' | 'timeline' | 'mindmap' | 'flow' | 'columns';
  reading_direction: 'left-to-right' | 'top-to-bottom' | 'radial' | 'mixed';
  density: 'empty' | 'sparse' | 'moderate' | 'dense';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  element_count: number;
  last_analyzed?: string;
}

// ⭐ Element Registry Entry
interface ElementRegistryEntry {
  id: string;
  page_id: string;
  element_id: string;         // Excalidraw element ID
  element_type: string;       // 'note-card' | 'composed-text' | 'diagram-node' | etc.
  content_source: string;     // 'note' | 'ai-compose' | 'ai-diagram' | 'user-draw'
  note_id?: string;
  region_id?: string;
  cached_x?: number;
  cached_y?: number;
  cached_width?: number;
  cached_height?: number;
  style_snapshot: object;
}

// Edge (mostly unchanged, route changed)
interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: 'related' | 'depends_on' | 'extends' | 'contradicts' | 'summarizes' | 'example_of';
  label?: string;
  strength: number;
  created_by: string;
  created_at: string;
}

// Canvas Chat SSE Op (updated)
interface CanvasOp {
  op: string;
  element_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  theme?: string;
  zoom?: number;
  note?: Note;
  note_id?: string;
  elements?: object[];
  connections?: object[];
  operations?: CanvasOp[];
  topology?: object;
  message?: string;
  metadata?: object;
  timestamp: number;
}
```

---

## 4. API Client Rewrite

```typescript
// === FILE: src/lib/api.ts ===

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  // Add auth token if available
  const token = localStorage.getItem('mnemos_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Pages ──
export const pages = {
  list: (includeArchived = false) =>
    request<{ pages: Page[] }>(`/pages?include_archived=${includeArchived}`),

  get: (id: string) =>
    request<Page>(`/pages/${id}`),

  create: (data: { name: string; description?: string; icon?: string; color?: string; layout_mode?: string }) =>
    request<Page>('/pages', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Page>) =>
    request<Page>(`/pages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request<{ status: string }>(`/pages/${id}`, { method: 'DELETE' }),
};

// ── Scene (separate from page) ──
export const scene = {
  // ⭐ This is the main canvas load call — returns EVERYTHING
  get: (pageId: string) =>
    request<SceneResponse>(`/pages/${pageId}/scene`),

  save: (pageId: string, data: { elements: any[]; appState: object; files: object }) =>
    request<{ status: string }>(`/pages/${pageId}/scene`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  saveViewport: (pageId: string, data: { scroll_x: number; scroll_y: number; zoom: number }) =>
    request<{ status: string }>(`/pages/${pageId}/viewport`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getVisualContext: (pageId: string) =>
    request<VisualContext>(`/pages/${pageId}/visual-context`),

  triggerLayout: (pageId: string) =>
    request<{ status: string; positions: number; overlaps_resolved: number }>(
      `/pages/${pageId}/layout`, { method: 'POST' }
    ),

  syncNotes: (pageId: string) =>
    request<{ status: string }>(`/pages/${pageId}/sync-notes`, { method: 'POST' }),
};

// ── Canvas Elements & Regions ──
export const canvas = {
  listElements: (pageId: string) =>
    request<{ elements: ElementRegistryEntry[] }>(`/pages/${pageId}/elements`),

  deleteElement: (pageId: string, elementId: string) =>
    request<{ status: string }>(`/pages/${pageId}/elements/${elementId}`, { method: 'DELETE' }),

  listRegions: (pageId: string) =>
    request<{ regions: Region[] }>(`/pages/${pageId}/regions`),

  createRegion: (pageId: string, data: {
    label: string; description?: string; color?: string;
    region_type?: string; layout_hint?: string;
  }) =>
    request<Region>(`/pages/${pageId}/regions`, {
      method: 'POST',
      body: JSON.stringify({ page_id: pageId, ...data }),
    }),

  updateRegion: (pageId: string, regionId: string, data: Partial<Region>) =>
    request<Region>(`/pages/${pageId}/regions/${regionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRegion: (pageId: string, regionId: string) =>
    request<{ status: string }>(`/pages/${pageId}/regions/${regionId}`, { method: 'DELETE' }),

  assignToRegion: (pageId: string, regionId: string, elementId: string) =>
    request<{ status: string }>(
      `/pages/${pageId}/regions/${regionId}/assign/${elementId}`, { method: 'POST' }
    ),

  unassignFromRegion: (pageId: string, regionId: string, elementId: string) =>
    request<{ status: string }>(
      `/pages/${pageId}/regions/${regionId}/unassign/${elementId}`, { method: 'POST' }
    ),
};

// ── Notes ──
export const notes = {
  list: (params?: { page?: number; limit?: number; tag?: string; page_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.tag) query.set('tag', params.tag);
    if (params?.page_id) query.set('page_id', params.page_id);
    return request<{ notes: Note[]; total: number }>(`/notes?${query}`);
  },

  get: (id: string) => request<Note>(`/notes/${id}`),

  update: (id: string, data: {
    title?: string; summary?: string; tags?: string[];
    tasks?: string[]; entities?: string[]; page_id?: string; metadata?: object;
  }) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request<{ status: string }>(`/notes/${id}`, { method: 'DELETE' }),

  retry: (id: string) =>
    request<{ status: string }>(`/notes/${id}/retry`, { method: 'POST' }),

  move: (id: string, pageId: string) =>
    request<{ status: string }>(`/notes/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ page_id: pageId }),
    }),

  tags: () => request<{ tags: Array<{ name: string; count: number }> }>('/tags'),
};

// ── Capture ──
export const capture = {
  single: (data: {
    text: string; source_url?: string; source_title?: string;
    capture_type?: string; page_hint?: string; viewport?: object;
  }) =>
    request<{ status: string; note_id: string }>('/capture', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  batch: (items: Array<{ text: string; source_url?: string; page_hint?: string }>) =>
    request<{ status: string; count: number; notes: Array<{ note_id: string }> }>(
      '/capture/batch', { method: 'POST', body: JSON.stringify(items) }
    ),
};

// ── Graph ──
export const graph = {
  edges: () => request<{ edges: Edge[] }>('/graph/edges'),
  edgesForNote: (noteId: string) => request<{ edges: Edge[] }>(`/graph/edges/note/${noteId}`),
  edgesForPage: (pageId: string) => request<{ edges: Edge[] }>(`/graph/edges/page/${pageId}`),

  createEdge: (data: {
    source_id: string; target_id: string;
    edge_type?: string; label?: string; strength?: number;
  }) =>
    request<Edge>('/graph/edges', {
      method: 'POST',
      body: JSON.stringify({ created_by: 'user', ...data }),
    }),

  deleteEdge: (id: string) =>
    request<{ status: string }>(`/graph/edges/${id}`, { method: 'DELETE' }),

  full: () => request<{ nodes: any[]; edges: Edge[] }>('/graph/full'),
};

// ── Search ──
export const search = {
  query: (q: string, opts?: { page_id?: string; limit?: number; threshold?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.page_id) params.set('page_id', opts.page_id);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.threshold) params.set('threshold', String(opts.threshold));
    return request<{ results: any[]; count: number }>(`/search?${params}`);
  },

  byTags: (tags: string[]) =>
    request<{ results: Note[]; count: number }>(`/search/tags?tags=${tags.join(',')}`),
};

// ── Chat ──
export const chat = {
  home: (data: { question: string; history?: object[]; page_id?: string }) =>
    request<{ response: string; sources: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ context_type: 'home', ...data }),
    }),
};

// ── Canvas Chat (SSE) ──
export function canvasChat(
  pageId: string,
  message: string,
  options: {
    viewport?: { x: number; y: number; width: number; height: number; zoom: number };
    history?: object[];
    selectedElementIds?: string[];
    onOp: (op: CanvasOp) => void;
    onError?: (error: Error) => void;
    onDone?: () => void;
  }
): AbortController {
  const controller = new AbortController();

  const body = JSON.stringify({
    message,
    viewport: options.viewport,
    history: options.history || [],
    selected_element_ids: options.selectedElementIds || [],
    context_type: 'page',
  });

  fetch(`${API_BASE}/pages/${pageId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('mnemos_token')
        ? { Authorization: `Bearer ${localStorage.getItem('mnemos_token')}` }
        : {}),
    },
    body,
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`SSE error: ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const op = JSON.parse(line.slice(6)) as CanvasOp;
              if (op.op === 'done') {
                options.onDone?.();
              } else {
                options.onOp(op);
              }
            } catch {
              // skip malformed
            }
          }
        }
      }
      options.onDone?.();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        options.onError?.(err);
      }
    });

  return controller;
}

// ── Workspace ──
export const workspace = {
  overview: () =>
    request<{
      pages: Array<{
        id: string; name: string; icon: string; color: string;
        note_count: number; layout_mode: string; updated_at: string;
      }>;
      total_notes: number;
      total_pages: number;
      top_tags: Array<{ name: string; count: number }>;
    }>('/workspace/overview'),

  stats: () => request<{
    notes: number; pages: number; edges: number;
    stuck_notes: number; cache: object;
  }>('/workspace/stats'),
};

// ── AI ──
export const ai = {
  curatorScan: () => request<any>('/ai/curator/scan', { method: 'POST' }),
  curatorApply: (action_type: string, params: object) =>
    request<any>('/ai/curator/apply', {
      method: 'POST',
      body: JSON.stringify({ action_type, params }),
    }),
  analyzePage: (pageId: string) =>
    request<any>(`/ai/analyze/page/${pageId}`, { method: 'POST' }),
  retryStuck: () =>
    request<{ retrying: number }>('/ai/retry-stuck', { method: 'POST' }),
};

// ── Settings ──
export const settings = {
  get: () => request<any>('/settings'),
  update: (data: object) =>
    request<{ status: string }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ── Document ──
export const document = {
  get: (pageId: string) =>
    request<{ document: any; blocks: any[]; page: Page }>(`/pages/${pageId}/document`),

  updateSettings: (pageId: string, data: object) =>
    request<any>(`/pages/${pageId}/document`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  listBlocks: (pageId: string) =>
    request<{ blocks: any[] }>(`/pages/${pageId}/blocks`),

  createBlock: (pageId: string, data: {
    block_type?: string; text_content?: string;
    prev_block_id?: string; next_block_id?: string;
    depth?: number; attrs?: object; note_id?: string;
  }) =>
    request<any>(`/pages/${pageId}/blocks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBlock: (pageId: string, blockId: string, data: object) =>
    request<any>(`/pages/${pageId}/blocks/${blockId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteBlock: (pageId: string, blockId: string) =>
    request<{ status: string }>(`/pages/${pageId}/blocks/${blockId}`, { method: 'DELETE' }),

  moveBlock: (pageId: string, blockId: string, data: {
    prev_block_id?: string; next_block_id?: string;
  }) =>
    request<any>(`/pages/${pageId}/blocks/${blockId}/move`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  rebalance: (pageId: string) =>
    request<{ status: string }>(`/pages/${pageId}/blocks/rebalance`, { method: 'POST' }),
};
```

---

## 5. State Management Redesign

### Store Structure

```typescript
// === FILE: src/stores/types.ts ===

export interface MnemosState {
  // ── Workspace ──
  pages: Page[];
  pagesLoading: boolean;

  // ── Active Page ──
  activePage: Page | null;
  activePageId: string | null;

  // ── Scene (loaded separately, only for canvas mode) ──
  sceneData: { elements: any[]; appState: object; files: object } | null;
  sceneLoading: boolean;
  sceneDirty: boolean;                // unsaved changes
  sceneVersion: number;               // optimistic concurrency

  // ── Visual Context (AI's view) ──
  visualContext: VisualContext | null;

  // ── Viewport (per-user, per-page) ──
  viewport: { scroll_x: number; scroll_y: number; zoom: number };

  // ── Notes for active page ──
  pageNotes: Note[];
  pageEdges: Edge[];
  pageRegions: Region[];

  // ── All notes (for search, global views) ──
  notes: Note[];
  notesTotal: number;
  notesLoading: boolean;

  // ── Chat ──
  chatHistory: Array<{ role: string; content: string }>;
  chatLoading: boolean;

  // ── Canvas Chat ──
  canvasOps: CanvasOp[];              // operations from SSE stream
  canvasStreaming: boolean;

  // ── UI ──
  sidebarOpen: boolean;
  selectedNoteId: string | null;
  selectedElementIds: string[];
}
```

### Key Store Actions

```typescript
// === FILE: src/stores/pageStore.ts (pseudocode) ===

// ⭐ CRITICAL: Loading a canvas page is now TWO calls
// 1. Page metadata (fast, cached) — already loaded from list
// 2. Scene data (large, separate) — loaded when canvas opens

async function openCanvasPage(pageId: string) {
  // Step 1: Get scene + all related data in one call
  set({ sceneLoading: true, activePageId: pageId });

  const response = await scene.get(pageId);

  set({
    activePage: response.page,
    sceneData: response.scene_data,
    pageNotes: response.notes,
    pageEdges: response.edges,
    pageRegions: response.regions,
    visualContext: response.visual_context,
    viewport: response.viewport,
    sceneLoading: false,
    sceneDirty: false,
  });
}

// ⭐ CRITICAL: Scene saves are debounced and separate from page updates
async function saveScene(sceneData: { elements: any[]; appState: object; files: object }) {
  const pageId = get().activePageId;
  if (!pageId) return;

  set({ sceneDirty: false });

  await scene.save(pageId, sceneData);

  // Visual context will be updated server-side by VisualAnalyzer
  // Optionally refresh it:
  const ctx = await scene.getVisualContext(pageId);
  set({ visualContext: ctx });
}

// ⭐ Viewport saved separately (doesn't trigger visual analysis)
async function saveViewport(scrollX: number, scrollY: number, zoom: number) {
  const pageId = get().activePageId;
  if (!pageId) return;

  set({ viewport: { scroll_x: scrollX, scroll_y: scrollY, zoom } });
  await scene.saveViewport(pageId, { scroll_x: scrollX, scroll_y: scrollY, zoom });
}
```

---

## 6. Component Architecture

### Recommended Component Tree

```
src/
├── App.tsx
├── lib/
│   ├── api.ts                    # ⭐ Complete rewrite (above)
│   └── types.ts                  # ⭐ New type definitions
├── stores/
│   ├── workspaceStore.ts         # pages list, overview
│   ├── canvasStore.ts            # ⭐ scene, visual context, regions
│   ├── notesStore.ts             # notes CRUD
│   ├── chatStore.ts              # home + canvas chat
│   └── settingsStore.ts
├── pages/
│   ├── HomePage.tsx              # workspace overview
│   ├── CanvasPage.tsx            # ⭐ main canvas view
│   ├── NotebookPage.tsx          # document/notebook view
│   ├── GraphPage.tsx             # knowledge graph view
│   └── SettingsPage.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           # page list + navigation
│   │   ├── Header.tsx
│   │   └── CommandBar.tsx        # search + commands
│   ├── canvas/
│   │   ├── CanvasContainer.tsx   # ⭐ Excalidraw wrapper
│   │   ├── CanvasChat.tsx        # ⭐ SSE chat panel
│   │   ├── CanvasToolbar.tsx     # canvas-specific tools
│   │   ├── RegionPanel.tsx       # ⭐ NEW: manage regions
│   │   ├── VisualContextBadge.tsx# ⭐ NEW: show AI's view
│   │   └── NoteInspector.tsx     # selected note details
│   ├── notes/
│   │   ├── NoteCard.tsx
│   │   ├── NoteList.tsx
│   │   ├── NoteEditor.tsx
│   │   └── CaptureInput.tsx
│   ├── document/
│   │   ├── BlockEditor.tsx
│   │   ├── BlockRenderer.tsx
│   │   └── InlineEmbed.tsx
│   └── shared/
│       ├── TagBadge.tsx
│       ├── StatusIndicator.tsx
│       └── LoadingStates.tsx
```

---

## 7. Critical Component Changes

### CanvasContainer.tsx — The Big One

```typescript
// === FILE: src/components/canvas/CanvasContainer.tsx ===
// This is the most important component to get right.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { scene as sceneApi } from '@/lib/api';
import { useCanvasStore } from '@/stores/canvasStore';
import { debounce } from '@/lib/utils';

interface Props {
  pageId: string;
}

export function CanvasContainer({ pageId }: Props) {
  const {
    sceneData, viewport, sceneLoading,
    openCanvasPage, saveScene, saveViewport,
  } = useCanvasStore();

  const excalidrawRef = useRef<any>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ⭐ Load scene on mount (separate from page metadata)
  useEffect(() => {
    openCanvasPage(pageId);
  }, [pageId]);

  // ⭐ Debounced scene save — saves to /pages/{id}/scene
  const debouncedSave = useCallback(
    debounce(async (elements: any[], appState: any, files: any) => {
      await saveScene({ elements, appState, files });
    }, 2000),
    [pageId]
  );

  // ⭐ Debounced viewport save — saves to /pages/{id}/viewport
  const debouncedViewportSave = useCallback(
    debounce(async (scrollX: number, scrollY: number, zoom: number) => {
      await saveViewport(scrollX, scrollY, zoom);
    }, 1000),
    [pageId]
  );

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      // Save scene (debounced)
      debouncedSave(
        elements.map(el => ({ ...el })),  // deep copy
        {
          viewBackgroundColor: appState.viewBackgroundColor,
          theme: appState.theme,
          // ⭐ Don't save UI state like selectedElementIds, cursor position
        },
        files
      );

      // Save viewport separately (debounced)
      if (appState.scrollX !== undefined) {
        debouncedViewportSave(
          appState.scrollX,
          appState.scrollY,
          appState.zoom?.value || 1,
        );
      }
    },
    [debouncedSave, debouncedViewportSave]
  );

  if (sceneLoading || !sceneData) {
    return <div className="flex-1 flex items-center justify-center">Loading canvas...</div>;
  }

  return (
    <div className="flex-1 relative">
      <Excalidraw
        ref={excalidrawRef}
        initialData={{
          elements: sceneData.elements,
          appState: {
            ...sceneData.appState,
            // ⭐ Restore per-user viewport
            scrollX: viewport.scroll_x,
            scrollY: viewport.scroll_y,
            zoom: { value: viewport.zoom },
          },
          files: sceneData.files,
        }}
        onChange={handleChange}
        // ... other Excalidraw props
      />
    </div>
  );
}
```

### CanvasChat.tsx — SSE Stream Handler

```typescript
// === FILE: src/components/canvas/CanvasChat.tsx ===

import { useState, useRef, useCallback } from 'react';
import { canvasChat, type CanvasOp } from '@/lib/api';
import { useCanvasStore } from '@/stores/canvasStore';

interface Props {
  pageId: string;
  excalidrawAPI: any;
}

export function CanvasChat({ pageId, excalidrawAPI }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const { openCanvasPage } = useCanvasStore();

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming) return;

    const message = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setStreaming(true);
    setStreamText('');

    // Get current viewport from Excalidraw
    const appState = excalidrawAPI?.getAppState?.();
    const viewport = appState ? {
      x: appState.scrollX || 0,
      y: appState.scrollY || 0,
      width: appState.width || 1920,
      height: appState.height || 1080,
      zoom: appState.zoom?.value || 1,
    } : undefined;

    // Get selected elements
    const selectedIds = Object.keys(appState?.selectedElementIds || {});

    controllerRef.current = canvasChat(pageId, message, {
      viewport,
      history: messages.slice(-6),
      selectedElementIds: selectedIds,

      onOp: (op: CanvasOp) => {
        switch (op.op) {
          case 'info':
            // Check if it's a chat response
            if (op.metadata?.type === 'chat_response') {
              setMessages(prev => [...prev, { role: 'assistant', content: op.message || '' }]);
            }
            break;

          case 'stream_start':
            setStreamText('');
            break;

          case 'stream_chunk':
            setStreamText(prev => prev + (op.text || ''));
            break;

          case 'stream_end':
            setStreamText('');
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✅ Composed: "${op.text?.slice(0, 60)}..."`,
            }]);
            // ⭐ Reload scene to see new elements
            openCanvasPage(pageId);
            break;

          case 'create_note':
          case 'create_diagram':
          case 'arrange_cluster':
          case 'set_background':
          case 'set_theme':
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✅ ${op.message || op.op}`,
            }]);
            // ⭐ Reload scene after mutations
            openCanvasPage(pageId);
            break;

          case 'error':
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `❌ ${op.message || 'Error'}`,
            }]);
            break;
        }
      },

      onError: (err) => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Connection error: ${err.message}`,
        }]);
        setStreaming(false);
      },

      onDone: () => {
        setStreaming(false);
      },
    });
  }, [input, streaming, pageId, messages, excalidrawAPI]);

  const handleCancel = () => {
    controllerRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`p-2 rounded ${
            msg.role === 'user' ? 'bg-indigo-900/40 ml-8' : 'bg-gray-800/60 mr-8'
          }`}>
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {streamText && (
          <div className="p-2 rounded bg-gray-800/60 mr-8">
            <div className="text-sm whitespace-pre-wrap">{streamText}</div>
            <div className="text-xs text-gray-500 mt-1">Writing...</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask, write, or command..."
            className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm"
            disabled={streaming}
          />
          {streaming ? (
            <button onClick={handleCancel} className="px-3 py-2 bg-red-600 rounded text-sm">
              Stop
            </button>
          ) : (
            <button onClick={handleSend} className="px-3 py-2 bg-indigo-600 rounded text-sm">
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### RegionPanel.tsx — New Component

```typescript
// === FILE: src/components/canvas/RegionPanel.tsx ===

import { useState } from 'react';
import { canvas as canvasApi } from '@/lib/api';
import { useCanvasStore } from '@/stores/canvasStore';
import type { Region } from '@/lib/types';

interface Props {
  pageId: string;
}

export function RegionPanel({ pageId }: Props) {
  const { pageRegions, refreshRegions } = useCanvasStore();
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    await canvasApi.createRegion(pageId, {
      label: newLabel.trim(),
      region_type: 'cluster',
      layout_hint: 'auto',
      color: '#6366f1',
    });
    setNewLabel('');
    setCreating(false);
    refreshRegions(pageId);
  };

  const handleDelete = async (regionId: string) => {
    await canvasApi.deleteRegion(pageId, regionId);
    refreshRegions(pageId);
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Regions</h3>
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          + New
        </button>
      </div>

      {creating && (
        <div className="flex gap-2">
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Region name..."
            className="flex-1 bg-gray-800 rounded px-2 py-1 text-sm"
            autoFocus
          />
          <button onClick={handleCreate} className="text-xs text-green-400">✓</button>
          <button onClick={() => setCreating(false)} className="text-xs text-gray-500">✕</button>
        </div>
      )}

      {pageRegions.map(region => (
        <div key={region.id} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: region.color || '#6366f1' }}
            />
            <span className="text-sm">{region.label || 'Unnamed'}</span>
            <span className="text-xs text-gray-500">
              {region.element_count || 0} items
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-xs text-gray-500">{region.region_type}</span>
            <button
              onClick={() => handleDelete(region.id)}
              className="text-xs text-red-400 hover:text-red-300 ml-2"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {pageRegions.length === 0 && !creating && (
        <p className="text-xs text-gray-500 text-center py-4">
          No regions yet. AI will create them automatically, or create one manually.
        </p>
      )}
    </div>
  );
}
```

---

## 8. Migration Checklist

### Phase 1: API Client & Types (Do First)

```
□ Create src/lib/types.ts with all new interfaces
□ Rewrite src/lib/api.ts (complete rewrite above)
□ Remove any references to:
  - note.canvas_x, note.canvas_y, note.canvas_width, note.canvas_height
  - note.cluster_id, note.related_note_ids
  - note.embedding, note.centrality, note.is_bridge
  - note.page_title (rename to note.source_title)
  - page.canvas_data, page.notebook_data, page.note_count, page.viewport
```

### Phase 2: Stores

```
□ Split stores: workspaceStore, canvasStore, notesStore, chatStore
□ canvasStore: scene loading is separate call to GET /pages/{id}/scene
□ canvasStore: scene saving goes to PUT /pages/{id}/scene
□ canvasStore: viewport saving goes to PUT /pages/{id}/viewport
□ canvasStore: store visualContext, pageRegions, pageEdges
□ Remove all sync_note_to_canvas / sync_scene_to_db logic from frontend
□ Remove note position tracking from frontend stores
```

### Phase 3: Canvas Components

```
□ CanvasContainer: use scene.get() for initial load
□ CanvasContainer: debounced save to scene.save()
□ CanvasContainer: separate viewport save to scene.saveViewport()
□ CanvasChat: update SSE endpoint to /pages/{id}/chat
□ CanvasChat: reload scene after AI mutations (openCanvasPage)
□ Remove any component that reads note.canvas_x/y
□ Add RegionPanel component
□ Add VisualContextBadge component (shows AI's analysis)
```

### Phase 4: Page/Note Components

```
□ PageList: uses pages.list() (lightweight, no scene data)
□ NoteCard: remove position display fields
□ NoteEditor: remove canvas position fields from update form
□ NoteList: use notes.list() (no embedding/position fields)
□ Replace cluster references with region references everywhere
```

### Phase 5: Graph & Search

```
□ Update edge API calls: /graph/edges instead of /edges
□ Add full graph view: graph.full() returns {nodes, edges}
□ Search: use search.query() and search.byTags()
□ Replace /clusters endpoints with /pages/{id}/regions
```

### Phase 6: New Features

```
□ Workspace overview page using workspace.overview()
□ Visual context display in canvas sidebar
□ Region management panel
□ Batch capture UI
□ Curator panel using ai.curatorScan() / ai.curatorApply()
□ Page analysis using ai.analyzePage()
□ Document/notebook mode using document.* API
```

---

## 9. Key Behavioral Changes

### Scene Loading Flow

```
BEFORE:
  1. GET /pages/{id}  → returns page WITH canvas_data (huge)
  2. Set Excalidraw initialData from page.canvas_data
  3. On change → save entire page including canvas_data

AFTER:
  1. GET /pages/{id}  → returns page metadata only (fast)
  2. GET /pages/{id}/scene → returns scene + notes + edges + regions + viewport
  3. Set Excalidraw initialData from response.scene_data
  4. Restore viewport from response.viewport
  5. On change → debounced PUT /pages/{id}/scene (scene only)
  6. On scroll/zoom → debounced PUT /pages/{id}/viewport (lightweight)
```

### After AI Operations

```
BEFORE:
  AI writes to DB → frontend polls or manually refreshes
  Position sync between DB and scene was fragile

AFTER:
  AI writes directly to scene via SceneManager → scene is authority
  Frontend reloads scene after AI operations complete (SSE 'done' event)
  Visual context updated automatically server-side
  No position sync needed — there's only one source of truth
```

### Note CRUD

```
BEFORE:
  Create note → save to DB with canvas_x/y → sync_note_to_canvas → update scene
  Move note → update DB canvas_x/y → sync to scene → hope they match

AFTER:
  Create note → save to DB (no position) → processor places on scene
  Move note → Excalidraw handles it → scene saved → registry updated automatically
  Note update → PUT /notes/{id} → backend updates scene card text via SceneManager
  Delete note → DELETE /notes/{id} → backend removes from scene via SceneManager
```

---

## 10. Environment Variables

```env
# Frontend .env
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=Mnemos
VITE_APP_VERSION=2.0.0
```

No changes needed to frontend env — the API URL stays the same, just the endpoint paths change.

---

## 11. Quick Reference: "Where Did X Go?"

| Old Frontend Pattern | New Pattern |
|---|---|
| `page.canvas_data` | `scene.get(pageId).scene_data` |
| `page.viewport` | `scene.get(pageId).viewport` |
| `page.note_count` | Compute from `notes.length` or `workspace.overview()` |
| `note.canvas_x` / `canvas_y` | Gone. Scene elements have positions. |
| `note.cluster_id` | Gone. Use `canvas.listRegions(pageId)` |
| `note.related_note_ids` | Use `graph.edgesForNote(noteId)` |
| `note.embedding` | Gone from frontend. Backend handles it. |
| `POST /canvas/stream/{id}` | `POST /pages/{id}/chat` |
| `GET /edges` | `GET /graph/edges` |
| `POST /edges` | `POST /graph/edges` |
| `GET /clusters` | `GET /pages/{id}/regions` |
| `POST /clusters` | `POST /pages/{id}/regions` |
| `sync_note_to_canvas()` | Gone. Backend SceneManager handles it. |
| `sync_scene_to_db()` | Gone. Scene IS the authority. |