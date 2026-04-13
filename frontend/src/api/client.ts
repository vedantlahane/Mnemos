const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
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

async function request<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(
      path.startsWith("http") ? path : `${API_BASE}${path}`,
      {
        headers: { "Content-Type": "application/json" },
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
      } catch {
        // ignore parse error
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

/** Normalize array responses — backend sometimes returns { items: [...] } or [...] or { notes: [...] } */
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

export const api = {
  // ─── Notes ──────────────────────────────────────
  listNotes: async (page = 1, limit = 20, tag?: string, pageId?: string) => {
    const url = buildUrl("/notes", { page, limit, tag, page_id: pageId })
    const res = await request<{ notes: unknown }>(url)
    return { notes: extractArray<import("../types").Note>(res, "notes") }
  },

  getNote: (id: string) =>
    request<import("../types").Note>(`/notes/${id}`),

  updateNote: (id: string, data: Record<string, unknown>) =>
    request(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteNote: (id: string) =>
    request(`/notes/${id}`, { method: "DELETE" }),

  retryNote: (id: string) =>
    request(`/notes/${id}/retry`, { method: "POST" }),

  moveNote: (id: string, pageId: string) =>
    request(`/notes/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ page_id: pageId }),
    }),

  // ─── Capture ────────────────────────────────────
  capture: (data: {
    text: string
    source_url?: string
    page_title?: string
    capture_type?: string
    page_hint?: string
    custom_command?: string
  }) =>
    request<{ id: string; page_name?: string }>("/capture", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ─── Pages ──────────────────────────────────────
  listPages: async () => {
    const res = await request<unknown>("/pages")
    return { pages: extractArray<import("../types").Page>(res, "pages") }
  },

  createPage: (data: {
    name: string
    description?: string
    icon?: string
    color?: string
  }) =>
    request<import("../types").Page>("/pages", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getPage: (id: string) =>
    request<import("../types").Page>(`/pages/${id}`),

  updatePage: (id: string, data: Record<string, unknown>) =>
    request(`/pages/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deletePage: (id: string) =>
    request(`/pages/${id}`, { method: "DELETE" }),

  getPageCanvas: (id: string) =>
    request<{
      page?: import("../types").Page
      notes?: unknown[]
      elements?: unknown[]
      canvas_data?: Record<string, unknown>
    }>(`/pages/${id}/canvas`),

  savePageViewport: (
    id: string,
    viewport: { x: number; y: number; zoom: number }
  ) =>
    request(`/pages/${id}/canvas`, {
      method: "PUT",
      body: JSON.stringify({ viewport }),
    }),

  triggerPageLayout: (id: string) =>
    request(`/pages/${id}/layout`, { method: "POST" }),

  // ─── AI Layout & Positioning ────────────────────
  /**
   * Ask AI to compute optimal positions for all notes on a page.
   * Backend analyzes note content, relationships, clusters and returns
   * coordinates for each note.
   */
  aiLayout: (pageId: string) =>
    request<import("../types").AILayoutResult>(`/pages/${pageId}/ai-layout`, {
      method: "POST",
    }),

  /**
   * Ask AI where a single new note should be positioned on the canvas,
   * considering existing notes and their relationships.
   */
  aiPosition: (pageId: string, noteId: string) =>
    request<{ x: number; y: number; cluster?: string }>(
      `/pages/${pageId}/ai-position`,
      {
        method: "POST",
        body: JSON.stringify({ note_id: noteId }),
      }
    ),

  // ─── Edges ──────────────────────────────────────
  listEdges: async (pageId?: string, noteId?: string) => {
    const url = buildUrl("/edges", { page_id: pageId, note_id: noteId })
    const res = await request<unknown>(url)
    return { edges: extractArray<import("../types").NoteEdge>(res, "edges") }
  },

  createEdge: (data: {
    source_id: string
    target_id: string
    edge_type: string
    label?: string
  }) =>
    request<import("../types").NoteEdge>("/edges", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteEdge: (id: string) =>
    request(`/edges/${id}`, { method: "DELETE" }),

  // ─── Clusters ───────────────────────────────────
  listClusters: async (pageId?: string) => {
    const url = buildUrl("/clusters", { page_id: pageId })
    const res = await request<unknown>(url)
    return { clusters: extractArray<import("../types").Cluster>(res, "clusters") }
  },

  createCluster: (data: {
    page_id: string
    label: string
    description?: string
    color?: string
  }) =>
    request<import("../types").Cluster>("/clusters", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCluster: (id: string, data: Record<string, unknown>) =>
    request(`/clusters/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteCluster: (id: string) =>
    request(`/clusters/${id}`, { method: "DELETE" }),

  // ─── Canvas Elements ────────────────────────────
  listElements: async (pageId: string) => {
    const res = await request<unknown>(`/pages/${pageId}/elements`)
    return { elements: extractArray<import("../types").CanvasElement>(res, "elements") }
  },

  createElement: (pageId: string, data: Record<string, unknown>) =>
    request(`/pages/${pageId}/elements`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateElement: (id: string, data: Record<string, unknown>) =>
    request(`/elements/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteElement: (id: string) =>
    request(`/elements/${id}`, { method: "DELETE" }),

  // ─── Search ─────────────────────────────────────
  search: async (q: string, limit = 10, pageId?: string) => {
    const url = buildUrl("/search", { q, limit, page_id: pageId })
    const res = await request<unknown>(url)
    return { results: extractArray<import("../types").Note>(res, "results") }
  },

  searchCanvas: (pageId: string, query: string) =>
    request("/search/canvas", {
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
      sources?: import("../types").ChatSource[]
      follow_ups?: string[]
    }>("/chat", {
      method: "POST",
      body: JSON.stringify({
        question,
        history,
        context_type: contextType,
        page_id: pageId,
      }),
    }),

  // ─── AI Analysis Endpoints ──────────────────────
  /**
   * Structured gap analysis — returns typed result, not raw LLM text.
   */
  gapAnalysis: (pageId?: string) =>
    request<import("../types").GapAnalysisResult>(
      "/ai/gap-analysis",
      {
        method: "POST",
        body: JSON.stringify({ page_id: pageId }),
      }
    ),

  /**
   * Structured reading path — returns ordered steps.
   */
  readingPath: (topic?: string, pageId?: string) =>
    request<{ steps: import("../types").ReadingStep[] }>(
      "/ai/reading-path",
      {
        method: "POST",
        body: JSON.stringify({ topic, page_id: pageId }),
      }
    ),

  /**
   * Page summary — structured output.
   */
  pageSummary: (pageId: string) =>
    request<import("../types").PageSummary>(
      `/pages/${pageId}/summary`,
      { method: "POST" }
    ),

  // ─── Tags ───────────────────────────────────────
  getTags: async () => {
    const res = await request<unknown>("/tags")
    return { tags: extractArray<import("../types").TagWithCount>(res, "tags") }
  },

  // ─── Stats ──────────────────────────────────────
  getStats: () =>
    request<import("../types").WorkspaceStats>("/stats"),

  getPageStats: (pageId: string) =>
    request(`/pages/${pageId}/stats`),

  // ─── History ────────────────────────────────────
  listHistory: async (limit = 20) => {
    const url = buildUrl("/history", { limit })
    const res = await request<unknown>(url)
    return {
      conversations: extractArray<import("../types").ChatConversation>(
        res,
        "conversations"
      ),
    }
  },

  getHistory: (id: string) =>
    request<import("../types").ChatConversation>(`/history/${id}`),

  saveHistory: (data: {
    context_type: string
    context_id?: string
    messages: import("../types").ChatMessage[]
    title?: string
  }) =>
    request("/history", { method: "POST", body: JSON.stringify(data) }),

  deleteHistory: (id: string) =>
    request(`/history/${id}`, { method: "DELETE" }),

  // ─── Curator ────────────────────────────────────
  curatorScan: () =>
    request<import("../types").CuratorReport>("/curator/scan", {
      method: "POST",
    }),

  curatorApply: (action: {
    action_type: string
    params: Record<string, unknown>
  }) =>
    request("/curator/apply", {
      method: "POST",
      body: JSON.stringify(action),
    }),

  // ─── Health ─────────────────────────────────────
  health: () =>
    fetch(`${API_BASE.replace("/api", "")}/health`, {
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => r.json())
      .catch(() => null),
}