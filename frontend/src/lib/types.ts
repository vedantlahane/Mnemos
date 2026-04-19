// === FILE: frontend/src/lib/types.ts ===

/**
 * Mnemos v4 — Frontend Type System
 *
 * Three layers, matching backend schema:
 *   KNOWLEDGE:     Item, ItemConnection, ItemEmbedding
 *   PRESENTATION:  Workspace, CanvasPlacement, CanvasObject, CanvasState
 *   SUPPORT:       User, Conversation, Preferences
 *
 * Plus: Command/Response types for the unified chat interface
 */

// ══════════════════════════════════════════
// KNOWLEDGE LAYER
// ══════════════════════════════════════════

export interface Item {
  id: string;
  owner_id: string | null;

  // Content
  source_text: string;
  source_url: string | null;
  source_title: string | null;
  source_type: SourceType;

  // AI-extracted
  title: string | null;
  summary: string | null;
  content_type: ContentType;
  tags: string[];
  entities: string[];
  tasks: string[];

  // Processing
  status: ItemStatus;

  created_at: string;
  updated_at: string;
}

export type SourceType = "manual" | "extension" | "api" | "import";

export type ContentType =
  | "note"
  | "code"
  | "url"
  | "thought"
  | "question"
  | "snippet";

export type ItemStatus = "pending" | "processing" | "ready" | "error";

/** Partial item for lists / search results where we don't need everything */
export interface ItemSummary {
  id: string;
  title: string | null;
  tags: string[];
  content_type: ContentType;
  status: ItemStatus;
  created_at: string;
  similarity?: number; // present in search results
}

export interface ItemConnection {
  id: string;
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  label: string | null;
  score: number;
  created_by: "system" | "user" | "curator";
  created_at: string;
}

export type RelationType =
  | "related"
  | "depends_on"
  | "extends"
  | "contradicts"
  | "summarizes"
  | "example_of";

export interface TagCount {
  name: string;
  count: number;
}

// ══════════════════════════════════════════
// PRESENTATION LAYER
// ══════════════════════════════════════════

