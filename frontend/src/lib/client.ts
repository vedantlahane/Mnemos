// === FILE: frontend/src/lib/client.ts ===

/**
 * Mnemos v4 — API Client
 *
 * Minimal surface area matching the v4 backend:
 *   POST /api/chat              — THE endpoint (everything goes through here)
 *   POST /api/workspaces/{}/sync — Canvas save
 *   GET  /api/workspaces/{}/scene — Canvas load
 *   GET  /api/workspaces/{}/events — SSE stream
 *   POST /api/auth/*            — Authentication
 *   GET  /health                — Health check
 *
 * The client handles:
 *   - Token management (auto-attach, auto-refresh)
 *   - SSE connection lifecycle
 *   - Error normalization
 */

import type {
  AuthState,
  AuthTokens,
  ChatRequest,
  ChatResponse,
  ExcalidrawScene,
  SceneResponse,
  SSEEvent,
  SyncRequest,
  SyncResponse,
} from "./types";

// ══════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API = `${BASE_URL}/api`;

// ══════════════════════════════════════════
// TOKEN MANAGEMENT
// ══════════════════════════════════════════

const TOKEN_KEY = "mnemos_access_token";
const REFRESH_KEY = "mnemos_refresh_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ══════════════════════════════════════════
// HTTP LAYER
// ══════════════════════════════════════════

class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token && token !== "auth-disabled") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Try refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getToken()}`;
      const retry = await fetch(`${API}${path}`, { ...options, headers });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ detail: "Request failed" }));
        throw new ApiError(retry.status, err.detail ?? "Request failed");
      }
      return retry.json();
    }
    clearTokens();
    throw new ApiError(401, "Session expired");
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(response.status, err.detail ?? `HTTP ${response.status}`);
  }

  return response.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken || refreshToken === "auth-disabled") return false;

  try {
    const resp = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════

export const auth = {
  /**
   * Login with Google OAuth token.
   */
  async loginWithGoogle(googleToken: string): Promise<AuthTokens> {
    const data = await request<AuthTokens>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token: googleToken }),
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },

  /**
   * Get current auth state.
   */
  async me(): Promise<AuthState> {
    return request<AuthState>("/auth/me");
  },

  /**
   * Logout — clear local tokens.
   */
  logout(): void {
    clearTokens();
  },

  /**
   * Check if we have a stored token.
   */
  hasToken(): boolean {
    const t = getToken();
    return t !== null && t !== "auth-disabled";
  },
};

// ══════════════════════════════════════════
// CHAT — THE primary interface
// ══════════════════════════════════════════

export const chat = {
  /**
   * Send a message. This is the ONLY endpoint you need for:
   * - Navigation ("show boards", "open settings")
   * - Capture ("remember Docker is great for...")
   * - Search ("search for machine learning")
   * - Canvas actions ("draw diagram about X")
   * - Board management ("create board ML Notes")
   * - Settings ("dark mode")
   * - Q&A ("what do I know about Docker?")
   */
  async send(
    message: string,
    workspaceId?: string | null,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<ChatResponse> {
    const payload: ChatRequest = {
      message,
      workspace_id: workspaceId ?? null,
      history: history ?? [],
    };
    return request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ══════════════════════════════════════════
// CANVAS — Scene load/save/sync
// ══════════════════════════════════════════

export const canvas = {
  /**
   * Get the current rendered scene for a workspace.
   * Backend rebuilds from source-of-truth tables.
   */
  async getScene(workspaceId: string): Promise<SceneResponse> {
    return request<SceneResponse>(`/workspaces/${workspaceId}/scene`);
  },

  /**
   * Sync local canvas changes to backend.
   * Sends the full Excalidraw scene — backend extracts position changes
   * and merges with server state.
   */
  async sync(
    workspaceId: string,
    baseVersion: number,
    scene?: ExcalidrawScene | null,
  ): Promise<SyncResponse> {
    const payload: SyncRequest = {
      base_version: baseVersion,
      scene: scene ?? undefined,
    };
    return request<SyncResponse>(`/workspaces/${workspaceId}/sync`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get current canvas version (lightweight check).
   */
  async getVersion(workspaceId: string): Promise<{ version: number }> {
    return request<{ version: number }>(`/workspaces/${workspaceId}/version`);
  },

  /**
   * Subscribe to real-time canvas updates via SSE.
   * Returns a cleanup function.
   *
   * Usage:
   * ```ts
   * const unsub = canvas.subscribe("ws-123", (event) => {
   *   if (event.type === "canvas_updated") {
   *     reloadScene();
   *   }
   * });
   * // later:
   * unsub();
   * ```
   */
  subscribe(
    workspaceId: string,
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Event) => void,
  ): () => void {
    const token = getToken();
    const url = new URL(`${API}/workspaces/${workspaceId}/events`);
    // SSE doesn't support custom headers, so we add token as query param
    // if needed (backend should also check query params for SSE auth)
    if (token && token !== "auth-disabled") {
      url.searchParams.set("token", token);
    }

    const source = new EventSource(url.toString());

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        onEvent(data);
      } catch {
        // Ignore parse errors (keepalive comments, etc.)
      }
    };

    source.onerror = (event) => {
      onError?.(event);
    };

    // Return cleanup function
    return () => {
      source.close();
    };
  },
};

// ══════════════════════════════════════════
// HEALTH
// ══════════════════════════════════════════

export const health = {
  async check(): Promise<{
    status: string;
    version: string;
    cache: Record<string, unknown>;
  }> {
    const resp = await fetch(`${BASE_URL}/health`);
    return resp.json();
  },
};

// ══════════════════════════════════════════
// CONVENIENCE — Combined client export
// ══════════════════════════════════════════

/**
 * The API client. Usage:
 *
 * ```ts
 * import { api } from "./lib/client";
 *
 * // Chat drives everything
 * const resp = await api.chat.send("show boards");
 * // resp.ui_action === "list_boards"
 * // resp.data === { boards: [...] }
 *
 * // Canvas
 * const scene = await api.canvas.getScene("ws-123");
 * await api.canvas.sync("ws-123", scene.version, updatedScene);
 *
 * // SSE
 * const unsub = api.canvas.subscribe("ws-123", (e) => console.log(e));
 *
 * // Auth
 * await api.auth.loginWithGoogle(googleToken);
 * const me = await api.auth.me();
 * ```
 */
export const api = {
  auth,
  chat,
  canvas,
  health,
} as const;

// Also export individually for tree-shaking
export { ApiError };
export type { ChatRequest as _ChatRequest }; // re-export if needed