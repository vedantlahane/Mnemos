import { parseNLPIntent } from "../utils/nlpParser"
import type {
  AuthState,
  AuthTokens,
  BlockCreateRequest,
  BlockMoveRequest,
  BlockReference,
  BlockReferenceCreateRequest,
  BlockUpdateRequest,
  CacheStats,
  CanvasOp,
  CanvasStreamRequest,
  CaptureRequest,
  ChatConversation,
  ChatRequest,
  ChatResponse,
  CuratorApplyRequest,
  CuratorScanResult,
  DiagramTopology,
  DocumentUpdateRequest,
  Edge,
  EdgeCreateRequest,
  FullGraph,
  InlineEmbed,
  InlineEmbedCreateRequest,
  IntentDecision,
  ModelCatalog,
  Note,
  NoteMoveRequest,
  NoteUpdateRequest,
  Page,
  PageBlock,
  PageCreateRequest,
  PageDocument,
  PageStats,
  PageSummary,
  PageUpdateRequest,
  ReadingStep,
  Region,
  Scene,
  SearchResponse,
  SettingsUpdateRequest,
  TagCount,
  TagSearchResponse,
  UserSettings,
  WorkspaceOverview,
  WorkspaceStats,
} from "../types"

const RAW_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"
const BASE_URL = RAW_BASE_URL.replace(/\/$/, "").replace(/\/api$/, "")
const API = `${BASE_URL}/api`

const TOKEN_KEY = "mnemos-token"
const REFRESH_TOKEN_KEY = "mnemos-refresh-token"
const SCENE_STORAGE_PREFIX = "mnemos:v2:scene:"
const VIEWPORT_STORAGE_PREFIX = "mnemos:v2:viewport:"

class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

let accessToken: string | null = localStorage.getItem(TOKEN_KEY)
let refreshToken: string | null = localStorage.getItem(REFRESH_TOKEN_KEY)
let onAuthError: (() => void) | null = null

function setStoredTokenPair(access: string | null, refresh: string | null): void {
  accessToken = access
  refreshToken = refresh

  if (access) {
    localStorage.setItem(TOKEN_KEY, access)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }

  if (refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  try {
    return await response.text()
  } catch {
    return null
  }
}

function getErrorMessageFromBody(status: number, body: unknown, fallbackStatusText: string): string {
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>

    if (typeof rec.detail === "string") {
      return rec.detail
    }

    if (Array.isArray(rec.detail)) {
      const first = rec.detail[0]
      if (first && typeof first === "object") {
        const msg = (first as Record<string, unknown>).msg
        if (typeof msg === "string") {
          return msg
        }
      }
      return JSON.stringify(rec.detail)
    }
  }

  if (typeof body === "string" && body.trim().length > 0) {
    return body
  }

  return `HTTP ${status}: ${fallbackStatusText}`
}

async function tryRefreshToken(): Promise<boolean> {
  if (!refreshToken) {
    return false
  }

  try {
    const response = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) {
      return false
    }

    const data = (await parseResponseBody(response)) as { access_token?: string } | null
    if (!data?.access_token) {
      return false
    }

    setStoredTokenPair(data.access_token, refreshToken)
    return true
  } catch {
    return false
  }
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  attemptRefresh = true,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && options.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  if (accessToken && accessToken !== "auth-disabled") {
    headers.set("Authorization", `Bearer ${accessToken}`)
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401 && attemptRefresh && refreshToken) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      return apiFetch<T>(path, options, false)
    }

    onAuthError?.()
  }

  if (!response.ok) {
    const body = await parseResponseBody(response)
    throw new ApiError(
      response.status,
      getErrorMessageFromBody(response.status, body, response.statusText),
      body,
    )
  }

  if (response.status === 204) {
    return {} as T
  }

  const body = await parseResponseBody(response)
  return body as T
}

function isMissingRouteError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

function sceneStorageKey(pageId: string): string {
  return `${SCENE_STORAGE_PREFIX}${pageId}`
}

function viewportStorageKey(pageId: string): string {
  return `${VIEWPORT_STORAGE_PREFIX}${pageId}`
}

function getEmptyScene(): Scene {
  return {
    elements: [],
    appState: {
      viewBackgroundColor: "#0e0e1a",
      theme: "dark",
    },
    files: {},
  }
}

