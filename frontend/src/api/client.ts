const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.toString()
}

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
    const res = await fetch(
      path.startsWith("http") ? path : `${API_BASE}${path}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        signal: controller.signal,
        ...options,
      }
    )
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

function extractArray<T>(res: unknown, ...keys: string[]): T[] {
  if (Array.isArray(res)) return res
  if (res && typeof res === "object") {
    for (const key of keys) {
      const val = (res as Record<string, unknown>)[key]
      if (Array.isArray(val)) return val
    }
  }
  return []
}

// ─── Type imports ─────────────────────────────────
import type {
  Note, Page, NoteEdge, Cluster, CanvasElement,
  ChatSource, ChatMessage, ChatConversation,
  TagWithCount, WorkspaceStats, CuratorReport,
  AILayoutResult, GapAnalysisResult, ReadingStep,
  PageSummary, WorkspaceSettings,
} from "../types"

// ─── Response types ───────────────────────────────
interface CanvasResponse {
  page: Page
  canvas_data: Record<string, unknown>
  notes: Note[]
  edges: NoteEdge[]
  elements: CanvasElement[]
  clusters: Cluster[]
  viewport: { x: number; y: number; zoom: number }
}

interface WorkspaceOverview {
  stats: WorkspaceStats
  pages: Page[]
  recent_notes: Note[]
  top_tags: TagWithCount[]
}

interface WorkspaceExport {
  pages: Page[]
  notes: Note[]
  edges: NoteEdge[]
  tags: TagWithCount[]
  exported_at: string
}

interface PageStats {
  note_count: number
  edge_count: number
  cluster_count: number
  element_count: number
  tags: TagWithCount[]
}

export const api = {
  // ─── Auth ───────────────────────────────────────
  authGoogle: (token: string) =>
    request<{
      access_token: string
      refresh_token: string
      user: { id: string; email: string; name: string; avatar_url?: string }
    }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  authRefresh: (refreshToken: string) =>
    request<{ access_token: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  authMe: () =>
    request<{ auth_enabled: boolean; user: null | { id: string; email: string; name: string } }>(
      "/auth/me"
    ),

  // ─── Notes ──────────────────────────────────────
  listNotes: async (page = 1, limit = 20, tag?: string, pageId?: string) => {
    const url = buildUrl("/notes", { page, limit, tag, page_id: pageId })
    const res = await request<{ notes: Note[]; total: number }>(url)
    return {
      notes: extractArray<Note>(res, "notes"),
      total: (res as Record<string, unknown>).total as number || 0,
    }
  },

  getNote: (id: string) =>
    request<Note>(`/notes/${id}`),

  updateNote: (id: string, data: Record<string, unknown>) =>
    request<Note>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteNote: (id: string) =>
    request<{ status: string }>(`/notes/${id}`, { method: "DELETE" }),

  retryNote: (id: string) =>
    request<{ status: string; note_id: string }>(`/notes/${id}/retry`, { method: "POST" }),

  moveNote: (id: string, pageId: string) =>
    request<{ status: string; note_id: string; page_id: string; page_name: string }>(
      `/notes/${id}/move`,
      { method: "POST", body: JSON.stringify({ page_id: pageId }) }
    ),

  // ─── Capture ────────────────────────────────────
  capture: (data: {
    text: string
    source_url?: string
    page_title?: string
    capture_type?: string
    page_hint?: string
    custom_command?: string
  }) =>
    request<{ status: string; note_id: string }>("/capture", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ─── Pages ──────────────────────────────────────
  listPages: async (includeArchived = false) => {
    const url = buildUrl("/pages", { include_archived: includeArchived })
    const res = await request<unknown>(url)
    return { pages: extractArray<Page>(res, "pages") }
  },

  createPage: (data: {
    name: string; description?: string; icon?: string; color?: string
  }) =>
    request<Page>("/pages", { method: "POST", body: JSON.stringify(data) }),

  getPage: (id: string) =>
    request<Page>(`/pages/${id}`),

  updatePage: (id: string, data: Record<string, unknown>) =>
    request<Page>(`/pages/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deletePage: (id: string) =>
    request<{ status: string }>(`/pages/${id}`, { method: "DELETE" }),

  // ─── Page Canvas (dedicated endpoints) ──────────
  getPageCanvas: (id: string) =>
    request<CanvasResponse>(`/pages/${id}/canvas`),

  savePageCanvas: (id: string, data: {
    canvas_data?: Record<string, unknown>
    viewport?: { x: number; y: number; zoom: number }
  }) =>
    request<{ status: string }>(`/pages/${id}/canvas`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // ─── Page AI ────────────────────────────────────
  aiLayout: (pageId: string) =>
    request<AILayoutResult>(`/pages/${pageId}/ai-layout`, { method: "POST" }),

  aiPosition: (pageId: string, noteId: string) =>
    request<{ x: number; y: number; cluster?: string }>(
      `/pages/${pageId}/ai-position`,
      { method: "POST", body: JSON.stringify({ note_id: noteId }) }
    ),

  pageSummary: (pageId: string) =>
    request<PageSummary>(`/pages/${pageId}/summary`, { method: "POST" }),

  triggerPageLayout: (id: string) =>
    request(`/pages/${id}/layout`, { method: "POST" }),

  getPageStats: (pageId: string) =>
    request<PageStats>(`/pages/${pageId}/stats`),

  // ─── Edges ──────────────────────────────────────
  listEdges: async (pageId?: string, noteId?: string) => {
    const url = buildUrl("/edges", { page_id: pageId, note_id: noteId })
    const res = await request<unknown>(url)
    return { edges: extractArray<NoteEdge>(res, "edges") }
  },

  createEdge: (data: {
    source_id: string; target_id: string; edge_type: string
    label?: string; strength?: number; created_by?: string
  }) =>
    request<NoteEdge>("/edges", { method: "POST", body: JSON.stringify(data) }),

  deleteEdge: (id: string) =>
    request<{ status: string }>(`/edges/${id}`, { method: "DELETE" }),

  // ─── Clusters ───────────────────────────────────
  listClusters: async (pageId?: string) => {
    const url = buildUrl("/clusters", { page_id: pageId })
    const res = await request<unknown>(url)
    return { clusters: extractArray<Cluster>(res, "clusters") }
  },

  createCluster: (data: {
    page_id: string; label: string; description?: string; color?: string
  }) =>
    request<Cluster>("/clusters", { method: "POST", body: JSON.stringify(data) }),

  updateCluster: (id: string, data: Record<string, unknown>) =>
    request<Cluster>(`/clusters/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteCluster: (id: string) =>
    request<{ status: string }>(`/clusters/${id}`, { method: "DELETE" }),

  // ─── Canvas Elements ────────────────────────────
  listElements: async (pageId: string) => {
    const res = await request<unknown>(`/pages/${pageId}/elements`)
    return { elements: extractArray<CanvasElement>(res, "elements") }
  },

  createElement: (pageId: string, data: Record<string, unknown>) =>
    request<CanvasElement>(`/pages/${pageId}/elements`, {
      method: "POST", body: JSON.stringify(data),
    }),

  updateElement: (id: string, data: Record<string, unknown>) =>
    request<CanvasElement>(`/elements/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteElement: (id: string) =>
    request<{ status: string }>(`/elements/${id}`, { method: "DELETE" }),

  // ─── Search ─────────────────────────────────────
  search: async (q: string, limit = 10, pageId?: string) => {
    const url = buildUrl("/search", { q, limit, page_id: pageId })
    const res = await request<unknown>(url)
    return { results: extractArray<Note>(res, "results"), query: q }
  },

  searchCanvas: (pageId: string, query: string) =>
    request<{
      results: Array<{
        type: "note" | "element"
        id: string
        title?: string
        content?: string
        element_type?: string
        canvas_x?: number
        canvas_y?: number
        position_x?: number
        position_y?: number
      }>
    }>("/search/canvas", {
      method: "POST",
      body: JSON.stringify({ page_id: pageId, query }),
    }),

  // ─── Chat ───────────────────────────────────────
  chat: (
    question: string,
    history: Array<{ role: string; content: string }>,
    contextType = "home",
    pageId?: string
  ) =>
    request<{
      answer: string
      sources?: ChatSource[]
      follow_ups?: string[]
    }>("/chat", {
      method: "POST",
      body: JSON.stringify({
        question, history,
        context_type: contextType,
        page_id: pageId,
      }),
    }),

  decideIntent: (
    question: string,
    contextType = "home",
    pageId?: string
  ) =>
    request<{
      mode: "command" | "chat"
      command: string
      args: string
      confidence: number
      reason?: string
    }>("/chat/intent", {
      method: "POST",
      body: JSON.stringify({
        question,
        context_type: contextType,
        page_id: pageId,
      }),
    }),

  // ─── Context (browser extension) ────────────────
  context: (url: string, text: string) =>
    request<{ related_notes: Note[] }>("/context", {
      method: "POST",
      body: JSON.stringify({ url, text }),
    }),

  // ─── AI Analysis ────────────────────────────────
  gapAnalysis: (pageId?: string) =>
    request<GapAnalysisResult>("/ai/gap-analysis", {
      method: "POST",
      body: JSON.stringify({ page_id: pageId }),
    }),

  readingPath: (topic?: string, pageId?: string) =>
    request<{ steps: ReadingStep[] }>("/ai/reading-path", {
      method: "POST",
      body: JSON.stringify({ topic, page_id: pageId }),
    }),

  generateDiagram: (requestText: string, pageId?: string) =>
    request<{ topology: {
      title: string
      layout_type: string
      app_state?: Record<string, unknown>
      elements: Array<{
        id: string
        type: "box" | "text" | "arrow"
        label: string
        style?: string
        width?: number
        height?: number
      }>
      connections: Array<{
        from: string
        to: string
        label?: string
        style?: string
      }>
    } }>("/ai/generate-diagram", {
      method: "POST",
      body: JSON.stringify({ request: requestText, page_id: pageId }),
    }),

  // ─── Tags ───────────────────────────────────────
  getTags: async () => {
    const res = await request<unknown>("/tags")
    return { tags: extractArray<TagWithCount>(res, "tags") }
  },

  // ─── Stats ──────────────────────────────────────
  getStats: () => request<WorkspaceStats>("/stats"),

  // ─── History ────────────────────────────────────
  listHistory: async (limit = 20) => {
    const url = buildUrl("/history", { limit })
    const res = await request<unknown>(url)
    return {
      conversations: extractArray<ChatConversation>(res, "conversations"),
    }
  },

  getHistory: (id: string) =>
    request<ChatConversation>(`/history/${id}`),

  saveHistory: (data: {
    context_type: string
    context_id?: string
    messages: ChatMessage[]
    title?: string
  }) =>
    request<ChatConversation>("/history", { method: "POST", body: JSON.stringify(data) }),

  deleteHistory: (id: string) =>
    request<{ status: string }>(`/history/${id}`, { method: "DELETE" }),

  // ─── Curator ────────────────────────────────────
  curatorScan: () =>
    request<CuratorReport>("/curator/scan", { method: "POST" }),

  curatorApply: (action: { action_type: string; params: Record<string, unknown> }) =>
    request("/curator/apply", { method: "POST", body: JSON.stringify(action) }),

  // ─── Settings ───────────────────────────────────
  getSettings: () =>
    request<WorkspaceSettings>("/settings"),

  updateSettings: (data: Partial<WorkspaceSettings>) =>
    request<WorkspaceSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // ─── Workspace ──────────────────────────────────
  getOverview: () =>
    request<WorkspaceOverview>("/workspace/overview"),

  exportWorkspace: () =>
    request<WorkspaceExport>("/workspace/export"),

  // ─── Health ─────────────────────────────────────
  health: () =>
    fetch(`${API_BASE.replace("/api", "")}/health`, {
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => r.json())
      .catch(() => null),
}