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
  // Notes
  listNotes: (page = 1, limit = 20, tag?: string) =>
    request(`/notes?page=${page}&limit=${limit}${tag ? `&tag=${tag}` : ""}`),

  getNote: (id: string) => request(`/notes/${id}`),

  updateNote: (id: string, data: Record<string, unknown>) =>
    request(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteNote: (id: string) =>
    request(`/notes/${id}`, { method: "DELETE" }),

  // Search
  search: (q: string, limit = 10) =>
    request(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Chat
  chat: (question: string, history: Array<{ role: string; content: string }>) =>
    request("/chat", {
      method: "POST",
      body: JSON.stringify({ question, history }),
    }),

  // Tags
  getTags: () => request("/tags"),

  // Health
  health: () => request("/health".replace("/api", "")).catch(() => null),
}