function normalizeScene(raw: unknown): Scene {
  if (!raw || typeof raw !== "object") {
    return getEmptyScene()
  }

  const rec = raw as Record<string, unknown>
  const appStateRaw = rec.appState && typeof rec.appState === "object" ? (rec.appState as Record<string, unknown>) : {}
  const theme = appStateRaw.theme === "light" ? "light" : "dark"
  const viewBackgroundColor =
    typeof appStateRaw.viewBackgroundColor === "string" ? appStateRaw.viewBackgroundColor : "#0e0e1a"

  return {
    elements: Array.isArray(rec.elements)
      ? (rec.elements as Array<Record<string, unknown>>).map((el) => {
          const copy = { ...el }
          if (!Array.isArray(copy.groupIds)) {
            copy.groupIds = []
          }
          if (copy.frameId === undefined) {
            copy.frameId = null
          }
          if (!copy.customData || typeof copy.customData !== "object") {
            copy.customData = {}
          }
          return copy
        })
      : [],
    appState: {
      ...appStateRaw,
      theme,
      viewBackgroundColor,
    },
    files: rec.files && typeof rec.files === "object" ? (rec.files as Record<string, unknown>) : {},
  }
}

function readLocalScene(pageId: string): Scene {
  try {
    const raw = localStorage.getItem(sceneStorageKey(pageId))
    if (!raw) {
      return getEmptyScene()
    }
    return normalizeScene(JSON.parse(raw) as unknown)
  } catch {
    return getEmptyScene()
  }
}

function writeLocalScene(pageId: string, scene: Scene): void {
  try {
    localStorage.setItem(sceneStorageKey(pageId), JSON.stringify(scene))
  } catch {
    // No-op on storage quota or private mode.
  }
}

function readLocalViewport(pageId: string): { scroll_x: number; scroll_y: number; zoom: number } {
  try {
    const raw = localStorage.getItem(viewportStorageKey(pageId))
    if (!raw) {
      return { scroll_x: 0, scroll_y: 0, zoom: 1 }
    }
    const parsed = JSON.parse(raw) as Partial<{ scroll_x: number; scroll_y: number; zoom: number }>
    return {
      scroll_x: typeof parsed.scroll_x === "number" ? parsed.scroll_x : 0,
      scroll_y: typeof parsed.scroll_y === "number" ? parsed.scroll_y : 0,
      zoom: typeof parsed.zoom === "number" ? parsed.zoom : 1,
    }
  } catch {
    return { scroll_x: 0, scroll_y: 0, zoom: 1 }
  }
}

function writeLocalViewport(pageId: string, viewport: { scroll_x: number; scroll_y: number; zoom: number }): void {
  try {
    localStorage.setItem(viewportStorageKey(pageId), JSON.stringify(viewport))
  } catch {
    // No-op on storage quota or private mode.
  }
}

function computeVisualContextFromScene(pageId: string, scene: Scene) {
  const elements = Array.isArray(scene.elements) ? scene.elements : []
  const background =
    typeof scene.appState.viewBackgroundColor === "string" ? scene.appState.viewBackgroundColor : "#0e0e1a"
  const theme = scene.appState.theme === "light" ? "light" : "dark"

  return {
    page_id: pageId,
    background_color: background,
    theme,
    dominant_colors: [background],
    layout_pattern: "freeform" as const,
    reading_direction: "mixed" as const,
    density: elements.length === 0 ? ("empty" as const) : ("sparse" as const),
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    element_count: elements.length,
  }
}

async function resolvePageIdFromHint(pageHint?: string): Promise<string | null> {
  try {
    const listed = await pages.list(true)
    if (!pageHint || !pageHint.trim()) {
      const uncategorized = listed.pages.find((p) => p.name.toLowerCase() === "uncategorized")
      if (uncategorized) {
        return uncategorized.id
      }
      return listed.pages[0]?.id ?? null
    }

    const normalized = pageHint.trim().toLowerCase()
    const exact = listed.pages.find((p) => p.name.toLowerCase() === normalized)
    if (exact) {
      return exact.id
    }
    const fuzzy = listed.pages.find((p) => p.name.toLowerCase().includes(normalized))
    return fuzzy?.id ?? listed.pages[0]?.id ?? null
  } catch {
    return null
  }
}

async function streamCaptureFallback(pageId: string, request: CaptureRequest): Promise<{ status: string; note_id: string }> {
  const message = `capture: ${request.text}`
  let capturedNoteId: string | null = null

  for await (const op of canvasChat.stream(pageId, {
    message,
    viewport: request.viewport,
    history: [],
    context_type: "page",
  })) {
    if (op.op === "create_note") {
      capturedNoteId = op.note_id || op.note?.id || null
    }
  }

  if (!capturedNoteId) {
    throw new Error("Capture route unavailable and canvas chat fallback did not return a note id")
  }

  return { status: "captured_via_canvas_chat", note_id: capturedNoteId }
}

