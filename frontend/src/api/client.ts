

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001/api"

// ═══════════════════════════════════════════════════════
// Core request infrastructure
// ═══════════════════════════════════════════════════════

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("mnemos-token")
  if (token && token !== "auth-disabled") {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

async function request<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  try {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
        ...(options?.headers as Record<string, string> || {}),
      },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      let detail = `API error: ${res.status}`
      try {
        const body = await res.json()
        if (body.detail) detail = body.detail
      } catch { /* ignore */ }

      if (res.status === 401) {
        localStorage.removeItem("mnemos-token")
      }
      throw new Error(detail)
    }
    return res.json() as Promise<T>
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out")
    }
    throw err
  }
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ""
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  )
  if (entries.length === 0) return ""
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
}

// ═══════════════════════════════════════════════════════
// Type imports
// ═══════════════════════════════════════════════════════

import type {
  Page, Note, NoteEdge, Region, VisualContext,
  ElementRegistryEntry, SceneResponse, CanvasOp,
  PageDocument, PageBlock, PageDocumentBundle,
  ChatSource, ChatMessage, ChatConversation,
  TagWithCount, WorkspaceSettings, CuratorReport,
  ModelCatalog,
} from "../types"

// ═══════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════

export const auth = {
  google: (token: string) =>
    request<{
      access_token: string
      refresh_token: string
      user: { id: string; email: string; name: string; avatar_url?: string }
    }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  refresh: (refreshToken: string) =>
    request<{ access_token: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  me: () =>
    request<{
      auth_enabled: boolean
      user: null | { id: string; email: string; name: string; avatar_url?: string }
      google_client_id?: string
    }>("/auth/me"),
}

// ═══════════════════════════════════════════════════════
// Pages (lightweight metadata — NO scene data)
// ═══════════════════════════════════════════════════════

export const pages = {
  list: (includeArchived = false) =>
    request<{ pages: Page[] }>(`/pages${buildQuery({ include_archived: includeArchived })}`),

  get: (id: string) =>
    request<Page>(`/pages/${id}`),

  create: (data: {
    name: string
    description?: string
    icon?: string
    color?: string
    layout_mode?: "canvas" | "notebook"
  }) =>
    request<Page>("/pages", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Pick<Page, "name" | "description" | "icon" | "color" | "is_archived" | "layout_mode">>) =>
    request<Page>(`/pages/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (id: string) =>
    request<{ status: string }>(`/pages/${id}`, { method: "DELETE" }),
}

// ═══════════════════════════════════════════════════════
// Scene (separated from page — large payload)
// ═══════════════════════════════════════════════════════

export const scene = {
  /** Main canvas load — returns EVERYTHING the canvas needs in one call */
  get: (pageId: string) =>
    request<SceneResponse>(`/pages/${pageId}/scene`),

  /** Save scene data (triggers visual analysis + registry sync server-side) */
  save: (pageId: string, data: { elements: any[]; appState: Record<string, any>; files: Record<string, any> }) =>
    request<{ status: string }>(`/pages/${pageId}/scene`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** Save viewport separately (lightweight, no visual analysis triggered) */
  saveViewport: (pageId: string, data: { scroll_x: number; scroll_y: number; zoom: number }) =>
    request<{ status: string }>(`/pages/${pageId}/viewport`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** Get AI's visual understanding of the canvas */
  getVisualContext: (pageId: string) =>
    request<VisualContext>(`/pages/${pageId}/visual-context`),

  /** Trigger full AI layout recalculation */
  triggerLayout: (pageId: string) =>
    request<{ status: string; positions: number; overlaps_resolved: number }>(
      `/pages/${pageId}/layout`,
      { method: "POST" }
    ),

  /** Re-sync all DB notes onto the canvas scene */
  syncNotes: (pageId: string) =>
    request<{ status: string }>(`/pages/${pageId}/sync-notes`, { method: "POST" }),
}

// ═══════════════════════════════════════════════════════
// Canvas Elements & Regions
// ═══════════════════════════════════════════════════════

export const canvas = {
  // ── Element Registry ──
  listElements: (pageId: string) =>
    request<{ elements: ElementRegistryEntry[] }>(`/pages/${pageId}/elements`),

  getElement: (pageId: string, elementId: string) =>
    request<ElementRegistryEntry>(`/pages/${pageId}/elements/${elementId}`),

  deleteElement: (pageId: string, elementId: string) =>
    request<{ status: string }>(`/pages/${pageId}/elements/${elementId}`, { method: "DELETE" }),

  // ── Regions (replace clusters) ──
  listRegions: (pageId: string) =>
    request<{ regions: Region[] }>(`/pages/${pageId}/regions`),

  createRegion: (pageId: string, data: {
    label: string
    description?: string
    color?: string
    region_type?: Region["region_type"]
    layout_hint?: string
  }) =>
    request<Region>(`/pages/${pageId}/regions`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId, ...data }),
    }),

  updateRegion: (pageId: string, regionId: string, data: Partial<Pick<Region, "label" | "description" | "color" | "layout_hint">>) =>
    request<Region>(`/pages/${pageId}/regions/${regionId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteRegion: (pageId: string, regionId: string) =>
    request<{ status: string }>(`/pages/${pageId}/regions/${regionId}`, { method: "DELETE" }),

  assignToRegion: (pageId: string, regionId: string, elementId: string) =>
    request<{ status: string }>(
      `/pages/${pageId}/regions/${regionId}/assign/${elementId}`,
      { method: "POST" }
    ),

  unassignFromRegion: (pageId: string, regionId: string, elementId: string) =>
    request<{ status: string }>(
      `/pages/${pageId}/regions/${regionId}/unassign/${elementId}`,
      { method: "POST" }
    ),
}

// ═══════════════════════════════════════════════════════
// Notes (NO canvas positions — scene owns those)
// ═══════════════════════════════════════════════════════

export const notes = {
  list: (params?: { page?: number; limit?: number; tag?: string; page_id?: string }) =>
    request<{ notes: Note[]; total: number }>(`/notes${buildQuery(params)}`),

  get: (id: string) =>
    request<Note>(`/notes/${id}`),

  update: (id: string, data: {
    title?: string
    summary?: string
    tags?: string[]
    tasks?: string[]
    entities?: string[]
    page_id?: string
    metadata?: Record<string, unknown>
  }) =>
    request<Note>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (id: string) =>
    request<{ status: string }>(`/notes/${id}`, { method: "DELETE" }),

  retry: (id: string) =>
    request<{ status: string }>(`/notes/${id}/retry`, { method: "POST" }),

  move: (id: string, pageId: string) =>
    request<{ status: string; from_page: string | null; to_page: string }>(
      `/notes/${id}/move`,
      { method: "POST", body: JSON.stringify({ page_id: pageId }) }
    ),

  tags: () =>
    request<{ tags: TagWithCount[] }>("/tags"),
}

// ═══════════════════════════════════════════════════════
// Capture
// ═══════════════════════════════════════════════════════

export const capture = {
  single: (data: {
    text: string
    source_url?: string
    source_title?: string
    capture_type?: string
    page_hint?: string
    viewport?: { x: number; y: number; width: number; height: number; zoom: number }
  }) =>
    request<{ status: string; note_id: string }>("/capture", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  batch: (items: Array<{
    text: string
    source_url?: string
    source_title?: string
    capture_type?: string
    page_hint?: string
  }>) =>
    request<{ status: string; count: number; notes: Array<{ note_id: string; status: string }> }>(
      "/capture/batch",
      { method: "POST", body: JSON.stringify(items) }
    ),
}

// ═══════════════════════════════════════════════════════
// Graph (edges + full graph)
// ═══════════════════════════════════════════════════════

export const graph = {
  edges: () =>
    request<{ edges: NoteEdge[] }>("/graph/edges"),

  edgesForNote: (noteId: string) =>
    request<{ edges: NoteEdge[] }>(`/graph/edges/note/${noteId}`),

  edgesForPage: (pageId: string) =>
    request<{ edges: NoteEdge[] }>(`/graph/edges/page/${pageId}`),

  createEdge: (data: {
    source_id: string
    target_id: string
    edge_type?: string
    label?: string
    strength?: number
  }) =>
    request<NoteEdge>("/graph/edges", {
      method: "POST",
      body: JSON.stringify({ created_by: "user", ...data }),
    }),

  deleteEdge: (id: string) =>
    request<{ status: string }>(`/graph/edges/${id}`, { method: "DELETE" }),

  /** Full knowledge graph: all notes as nodes + all edges */
  full: () =>
    request<{
      nodes: Array<{
        id: string; title: string; tags: string[]
        page_id: string | null; content_type: string
      }>
      edges: NoteEdge[]
    }>("/graph/full"),
}

// ═══════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════

export const search = {
  query: (q: string, opts?: { page_id?: string; limit?: number; threshold?: number }) =>
    request<{ results: Note[]; count: number; query: string }>(
      `/search${buildQuery({ q, ...opts })}`
    ),

  byTags: (tags: string[]) =>
    request<{ results: Note[]; count: number; tags: string[] }>(
      `/search/tags${buildQuery({ tags: tags.join(",") })}`
    ),
}

// ═══════════════════════════════════════════════════════
// Chat (home — not tied to a canvas page)
// ═══════════════════════════════════════════════════════

export const chat = {
  home: (data: {
    question: string
    history?: Array<{ role: string; content: string }>
    page_id?: string
  }) =>
    request<{ response: string; sources: ChatSource[] }>("/chat", {
      method: "POST",
      body: JSON.stringify({ context_type: "home", ...data }),
    }),
}

// ═══════════════════════════════════════════════════════
// Canvas Chat (SSE streaming)
// ═══════════════════════════════════════════════════════

export function canvasChat(
  pageId: string,
  message: string,
  options: {
    viewport?: { x: number; y: number; width: number; height: number; zoom: number }
    history?: Array<{ role: string; content: string }>
    selectedElementIds?: string[]
    onOp: (op: CanvasOp) => void
    onError?: (error: Error) => void
    onDone?: () => void
  }
): AbortController {
  const controller = new AbortController()

  const body = JSON.stringify({
    message,
    viewport: options.viewport || null,
    history: options.history || [],
    selected_element_ids: options.selectedElementIds || [],
    context_type: "page",
  })

  fetch(`${API_BASE}/pages/${pageId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body,
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(errBody.detail || `SSE error: ${res.status}`)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const op = JSON.parse(line.slice(6)) as CanvasOp
              if (op.op === "done") {
                options.onDone?.()
              } else {
                options.onOp(op)
              }
            } catch {
              // skip malformed SSE data
            }
          }
        }
      }
      options.onDone?.()
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        options.onError?.(err)
      }
    })

  return controller
}

// ═══════════════════════════════════════════════════════
// Workspace
// ═══════════════════════════════════════════════════════

export const workspace = {
  overview: () =>
    request<{
      pages: Array<{
        id: string; name: string; icon: string; color: string
        note_count: number; layout_mode: string; is_archived: boolean; updated_at: string
      }>
      total_notes: number
      total_pages: number
      top_tags: TagWithCount[]
    }>("/workspace/overview"),

  stats: () =>
    request<{
      notes: number; pages: number; edges: number
      stuck_notes: number; cache: Record<string, unknown>
    }>("/workspace/stats"),
}

// ═══════════════════════════════════════════════════════
// AI
// ═══════════════════════════════════════════════════════

export const ai = {
  curatorScan: () =>
    request<CuratorReport>("/ai/curator/scan", { method: "POST" }),

  curatorApply: (actionType: string, params: Record<string, unknown>) =>
    request<Record<string, unknown>>("/ai/curator/apply", {
      method: "POST",
      body: JSON.stringify({ action_type: actionType, params }),
    }),

  analyzePage: (pageId: string) =>
    request<{
      visual_context: VisualContext
      note_count: number
      edge_count: number
      region_count: number
      analysis: {
        layout_pattern: string; density: string
        reading_direction: string; theme: string; colors: string[]
      }
    }>(`/ai/analyze/page/${pageId}`, { method: "POST" }),

  retryStuck: () =>
    request<{ retrying: number }>("/ai/retry-stuck", { method: "POST" }),
}

// ═══════════════════════════════════════════════════════
// Document (notebook mode)
// ═══════════════════════════════════════════════════════

export const documentApi = {
  get: (pageId: string) =>
    request<PageDocumentBundle>(`/pages/${pageId}/document`),

  updateSettings: (pageId: string, data: Partial<Pick<PageDocument,
    "default_font" | "content_width" | "line_height" | "left_padding" | "right_padding" | "metadata"
  >>) =>
    request<PageDocument>(`/pages/${pageId}/document`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  listBlocks: (pageId: string) =>
    request<{ blocks: PageBlock[] }>(`/pages/${pageId}/blocks`),

  createBlock: (pageId: string, data: {
    block_type?: string
    text_content?: string
    prev_block_id?: string
    next_block_id?: string
    depth?: number
    attrs?: Record<string, unknown>
    note_id?: string
    provenance?: Record<string, unknown>
    created_by?: string
  }) =>
    request<PageBlock>(`/pages/${pageId}/blocks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateBlock: (pageId: string, blockId: string, data: Partial<Pick<PageBlock,
    "text_content" | "parent_block_id" | "order_key" | "depth" | "block_type" | "attrs" | "is_deleted"
  >>) =>
    request<PageBlock>(`/pages/${pageId}/blocks/${blockId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteBlock: (pageId: string, blockId: string) =>
    request<{ status: string }>(`/pages/${pageId}/blocks/${blockId}`, { method: "DELETE" }),

  moveBlock: (pageId: string, blockId: string, data: {
    prev_block_id?: string
    next_block_id?: string
  }) =>
    request<PageBlock>(`/pages/${pageId}/blocks/${blockId}/move`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  rebalance: (pageId: string) =>
    request<{ status: string }>(`/pages/${pageId}/blocks/rebalance`, { method: "POST" }),

  // ── References ──
  listReferences: (pageId: string, blockId: string) =>
    request<{ references: Record<string, unknown>[] }>(`/pages/${pageId}/blocks/${blockId}/references`),

  createReference: (pageId: string, blockId: string, data: {
    ref_type: string; ref_id: string
    start_offset?: number; end_offset?: number
    label?: string; metadata?: Record<string, unknown>
  }) =>
    request<Record<string, unknown>>(`/pages/${pageId}/blocks/${blockId}/references`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteReference: (pageId: string, refId: string) =>
    request<{ status: string }>(`/pages/${pageId}/references/${refId}`, { method: "DELETE" }),

  // ── Inline Embeds ──
  listEmbeds: (pageId: string, blockId: string) =>
    request<{ embeds: Record<string, unknown>[] }>(`/pages/${pageId}/blocks/${blockId}/embeds`),

  createEmbed: (pageId: string, blockId: string, data: {
    embed_type: string
    target_page_id?: string
    target_note_id?: string
    target_block_id?: string
    url?: string
    display_mode?: string
    width?: number; height?: number
    attrs?: Record<string, unknown>
  }) =>
    request<Record<string, unknown>>(`/pages/${pageId}/blocks/${blockId}/embeds`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteEmbed: (pageId: string, embedId: string) =>
    request<{ status: string }>(`/pages/${pageId}/embeds/${embedId}`, { method: "DELETE" }),
}

// ═══════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════

export const settings = {
  get: () =>
    request<WorkspaceSettings>("/settings"),

  update: (data: Partial<WorkspaceSettings>) =>
    request<{ status: string }>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
}

// ═══════════════════════════════════════════════════════
// Chat History
// ═══════════════════════════════════════════════════════

export const chatHistory = {
  list: (limit = 20) =>
    request<{ conversations: ChatConversation[] }>(`/history${buildQuery({ limit })}`),

  get: (id: string) =>
    request<ChatConversation>(`/history/${id}`),

  save: (data: {
    context_type: string
    context_id?: string
    messages: ChatMessage[]
    title?: string
  }) =>
    request<ChatConversation>("/history", { method: "POST", body: JSON.stringify(data) }),

  delete: (id: string) =>
    request<{ status: string }>(`/history/${id}`, { method: "DELETE" }),
}

// ═══════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════

export const health = {
  check: () =>
    fetch(`${API_BASE.replace("/api", "")}/health`, {
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => r.json())
      .catch(() => null),
}

// ═══════════════════════════════════════════════════════
// Legacy compatibility — single `api` export
// Components using `api.xxx()` can migrate gradually
// ═══════════════════════════════════════════════════════

export const api = {
  // Auth
  authGoogle: auth.google,
  authRefresh: auth.refresh,
  authMe: auth.me,

  // Pages
  listPages: async (includeArchived = false) => pages.list(includeArchived),
  createPage: pages.create,
  getPage: pages.get,
  updatePage: pages.update,
  deletePage: pages.delete,

  // Scene (canvas load/save)
  getPageCanvas: scene.get,
  savePageCanvas: (id: string, data: { canvas_data?: Record<string, unknown>; viewport?: any }) => {
    // Translate old shape to new
    if (data.canvas_data) {
      const cd = data.canvas_data as any
      return scene.save(id, {
        elements: cd.elements || [],
        appState: cd.appState || {},
        files: cd.files || {},
      })
    }
    if (data.viewport) {
      return scene.saveViewport(id, {
        scroll_x: data.viewport.x ?? data.viewport.scroll_x ?? 0,
        scroll_y: data.viewport.y ?? data.viewport.scroll_y ?? 0,
        zoom: data.viewport.zoom ?? 1,
      })
    }
    return Promise.resolve({ status: "noop" })
  },
  triggerPageLayout: scene.triggerLayout,

  // Notes
  listNotes: async (page = 1, limit = 20, tag?: string, pageId?: string) =>
    notes.list({ page, limit, tag, page_id: pageId }),
  getNote: notes.get,
  updateNote: (id: string, data: Record<string, unknown>) => notes.update(id, data as any),
  deleteNote: notes.delete,
  retryNote: notes.retry,
  moveNote: notes.move,

  // Capture
  capture: capture.single,

  // Edges
  listEdges: async (pageId?: string, noteId?: string) => {
    if (noteId) return graph.edgesForNote(noteId)
    if (pageId) return graph.edgesForPage(pageId)
    return graph.edges()
  },
  createEdge: graph.createEdge,
  deleteEdge: graph.deleteEdge,

  // Clusters → Regions
  listClusters: async (pageId?: string) => {
    if (!pageId) return { clusters: [] }
    const res = await canvas.listRegions(pageId)
    return { clusters: res.regions }
  },
  createCluster: (data: { page_id: string; label: string; description?: string; color?: string }) =>
    canvas.createRegion(data.page_id, data),
  updateCluster: (id: string, data: Record<string, unknown>) => {
    const pageId = (data as any).page_id
    if (!pageId) return Promise.reject(new Error("page_id required"))
    return canvas.updateRegion(pageId, id, data as any)
  },
  deleteCluster: (_id: string) => {
    console.warn("deleteCluster needs pageId — use canvas.deleteRegion(pageId, regionId) directly")
    return Promise.resolve({ status: "noop" })
  },

  // Canvas Elements
  listElements: async (pageId: string) => canvas.listElements(pageId),
  deleteElement: (_id: string) => {
    console.warn("deleteElement needs pageId — use canvas.deleteElement(pageId, elementId) directly")
    return Promise.resolve({ status: "noop" })
  },

  // Search
  search: async (q: string, limit = 10, pageId?: string) =>
    search.query(q, { limit, page_id: pageId }),

  // Chat
  chat: async (
    question: string,
    history: Array<{ role: string; content: string }>,
    _contextType = "home",
    pageId?: string
  ) => {
    const res = await chat.home({ question, history, page_id: pageId })
    return { answer: res.response, sources: res.sources, follow_ups: [] }
  },

  // Tags
  getTags: async () => notes.tags(),

  // Stats
  getStats: workspace.stats,

  // Document
  getPageDocument: documentApi.get,
  createPageBlock: documentApi.createBlock,
  updatePageBlock: documentApi.updateBlock,
  deletePageBlock: documentApi.deleteBlock,

  // History
  listHistory: async (limit = 20) => chatHistory.list(limit),
  getHistory: chatHistory.get,
  saveHistory: chatHistory.save,
  deleteHistory: chatHistory.delete,

  // Curator
  curatorScan: ai.curatorScan,
  curatorApply: (action: { action_type: string; params: Record<string, unknown> }) =>
    ai.curatorApply(action.action_type, action.params),

  // Settings
  getSettings: settings.get,
  updateSettings: settings.update,

  // AI
  aiLayout: scene.triggerLayout,

  // Workspace
  getOverview: workspace.overview,

  // Health
  health: health.check,
}