import type {
  AuthState,
  AuthTokens,
  ChatRequest,
  ChatResponse,
  ExcalidrawScene,
  SceneResponse,
  SSEEvent,
  SyncResponse,
} from "./types"

// ══════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════

const BASE = import.meta.env.VITE_API_URL ?? ""
const API = `${BASE}/api`

// ══════════════════════════════════════════
// TOKENS
// ══════════════════════════════════════════

const TOKEN_KEY = "mnemos_access"
const REFRESH_KEY = "mnemos_refresh"

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// ══════════════════════════════════════════
// HTTP
// ══════════════════════════════════════════

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(
    status: number,
    detail: string,
  ) {
    super(detail)
    this.name = "ApiError"
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ??  {}),
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  let res = await fetch(`${API}${path}`, { ...init, headers })

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getToken()}`
      res = await fetch(`${API}${path}`, { ...init, headers })
    } else {
      clearTokens()
      throw new ApiError(401, "Session expired")
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new ApiError(res.status, body.detail ?? `HTTP ${res.status}`)
  }

  return res.json()
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken || refreshToken === "auth-disabled") return false

  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (data.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token)
      return true
    }
    return false
  } catch {
    return false
  }
}

// ══════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════

export const api = {
  // ── Auth ──
  auth: {
    me: () => request<AuthState>("/auth/me"),

    loginWithGoogle: async (googleToken: string): Promise<AuthTokens> => {
      const data = await request<AuthTokens>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ token: googleToken }),
      })
      setTokens(data.access_token, data.refresh_token)
      return data
    },

    refresh: async (refreshToken: string): Promise<{ access_token: string }> => {
      const data = await request<{ access_token: string }>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      localStorage.setItem(TOKEN_KEY, data.access_token)
      return data
    },

    logout: () => {
      clearTokens()
    },
  },

  // ── Chat (THE endpoint) ──
  chat: {
    send: (
      message: string,
      workspaceId?: string | null,
      history?: Array<{ role: "user" | "assistant"; content: string }>,
    ): Promise<ChatResponse> => {
      const payload: ChatRequest = {
        message,
        workspace_id: workspaceId ?? null,
        history: history ?? [],
      }
      return request<ChatResponse>("/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
  },

  // ── Canvas ──
  canvas: {
    getScene: (workspaceId: string): Promise<SceneResponse> =>
      request<SceneResponse>(`/workspaces/${workspaceId}/scene`),

    sync: (
      workspaceId: string,
      baseVersion: number,
      scene?: ExcalidrawScene | null,
    ): Promise<SyncResponse> =>
      request<SyncResponse>(`/workspaces/${workspaceId}/sync`, {
        method: "POST",
        body: JSON.stringify({ base_version: baseVersion, scene: scene ?? null }),
      }),

    getVersion: (workspaceId: string): Promise<{ version: number; workspace_id: string }> =>
      request(`/workspaces/${workspaceId}/version`),

    subscribe: (
      workspaceId: string,
      onEvent: (event: SSEEvent) => void,
      onError?: () => void,
    ): (() => void) => {
      const token = getToken()
      const url = new URL(`${API}/workspaces/${workspaceId}/events`, window.location.origin)
      if (token && token !== "auth-disabled") {
        url.searchParams.set("token", token)
      }

      const source = new EventSource(url.toString())

      source.onmessage = (e) => {
        try {
          onEvent(JSON.parse(e.data) as SSEEvent)
        } catch {
          // Ignore parse errors (keepalive comments)
        }
      }

      source.onerror = () => {
        source.close()
        onError?.()
      }

      return () => source.close()
    },
  },

  // ── Health ──
  health: {
    check: async (): Promise<{ status: string; version: string }> => {
      const res = await fetch(`${BASE}/health`)
      return res.json()
    },
  },
} as const