export const auth = {
  setTokens(access: string, refresh: string): void {
    setStoredTokenPair(access, refresh)
  },

  clearTokens(): void {
    setStoredTokenPair(null, null)
  },

  onError(callback: () => void): void {
    onAuthError = callback
  },

  me(): Promise<AuthState> {
    return apiFetch<AuthState>("/auth/me")
  },

  async loginGoogle(token: string): Promise<AuthTokens> {
    const tokens = await apiFetch<AuthTokens>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
    setStoredTokenPair(tokens.access_token, tokens.refresh_token)
    return tokens
  },

  async refresh(token: string): Promise<{ access_token: string }> {
    const refreshed = await apiFetch<{ access_token: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: token }),
    })
    setStoredTokenPair(refreshed.access_token, refreshToken)
    return refreshed
  },
}

export const pages = {
  list(includeArchived = false): Promise<{ pages: Page[] }> {
    return apiFetch(`/pages?include_archived=${includeArchived}`)
  },

  get(pageId: string): Promise<Page> {
    return apiFetch(`/pages/${pageId}`)
  },

  create(data: PageCreateRequest): Promise<Page> {
    return apiFetch("/pages", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  update(pageId: string, data: PageUpdateRequest): Promise<Page> {
    return apiFetch(`/pages/${pageId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  delete(pageId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}`, { method: "DELETE" })
  },
}

export const scene = {
  async get(pageId: string): Promise<{
    scene: Scene
    viewport: { scroll_x: number; scroll_y: number; zoom: number }
  }> {
    return {
      scene: readLocalScene(pageId),
      viewport: readLocalViewport(pageId),
    }
  },

  async save(pageId: string, data: { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> }): Promise<{ status: string }> {
    writeLocalScene(pageId, normalizeScene(data))
    return { status: "saved_local" }
  },

  async saveViewport(pageId: string, data: { scroll_x: number; scroll_y: number; zoom: number }): Promise<{ status: string }> {
    writeLocalViewport(pageId, data)
    return { status: "saved_local" }
  },

  async getVisualContext(pageId: string) {
    return computeVisualContextFromScene(pageId, readLocalScene(pageId))
  },

  async triggerLayout(pageId: string): Promise<{ status: string; positions: unknown[]; clusters: unknown[]; edges: unknown[] }> {
    try {
      for await (const _op of canvasChat.stream(pageId, {
        message: "/organize",
        history: [],
        context_type: "page",
      })) {
        // Consume until done.
      }
    } catch {
      // Preserve graceful fallback.
    }

    return { status: "arranged_via_chat", positions: [], clusters: [], edges: [] }
  },

  async syncNotes(_pageId: string): Promise<{ status: string }> {
    return { status: "unsupported" }
  },
}

export const canvas = {
  async listElements(_pageId: string): Promise<{ elements: Array<Record<string, unknown>> }> {
    return { elements: [] }
  },

  async getElement(_pageId: string, _elementId: string): Promise<Record<string, unknown>> {
    return {}
  },

  async deleteElement(_pageId: string, _elementId: string): Promise<{ status: string }> {
    return { status: "unsupported" }
  },

  async listRegions(_pageId: string): Promise<{ regions: Region[] }> {
    return { regions: [] }
  },

  async createRegion(pageId: string, data: {
    label: string
    description?: string
    color?: string
    region_type?: Region["region_type"]
    layout_hint?: string
  }): Promise<Region> {
    return {
      id: `local-region-${Date.now()}`,
      page_id: pageId,
      label: data.label,
      description: data.description || null,
      color: data.color || null,
      region_type: data.region_type || "cluster",
      layout_hint: data.layout_hint || "auto",
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  },

  async updateRegion(pageId: string, regionId: string, data: Partial<Pick<Region, "label" | "description" | "color" | "layout_hint">>): Promise<Region> {
    return {
      id: regionId,
      page_id: pageId,
      label: data.label || null,
      description: data.description || null,
      color: data.color || null,
      region_type: "cluster",
      layout_hint: data.layout_hint || "auto",
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  },

  async deleteRegion(_pageId: string, _regionId: string): Promise<{ status: string }> {
    return { status: "unsupported" }
  },

  async assignToRegion(_pageId: string, _regionId: string, _elementId: string): Promise<{ status: string }> {
    return { status: "unsupported" }
  },

  async unassignFromRegion(_pageId: string, _regionId: string, _elementId: string): Promise<{ status: string }> {
    return { status: "unsupported" }
  },
}

export const notes = {
  list(params: { page?: number; limit?: number; tag?: string; page_id?: string } = {}): Promise<{ notes: Note[]; total: number }> {
    const query = new URLSearchParams()
    if (params.page) query.set("page", String(params.page))
    if (params.limit) query.set("limit", String(params.limit))
    if (params.tag) query.set("tag", params.tag)
    if (params.page_id) query.set("page_id", params.page_id)
    return apiFetch(`/notes?${query.toString()}`)
  },

  get(noteId: string): Promise<Note> {
    return apiFetch(`/notes/${noteId}`)
  },

  update(noteId: string, data: NoteUpdateRequest): Promise<Note> {
    return apiFetch(`/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  delete(noteId: string): Promise<{ status: string }> {
    return apiFetch(`/notes/${noteId}`, { method: "DELETE" })
  },

  retry(noteId: string): Promise<{ status: string }> {
    return apiFetch(`/notes/${noteId}/retry`, { method: "POST" })
  },

  move(noteId: string, pageId: string): Promise<{ status: string; from_page: string; to_page: string }> {
    const payload: NoteMoveRequest = { page_id: pageId }
    return apiFetch(`/notes/${noteId}/move`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  tags(): Promise<{ tags: TagCount[] }> {
    return apiFetch("/tags")
  },
}

export const capture = {
  async single(data: CaptureRequest): Promise<{ status: string; note_id: string }> {
    const pageId = await resolvePageIdFromHint(data.page_hint)
    if (!pageId) {
      throw new Error("Capture route is unavailable and no page could be resolved for canvas-chat fallback")
    }

    return streamCaptureFallback(pageId, data)
  },

  async batch(items: CaptureRequest[]): Promise<{ status: string; count: number; notes: Array<{ note_id: string; status: string }> }> {
    const results: Array<{ note_id: string; status: string }> = []
    for (const item of items) {
      const captured = await capture.single(item)
      results.push({ note_id: captured.note_id, status: captured.status })
    }
    return {
      status: "batch_completed",
      count: results.length,
      notes: results,
    }
  },
}

export const chat = {
  send(data: ChatRequest): Promise<ChatResponse> {
    return apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },
}

export const canvasChat = {
  async *stream(pageId: string, data: CanvasStreamRequest): AsyncGenerator<CanvasOp> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (accessToken && accessToken !== "auth-disabled") {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch(`${API}/pages/${pageId}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const body = await parseResponseBody(response)
      throw new ApiError(
        response.status,
        getErrorMessageFromBody(response.status, body, response.statusText),
        body,
      )
    }

    if (!response.body) {
      throw new Error("Canvas chat stream has no response body")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const event of events) {
          const lines = event.split("\n")
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) {
              continue
            }

            const payload = trimmed.slice(5).trim()
            if (!payload) {
              continue
            }

            try {
              const op = JSON.parse(payload) as CanvasOp
              yield op
              if (op.op === "done") {
                return
              }
            } catch {
              // Ignore malformed SSE payloads and keep stream alive.
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  },
}

export const document = {
  get(pageId: string): Promise<{ document: PageDocument | null; blocks: PageBlock[]; page: Page }> {
    return apiFetch(`/pages/${pageId}/document`)
  },

  updateSettings(pageId: string, data: DocumentUpdateRequest): Promise<PageDocument> {
    return apiFetch(`/pages/${pageId}/document`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  listBlocks(pageId: string): Promise<{ blocks: PageBlock[] }> {
    return apiFetch(`/pages/${pageId}/blocks`)
  },

  createBlock(pageId: string, data: BlockCreateRequest): Promise<PageBlock> {
    return apiFetch(`/pages/${pageId}/blocks`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateBlock(pageId: string, blockId: string, data: BlockUpdateRequest): Promise<PageBlock> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },

  deleteBlock(pageId: string, blockId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}`, { method: "DELETE" })
  },

  moveBlock(pageId: string, blockId: string, data: BlockMoveRequest): Promise<PageBlock> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/move`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  rebalanceBlocks(pageId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/blocks/rebalance`, { method: "POST" })
  },

  listReferences(pageId: string, blockId: string): Promise<{ references: BlockReference[] }> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/references`)
  },

  createReference(pageId: string, blockId: string, data: BlockReferenceCreateRequest): Promise<BlockReference> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/references`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  deleteReference(pageId: string, refId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/references/${refId}`, { method: "DELETE" })
  },

  listEmbeds(pageId: string, blockId: string): Promise<{ embeds: InlineEmbed[] }> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/embeds`)
  },

  createEmbed(pageId: string, blockId: string, data: InlineEmbedCreateRequest): Promise<InlineEmbed> {
    return apiFetch(`/pages/${pageId}/blocks/${blockId}/embeds`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  deleteEmbed(pageId: string, embedId: string): Promise<{ status: string }> {
    return apiFetch(`/pages/${pageId}/embeds/${embedId}`, { method: "DELETE" })
  },
}

export const documentApi = {
  get: document.get,
  updateSettings: document.updateSettings,
  listBlocks: document.listBlocks,
  createBlock: document.createBlock,
  updateBlock: document.updateBlock,
  deleteBlock: document.deleteBlock,
  moveBlock: document.moveBlock,
  rebalance: document.rebalanceBlocks,
  listReferences: document.listReferences,
  createReference: document.createReference,
  deleteReference: document.deleteReference,
  listEmbeds: document.listEmbeds,
  createEmbed: document.createEmbed,
  deleteEmbed: document.deleteEmbed,
}

export const graph = {
  allEdges(): Promise<{ edges: Edge[] }> {
    return apiFetch("/graph/edges")
  },

  noteEdges(noteId: string): Promise<{ edges: Edge[] }> {
    return apiFetch(`/graph/edges/note/${noteId}`)
  },

  pageEdges(pageId: string): Promise<{ edges: Edge[] }> {
    return apiFetch(`/graph/edges/page/${pageId}`)
  },

  createEdge(data: EdgeCreateRequest): Promise<Edge> {
    return apiFetch("/graph/edges", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  deleteEdge(edgeId: string): Promise<{ status: string }> {
    return apiFetch(`/graph/edges/${edgeId}`, { method: "DELETE" })
  },

  full(): Promise<FullGraph> {
    return apiFetch("/graph/full")
  },
}

export const search = {
  semantic(params: { q: string; page_id?: string; limit?: number; threshold?: number }): Promise<SearchResponse> {
    const qs = new URLSearchParams({ q: params.q })
    if (params.page_id) qs.set("page_id", params.page_id)
    if (params.limit) qs.set("limit", String(params.limit))
    if (params.threshold) qs.set("threshold", String(params.threshold))
    return apiFetch(`/search?${qs.toString()}`)
  },

  byTags(tags: string[]): Promise<TagSearchResponse> {
    return apiFetch(`/search/tags?tags=${encodeURIComponent(tags.join(","))}`)
  },
}

export const workspace = {
  overview(): Promise<WorkspaceOverview> {
    return apiFetch("/workspace/overview")
  },

  stats(): Promise<WorkspaceStats> {
    return apiFetch("/workspace/stats")
  },
}

export const ai = {
  curatorScan(): Promise<CuratorScanResult> {
    return apiFetch("/ai/curator/scan", { method: "POST" })
  },

  curatorApply(data: CuratorApplyRequest): Promise<Record<string, unknown>> {
    return apiFetch("/ai/curator/apply", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  analyzePage(pageId: string): Promise<{
    visual_context: Record<string, unknown>
    note_count: number
    edge_count: number
    region_count: number
    analysis: {
      layout_pattern: string
      density: string
      reading_direction: string
      theme: string
      colors: string[]
    }
  }> {
    return apiFetch(`/ai/analyze/page/${pageId}`, { method: "POST" })
  },

  retryStuck(): Promise<{ retrying: number }> {
    return apiFetch("/ai/retry-stuck", { method: "POST" })
  },
}

export const settings = {
  get(): Promise<UserSettings> {
    return apiFetch("/settings")
  },

  update(data: SettingsUpdateRequest): Promise<{ status: string }> {
    return apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },
}

export const chatHistory = {
  async list(_limit = 20): Promise<{ conversations: ChatConversation[] }> {
    return { conversations: [] }
  },

  async get(_id: string): Promise<ChatConversation> {
    throw new Error("Chat history is not supported/implemented in backend")
  },

  async save(_data: {
    context_type: string
    context_id?: string
    messages: ChatConversation["messages"]
    title?: string
  }): Promise<ChatConversation> {
    throw new Error("Chat history is not supported/implemented in backend")
  },

  async delete(_id: string): Promise<{ status: string }> {
    return { status: "unsupported" }
  },
}

export const health = {
  async check(): Promise<{
    status: string
    version: string
    cache: CacheStats
    providers?: { google: boolean; groq: boolean }
    auth_enabled?: boolean
  } | null> {
    try {
      const response = await fetch(`${BASE_URL}/health`)
      if (!response.ok) {
        return null
      }
      return (await parseResponseBody(response)) as {
        status: string
        version: string
        cache: CacheStats
        providers?: { google: boolean; groq: boolean }
        auth_enabled?: boolean
      }
    } catch {
      return null
    }
  },
}

async function getAllNotesForExport(pageId?: string): Promise<Note[]> {
  const collected: Note[] = []
  let page = 1
  const limit = 200

  while (page <= 10) {
    const chunk = await notes.list({ page, limit, page_id: pageId })
    collected.push(...chunk.notes)
    if (chunk.notes.length < limit) {
      break
    }
    page += 1
  }

  return collected
}

function toWorkspaceStatsCompat(stats: WorkspaceStats, tagCount: number, notesList: Note[]): WorkspaceStats {
  const statusCounts: Record<string, number> = {}
  for (const note of notesList) {
    const key = note.processing_status || "pending"
    statusCounts[key] = (statusCounts[key] || 0) + 1
  }

  const totalTasks = notesList.reduce((sum, note) => sum + note.tasks.length, 0)
  const lastCapture = notesList
    .map((n) => n.created_at)
    .sort()
    .at(-1)

  return {
    ...stats,
    total_notes: stats.notes,
    total_pages: stats.pages,
    total_tags: tagCount,
    total_tasks: totalTasks,
    status_counts: statusCounts,
    last_capture: lastCapture || null,
  }
}

async function buildPageStatsCompat(pageId: string): Promise<PageStats> {
  try {
    const direct = await apiFetch<PageStats>(`/pages/${pageId}/stats`)
    return {
      ...direct,
      cluster_count: direct.region_count,
    }
  } catch (error) {
    if (!isMissingRouteError(error)) {
      throw error
    }
  }

  const [notesResult, edgesResult, regionsResult, sceneResult] = await Promise.allSettled([
    notes.list({ page: 1, limit: 500, page_id: pageId }),
    graph.pageEdges(pageId),
    canvas.listRegions(pageId),
    scene.get(pageId),
  ])

  const pageNotes = notesResult.status === "fulfilled" ? notesResult.value.notes : []
  const pageEdges = edgesResult.status === "fulfilled" ? edgesResult.value.edges : []
  const pageRegions = regionsResult.status === "fulfilled" ? regionsResult.value.regions : []
  const sceneElements = sceneResult.status === "fulfilled" ? sceneResult.value.scene.elements : []

  const tagsMap = new Map<string, number>()
  for (const note of pageNotes) {
    for (const tag of note.tags) {
      tagsMap.set(tag, (tagsMap.get(tag) || 0) + 1)
    }
  }

  const tags: TagCount[] = Array.from(tagsMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    note_count: pageNotes.length,
    edge_count: pageEdges.length,
    region_count: pageRegions.length,
    cluster_count: pageRegions.length,
    element_count: sceneElements.length,
    tags,
  }
}

async function detectIntentLocally(query: string, contextType: string): Promise<IntentDecision> {
  const parsed = parseNLPIntent(query)

  if (parsed.type === "none" || parsed.type === "ask") {
    return { mode: "chat", confidence: parsed.confidence }
  }

  if (contextType !== "page" && ["add", "write", "diagram", "find"].includes(parsed.type)) {
    return { mode: "chat", confidence: parsed.confidence }
  }

  switch (parsed.type) {
    case "capture":
      return { mode: "command", command: "/capture", args: parsed.content, confidence: parsed.confidence }
    case "search":
      return { mode: "command", command: "/search", args: parsed.content, confidence: parsed.confidence }
    case "find":
      return { mode: "command", command: "/find", args: parsed.content, confidence: parsed.confidence }
    case "diagram":
      return { mode: "command", command: "/diagram", args: parsed.content, confidence: parsed.confidence }
    case "add": {
      const prefix = parsed.subType === "sticky" ? "sticky:" : "note:"
      return {
        mode: "command",
        command: "/add",
        args: `${prefix} ${parsed.content}`,
        confidence: parsed.confidence,
      }
    }
    case "write":
      return { mode: "command", command: "/compose", args: `exact: ${parsed.content}`, confidence: parsed.confidence }
    default:
      return { mode: "chat", confidence: parsed.confidence }
  }
}

export const api = {
  // Auth
  authGoogle: auth.loginGoogle,
  authRefresh: auth.refresh,
  authMe: auth.me,

  // Pages
  listPages: pages.list,
  createPage: pages.create,
  getPage: pages.get,
  updatePage: pages.update,
  deletePage: pages.delete,

  // Scene compatibility
  async getPageCanvas(pageId: string): Promise<{
    page: Page
    scene_data: Scene
    canvas_data: Scene
    notes: Note[]
    edges: Edge[]
    clusters: Region[]
    regions: Region[]
    visual_context: ReturnType<typeof computeVisualContextFromScene> | null
    viewport: { scroll_x: number; scroll_y: number; zoom: number }
    elements: Array<{
      id: string
      element_type: string
      content?: string | null
      position_x?: number | null
      position_y?: number | null
    }>
  }> {
    const [page, loadedScene, pageNotes, pageEdges, pageRegions] = await Promise.all([
      pages.get(pageId),
      scene.get(pageId),
      notes.list({ page: 1, limit: 500, page_id: pageId }).then((r) => r.notes).catch(() => []),
      graph.pageEdges(pageId).then((r) => r.edges).catch(() => []),
      canvas.listRegions(pageId).then((r) => r.regions).catch(() => []),
    ])

    const visualContext = computeVisualContextFromScene(pageId, loadedScene.scene)

    return {
      page,
      scene_data: loadedScene.scene,
      canvas_data: loadedScene.scene,
      notes: pageNotes,
      edges: pageEdges,
      clusters: pageRegions,
      regions: pageRegions,
      visual_context: visualContext,
      viewport: loadedScene.viewport,
      elements: [],
    }
  },

  async savePageCanvas(
    pageId: string,
    payload: { canvas_data?: Scene; viewport?: { x?: number; y?: number; scroll_x?: number; scroll_y?: number; zoom?: number } },
  ): Promise<{ status: string }> {
    let status = "noop"

    if (payload.canvas_data) {
      const saveResult = await scene.save(pageId, {
        elements: payload.canvas_data.elements,
        appState: payload.canvas_data.appState,
        files: payload.canvas_data.files,
      })
      status = saveResult.status
    }

    if (payload.viewport) {
      const viewportResult = await scene.saveViewport(pageId, {
        scroll_x: typeof payload.viewport.scroll_x === "number" ? payload.viewport.scroll_x : payload.viewport.x || 0,
        scroll_y: typeof payload.viewport.scroll_y === "number" ? payload.viewport.scroll_y : payload.viewport.y || 0,
        zoom: payload.viewport.zoom || 1,
      })
      status = viewportResult.status
    }

    return { status }
  },

  triggerPageLayout: scene.triggerLayout,

  // Notes
  listNotes: async (page = 1, limit = 20, tag?: string, pageId?: string) =>
    notes.list({ page, limit, tag, page_id: pageId }),
  getNote: notes.get,
  updateNote: notes.update,
  deleteNote: notes.delete,
  retryNote: notes.retry,
  moveNote: notes.move,

  // Capture
  capture: capture.single,

  // Graph
  listEdges: async (pageId?: string, noteId?: string) => {
    if (noteId) return graph.noteEdges(noteId)
    if (pageId) return graph.pageEdges(pageId)
    return graph.allEdges()
  },
  createEdge: graph.createEdge,
  deleteEdge: graph.deleteEdge,

  // Regions
  listClusters: async (pageId?: string) => {
    if (!pageId) return { clusters: [] as Region[] }
    const regions = await canvas.listRegions(pageId)
    return { clusters: regions.regions }
  },
  createCluster: (data: { page_id: string; label: string; description?: string; color?: string }) =>
    canvas.createRegion(data.page_id, data),
  updateCluster: async (id: string, data: Record<string, unknown>) => {
    const pageId = typeof data.page_id === "string" ? data.page_id : ""
    if (!pageId) throw new Error("page_id is required")
    return canvas.updateRegion(pageId, id, data as Partial<Pick<Region, "label" | "description" | "color" | "layout_hint">>)
  },
  deleteCluster: async (_id: string) => ({ status: "unsupported" }),

  listElements: canvas.listElements,
  deleteElement: async (_id: string) => ({ status: "unsupported" }),

  // Search
  search: (q: string, limit = 10, pageId?: string) =>
    search.semantic({ q, limit, page_id: pageId }),

  // Chat
  chat: async (
    question: string,
    history: Array<{ role: string; content: string }>,
    contextType = "home",
    pageId?: string,
  ) => {
    const response = await chat.send({
      question,
      history: history as Array<{ role: "user" | "assistant"; content: string }>,
      context_type: contextType,
      page_id: pageId,
    })

    return {
      answer: response.response,
      sources: response.sources,
      follow_ups: [] as string[],
    }
  },

  // Tags
  getTags: notes.tags,

  // Stats
  getStats: async () => {
    const [stats, tags, allNotes] = await Promise.all([
      workspace.stats(),
      notes.tags().catch(() => ({ tags: [] as TagCount[] })),
      getAllNotesForExport().catch(() => []),
    ])
    return toWorkspaceStatsCompat(stats, tags.tags.length, allNotes)
  },

  getPageStats: buildPageStatsCompat,

  // Notebook
  getPageDocument: document.get,
  createPageBlock: document.createBlock,
  updatePageBlock: document.updateBlock,
  deletePageBlock: document.deleteBlock,

  // History
  listHistory: chatHistory.list,
  getHistory: chatHistory.get,
  saveHistory: chatHistory.save,
  deleteHistory: chatHistory.delete,

  // Curator
  curatorScan: ai.curatorScan,
  curatorApply: (action: CuratorApplyRequest) => ai.curatorApply(action),

  // Settings
  getSettings: async () => {
    const remote = await settings.get()
    return {
      ...remote,
      theme: remote.theme,
    }
  },
  updateSettings: (data: Partial<Omit<UserSettings, "theme"> & { theme: "glass" | "dark" | "light" }>) => {
    const normalizedTheme = data.theme === "glass" ? "dark" : data.theme
    return settings.update({
      ...data,
      theme: normalizedTheme,
    })
  },

  readingPath: async (topic: string, pageId?: string): Promise<{ steps: ReadingStep[] }> => {
    const response = await chat.send({
      question: `Generate a reading path for ${topic}. Return strict JSON: {"steps":[{"title":"...","reason":"..."}]}.`,
      history: [],
      context_type: pageId ? "page" : "home",
      page_id: pageId,
    })

    try {
      const parsed = JSON.parse(response.response) as unknown
      const steps = Array.isArray(parsed)
        ? parsed
        : (parsed as { steps?: unknown }).steps

      const normalized = Array.isArray(steps)
        ? steps
            .filter((step) => step && typeof step === "object")
            .map((step) => {
              const rec = step as Record<string, unknown>
              return {
                title: typeof rec.title === "string" ? rec.title : "Untitled",
                reason: typeof rec.reason === "string" ? rec.reason : undefined,
              }
            })
        : []

      return { steps: normalized }
    } catch {
      return {
        steps: [{ title: response.response }],
      }
    }
  },

  // AI
  aiLayout: scene.triggerLayout,
  aiPosition: async (pageId: string, noteId: string) => {
    const loadedScene = await scene.get(pageId)
    const frame = loadedScene.scene.elements.find((el) => {
      const customData = el.customData as Record<string, unknown> | undefined
      return customData?.noteId === noteId && customData?.type === "note-frame"
    }) as Record<string, unknown> | undefined

    if (!frame) {
      return { x: 100, y: 100 }
    }

    return {
      x: typeof frame.x === "number" ? frame.x : 100,
      y: typeof frame.y === "number" ? frame.y : 100,
    }
  },

  pageSummary: async (pageId: string) => {
    const response = await chat.send({
      question: "Summarize this page and include key topics and notable connections.",
      history: [],
      context_type: "page",
      page_id: pageId,
    })

    return {
      summary: response.response,
      key_topics: response.sources.map((s) => s.title).slice(0, 6),
      connections: response.sources.map((s) => `${s.title} (${Math.round(s.similarity * 100)}%)`).slice(0, 6),
    }
  },

  searchCanvas: async (pageId: string, query: string) => {
    const loadedScene = await scene.get(pageId)
    const needle = query.toLowerCase().trim()
    const results = loadedScene.scene.elements
      .filter((el) => {
        const text = typeof el.text === "string" ? el.text.toLowerCase() : ""
        if (text.includes(needle)) {
          return true
        }
        const customData = el.customData as Record<string, unknown> | undefined
        const title = typeof customData?.title === "string" ? customData.title.toLowerCase() : ""
        return title.includes(needle)
      })
      .map((el) => ({
        id: String(el.id || ""),
        type: "element",
      }))

    return { results }
  },

  decideIntent: (query: string, contextType: string, _pageId?: string) =>
    detectIntentLocally(query, contextType),

  generateDiagram: async (request: string, pageId?: string): Promise<{ topology: DiagramTopology | null }> => {
    if (!pageId) {
      throw new Error("A page id is required for diagram generation")
    }

    let topology: DiagramTopology | null = null
    for await (const op of canvasChat.stream(pageId, {
      message: `/diagram ${request}`,
      history: [],
      context_type: "page",
    })) {
      if (op.op === "create_diagram" && op.topology) {
        topology = op.topology
      }
    }

    if (!topology) {
      throw new Error("Diagram generation completed without topology payload")
    }

    return { topology }
  },

  // Workspace
  getOverview: workspace.overview,

  exportWorkspace: async () => {
    const [allPages, allNotes, allEdges] = await Promise.all([
      pages.list(true).then((r) => r.pages as Array<Page & PageSummary>),
      getAllNotesForExport(),
      graph.allEdges().then((r) => r.edges),
    ])

    const noteCountByPage = new Map<string, number>()
    for (const note of allNotes) {
      if (!note.page_id) {
        continue
      }
      noteCountByPage.set(note.page_id, (noteCountByPage.get(note.page_id) || 0) + 1)
    }

    const pagesWithCounts = allPages.map((page) => ({
      ...page,
      note_count: noteCountByPage.get(page.id) || 0,
    }))

    return {
      exported_at: new Date().toISOString(),
      pages: pagesWithCounts,
      notes: allNotes,
      edges: allEdges,
    }
  },

  getModelCatalog: async (): Promise<ModelCatalog> => {
    // No backend endpoint in v2 route map; return canonical model defaults.
    return {
      google: [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
      ],
      groq: [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "qwen/qwen3-32b",
        "deepseek-r1-distill-llama-70b",
        "gemma2-9b-it",
      ],
    }
  },

  health: health.check,
}
