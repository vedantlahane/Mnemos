const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

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
