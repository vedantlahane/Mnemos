// ══════════════════════════════════════════
// KNOWLEDGE LAYER
// ══════════════════════════════════════════

export interface Item {
  id: string
  owner_id: string | null
  source_text: string
  source_url: string | null
  source_title: string | null
  source_type: "manual" | "extension" | "api" | "import"
  title: string | null
  summary: string | null
  content_type: ContentType
  tags: string[]
  entities: string[]
  tasks: string[]
  status: ItemStatus
  created_at: string
  updated_at: string
}

export type ContentType = "note" | "code" | "url" | "thought" | "question" | "snippet"
export type ItemStatus = "pending" | "processing" | "ready" | "error"

export interface ItemSummary {
  id: string
  title: string | null
  tags: string[]
  content_type: ContentType
  status: ItemStatus
  created_at: string
  similarity?: number
}

export interface ItemConnection {
  id: string
  from_id: string
  to_id: string
  rel_type: RelationType
  label: string | null
  score: number
  created_by: "system" | "user" | "curator"
  created_at: string
}

export type RelationType =
  | "related" | "depends_on" | "extends"
  | "contradicts" | "summarizes" | "example_of"

export interface TagCount {
  name: string
  count: number
}

// ══════════════════════════════════════════
// PRESENTATION LAYER
// ══════════════════════════════════════════

export interface Workspace {
  id: string
  owner_id: string | null
  slug: string
  display_name: string
  description: string | null
  icon: string
  color: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface ExcalidrawScene {
  elements: ExcalidrawElement[]
  appState: ExcalidrawAppState
  files: Record<string, unknown>
}

export interface ExcalidrawElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  groupIds?: string[]
  customData?: Record<string, unknown>
  [key: string]: unknown
}

export interface ExcalidrawAppState {
  viewBackgroundColor: string
  theme: "dark" | "light"
  [key: string]: unknown
}

// ══════════════════════════════════════════
// SUPPORT LAYER
// ══════════════════════════════════════════

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

export interface Preferences {
  owner_id?: string
  theme: "dark" | "light"
  primary_model: string
  secondary_model: string
  similarity_threshold: number
  auto_layout: boolean
  auto_connect: boolean
  updated_at?: string
}

// ══════════════════════════════════════════
// CHAT — THE unified interface
// ══════════════════════════════════════════

export interface ChatRequest {
  message: string
  workspace_id?: string | null
  history?: ChatMessage[]
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatResponse {
  text: string
  intent: Intent
  ui_action: UIAction
  data: unknown
  canvas_update: CanvasUpdate | null
  error: string | null
}

export type Intent =
  | "navigate" | "capture" | "query"
  | "canvas" | "manage" | "settings" | "chat"

export type UIAction =
  | "open_settings" | "list_boards" | "list_items" | "open_board"
  | "open_graph" | "list_tags" | "show_stats" | "show_search"
  | null

export interface CanvasUpdate {
  version: number
  action: "reload" | "patch"
}

// ── Typed data payloads ──

export interface BoardListData { boards: Workspace[] }
export interface ItemListData  { items: Item[]; total: number }
export interface OpenBoardData { board: Workspace }
export interface SearchData    { query: string; results: ItemSummary[] }
export interface TagListData   { tags: TagCount[] }

export interface GraphNode {
  id: string
  title: string
  tags: string[]
  content_type: ContentType
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: RelationType
  label: string | null
  weight: number
}

export interface GraphData  { nodes: GraphNode[]; edges: GraphEdge[] }
export interface StatsData  { total_items: number; total_workspaces: number; total_tags: number; statuses: Record<string, number> }
export interface CaptureData { item_id: string; status: string }

// ══════════════════════════════════════════
// CANVAS SYNC
// ══════════════════════════════════════════

export interface SyncRequest {
  base_version: number
  scene?: ExcalidrawScene | null
}

export interface SyncResponse {
  status: "ok" | "full_reload"
  version: number
  scene?: ExcalidrawScene
}

export interface SceneResponse {
  scene: ExcalidrawScene
  version: number
  workspace_id: string
}

// ══════════════════════════════════════════
// SSE
// ══════════════════════════════════════════

export interface SSEEvent {
  type: "connected" | "canvas_updated"
  workspace_id?: string
  version?: number
  op?: string
  item_id?: string
}

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════

export interface AuthState {
  auth_enabled: boolean
  user: User | null
  google_client_id?: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: User
}

// ══════════════════════════════════════════
// UI STATE (frontend-only)
// ══════════════════════════════════════════

export type ActivePanel =
  | "none" | "settings" | "boards" | "items"
  | "graph" | "tags" | "stats" | "search"