export interface Workspace {
  id: string;
  owner_id: string | null;
  slug: string;
  display_name: string;
  description: string | null;
  icon: string;
  color: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Item's position on a specific workspace canvas */
export interface CanvasPlacement {
  workspace_id: string;
  item_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  element_ids: string[];
  updated_at: string;
}

/** Non-item canvas element (diagram, sticky, composed text) */
export interface CanvasObject {
  id: string;
  workspace_id: string;
  kind: CanvasObjectKind;
  origin: "user" | "ai";
  excalidraw_ids: string[];
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  content: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type CanvasObjectKind =
  | "text"
  | "diagram"
  | "sticky"
  | "shape"
  | "image";

export interface CanvasState {
  scene: ExcalidrawScene;
  version: number;
  theme: ThemeName;
  background: string;
}

/** What comes back from GET /workspaces/{id}/scene */
export interface SceneResponse {
  scene: ExcalidrawScene;
  version: number;
  workspace_id: string;
}

// ══════════════════════════════════════════
// EXCALIDRAW TYPES (subset we care about)
// ══════════════════════════════════════════

export interface ExcalidrawScene {
  elements: ExcalidrawElement[];
  appState: ExcalidrawAppState;
  files: Record<string, unknown>;
}

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  groupIds?: string[];
  customData?: Record<string, unknown>;
  [key: string]: unknown; // Excalidraw has many more fields
}

export interface ExcalidrawAppState {
  viewBackgroundColor: string;
  theme: ThemeName;
  [key: string]: unknown;
}

export type ThemeName = "dark" | "light";

// ══════════════════════════════════════════
// SUPPORT LAYER
// ══════════════════════════════════════════

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export interface AuthState {
  auth_enabled: boolean;
  user: User | null;
  google_client_id?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface Conversation {
  id: string;
  owner_id: string | null;
  workspace_id: string | null;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  owner_id?: string;
  theme: ThemeName;
  primary_model: string;
  secondary_model: string;
  similarity_threshold: number;
  auto_layout: boolean;
  auto_connect: boolean;
  updated_at?: string;
}

// ══════════════════════════════════════════
// COMMAND / CHAT TYPES
// The unified chat interface types
// ══════════════════════════════════════════

/** What the frontend sends to POST /api/chat */
export interface ChatRequest {
  message: string;
  workspace_id?: string | null;
  history?: ChatMessage[];
}

/** Individual message in chat history */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * What the backend returns from POST /api/chat
 *
 * This is THE core response type. Every user interaction
 * comes back as one of these. The frontend inspects
 * `ui_action` and `canvas_update` to decide what to render.
 */
export interface ChatResponse {
  text: string;
  intent: Intent;
  ui_action: UIAction | null;
  data: unknown;
  canvas_update: CanvasUpdate | null;
  error: string | null;
}

export type Intent =
  | "navigate"
  | "capture"
  | "query"
  | "canvas"
  | "manage"
  | "settings"
  | "chat";

/**
 * UI directives — frontend switches on this to decide what panel/view to show.
 * The chat response `data` field contains the payload for each action.
 */
export type UIAction =
  | "open_settings"    // data: Preferences
  | "list_boards"      // data: { boards: Workspace[] }
  | "list_items"       // data: { items: Item[], total: number }
  | "open_board"       // data: { board: Workspace }
  | "open_graph"       // data: { nodes: GraphNode[], edges: GraphEdge[] }
  | "list_tags"        // data: { tags: TagCount[] }
  | "show_stats"       // data: WorkspaceStats
  | "show_search"      // data: { query: string, results: ItemSummary[] }
  | null;

/** Tells frontend to reload or patch the canvas */
export interface CanvasUpdate {
  version: number;
  action: "reload" | "patch";
  /** Only present for patch — specific element changes */
  elements?: ExcalidrawElement[];
}

// ── Typed data payloads for specific ui_actions ──

export interface BoardListData {
  boards: Workspace[];
}

export interface ItemListData {
  items: Item[];
  total: number;
}

export interface OpenBoardData {
  board: Workspace;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  content_type: ContentType;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  label: string | null;
  weight: number;
}

export interface SearchData {
  query: string;
  results: ItemSummary[];
}

export interface TagListData {
  tags: TagCount[];
}

export interface WorkspaceStats {
  total_items: number;
  total_workspaces: number;
  total_tags: number;
  statuses: Record<string, number>;
}

export interface CaptureData {
  item_id: string;
  status: string;
}

export interface ChatSourceData {
  sources: Array<{
    title: string;
    id: string;
    similarity: number;
  }>;
}

// ══════════════════════════════════════════
// SYNC TYPES
// ══════════════════════════════════════════

/** What the frontend sends to POST /api/workspaces/{id}/sync */
export interface SyncRequest {
  base_version: number;
  scene?: ExcalidrawScene | null;
}

/** What the backend returns from sync */
export interface SyncResponse {
  status: "ok" | "full_reload";
  version: number;
  scene?: ExcalidrawScene; // only if status === "full_reload"
}

// ══════════════════════════════════════════
// SSE EVENT TYPES
// ══════════════════════════════════════════

export interface SSEEvent {
  type: SSEEventType;
  workspace_id?: string;
  version?: number;
  op?: string;
  item_id?: string;
}

export type SSEEventType =
  | "connected"
  | "canvas_updated"
  | "item_placed"
  | "keepalive";

// ══════════════════════════════════════════
// UI STATE TYPES (frontend-only)
// ══════════════════════════════════════════

/** What panel is currently visible alongside the chat */
export type ActivePanel =
  | "none"
  | "settings"
  | "boards"
  | "items"
  | "graph"
  | "tags"
  | "stats"
  | "search";

/** Overall app state */
export interface AppState {
  user: User | null;
  auth_enabled: boolean;
  active_workspace: Workspace | null;
  active_panel: ActivePanel;
  canvas_version: number;
  chat_history: ChatMessage[];
  is_loading: boolean;
}