// Canonical Mnemos v2.0 frontend types.
// Primary contracts come from instruction.md Appendix C.

// ─────────────────────────────────────────────────────────────
// JSON utility shapes
// ─────────────────────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export interface JsonObject {
  [key: string]: JsonValue
}
export interface JsonArray extends Array<JsonValue> {}

// Excalidraw internals are intentionally loose at type boundary.
export type ExcalidrawElement = Record<string, unknown>

// ─────────────────────────────────────────────────────────────
// CORE ENTITIES
// ─────────────────────────────────────────────────────────────

export interface Page {
  id: string
  user_id: string | null
  name: string
  description: string | null
  icon: string
  color: string
  is_archived: boolean
  created_at: string
  updated_at: string

  // UI-only compatibility field from overview payload.
  note_count?: number
}

export interface Note {
  id: string
  user_id: string | null
  page_id: string | null
  raw_text: string
  title: string | null
  summary: string | null
  tags: string[]
  tasks: string[]
  entities: string[]
  content_type: ContentType
  source_url: string | null
  source_title: string | null
  capture_type: string
  processing_status: ProcessingStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string

  // Compatibility/read-only derived field from search
  similarity?: number
}

/**
 * Frontend-enriched note with computed fields.
 * Note: Position (x/y) is NOT stored here. Scene is the authority.
 */
export interface EnrichedNote extends Note {
  page_name?: string
  related_note_ids?: string[]
  is_bridge?: boolean
  centrality?: number
  cluster_id?: string | null
}

export interface Edge {
  id: string
  source_id: string
  target_id: string
  edge_type: EdgeType
  label: string | null
  strength: number
  created_by: "processor" | "curator" | "user"
  created_at: string
}

export interface Region {
  id: string
  page_id: string
  label: string | null
  description: string | null
  color: string | null
  region_type: RegionType
  layout_hint: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string

  // Optional projection from some list responses.
  element_count?: number
}

export type Cluster = Region
export type NoteEdge = Edge
export type TagWithCount = TagCount

// ─────────────────────────────────────────────────────────────
// SCENE & VISUAL
// ─────────────────────────────────────────────────────────────

export interface Scene {
  elements: ExcalidrawElement[]
  appState: {
    viewBackgroundColor: string
    theme: "dark" | "light"
    [key: string]: unknown
  }
  files: Record<string, unknown>
}

export interface VisualContext {
  page_id: string
  background_color: string
  theme: "dark" | "light"
  dominant_colors: string[]
  layout_pattern: LayoutPattern
  reading_direction: ReadingDirection
  density: Density
  bounds: Bounds
  element_count: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export interface ElementRegistryEntry {
  id: string
  page_id: string
  element_id: string
  element_type: ElementType
  content_source: ContentSource
  note_id: string | null
  region_id: string | null
  cached_x: number | null
  cached_y: number | null
  cached_width: number | null
  cached_height: number | null
  style_snapshot: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * Frontend-assembled composite — NOT a backend response shape.
 * Built from multiple API calls in useCanvasPage hook.
 */
export interface SceneResponse {
  page: Page
  scene_data: Scene
  notes: Note[]
  edges: Edge[]
  regions: Region[]
  visual_context: VisualContext | null
  viewport: {
    scroll_x: number
    scroll_y: number
    zoom: number
  }

  // Legacy keys kept for compatibility.
  canvas_data?: Scene
  clusters?: Region[]
  elements?: Array<{
    id: string
    element_type: string
    content?: string | null
    position_x?: number | null
    position_y?: number | null
  }>
}

// Note: Document/Notebook mode types (PageDocument, PageBlock, etc.) were removed.
// Backend API v3 only supports canvas mode with Excalidraw scene.

// ─────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────

export interface ChatHistory {
  id: string
  user_id: string | null
  context_type: string
  context_id: string | null
  messages: ChatMessage[]
  title: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string

  // UI extras
  sources?: ChatSource[]
  followUps?: string[]
}

export interface ChatSource {
  id: string
  title: string
  similarity: number
}

export type ChatConversation = ChatHistory

// ─────────────────────────────────────────────────────────────
// SETTINGS & AUTH
// ─────────────────────────────────────────────────────────────

export interface UserSettings {
  theme: "dark" | "light"
  model: string
  groq_model: string
  similarity_threshold: number
  embedding_dimensions: number
  auto_layout: boolean
  auto_connect: boolean
}

/**
 * UI-extended settings. "glass" is frontend-only and maps to "dark"
 * when syncing with the backend via PUT /api/settings.
 */
export interface WorkspaceSettings extends Omit<UserSettings, "theme"> {
  theme: "dark" | "light" | "glass"
}

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

export interface AuthState {
  auth_enabled: boolean
  user: User | null
  google_client_id: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: User
}

// ─────────────────────────────────────────────────────────────
// CANVAS CHAT SSE
// ─────────────────────────────────────────────────────────────

export interface CanvasOp {
  op: OpType
  element_id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  color?: string
  theme?: string
  zoom?: number
  style?: string
  note?: Note
  note_id?: string
  elements?: Record<string, unknown>[]
  connections?: Record<string, unknown>[]
  operations?: CanvasOp[]
  topology?: DiagramTopology
  message?: string
  metadata?: Record<string, unknown>
  timestamp: number
}

export interface DiagramTopology {
  layout_type: "flow" | "mindmap" | "list" | "comparison" | "timeline"
  elements: DiagramElement[]
  connections: DiagramConnection[]

  // Optional extension used by current canvas renderer.
  title?: string
}

export interface DiagramElement {
  id: string
  label: string
  type: "box" | "text"
  style: "default" | "accent" | "muted" | "warning" | "success"
  width: number
  height: number

  // Optional fields used by diagram renderer.
  cluster?: string
  summary?: string
}

export interface DiagramConnection {
  from: string
  to: string
  label?: string
  style: "solid" | "dashed" | "dotted"

  /** @deprecated Use `from` — kept only for migration compatibility */
  source?: string
  /** @deprecated Use `to` — kept only for migration compatibility */
  target?: string
  /** @deprecated Use `style` — kept only for migration compatibility */
  type?: EdgeType | string
}

export interface CanvasStreamRequest {
  message: string
  viewport?: Viewport
  history?: ChatMessage[]
  selected_element_ids?: string[]
  context_type?: string
}

// ─────────────────────────────────────────────────────────────
// WORKSPACE & STATS
// ─────────────────────────────────────────────────────────────

export interface WorkspaceOverview {
  pages: PageSummary[]
  total_notes: number
  total_pages: number
  top_tags: TagCount[]

  /** @ui-only Assembled client-side, not from overview endpoint */
  stats?: WorkspaceStats
  /** @ui-only Assembled client-side, not from overview endpoint */
  recent_notes?: Note[]
}

export interface PageSummary {
  id: string
  name: string
  icon: string
  color: string
  note_count: number
  is_archived: boolean
  updated_at: string
}

export interface TagCount {
  name: string
  count: number
}

export interface CacheStats {
  enabled: boolean
  hits?: number
  misses?: number
  error?: string
}

export interface WorkspaceStats {
  notes: number
  pages: number
  edges: number
  stuck_notes: number
  cache: CacheStats

  /** @deprecated These come from an unrouted db method (get_global_stats) */
  total_notes?: number
  /** @deprecated These come from an unrouted db method (get_global_stats) */
  total_pages?: number
  /** @deprecated These come from an unrouted db method (get_global_stats) */
  total_tags?: number
  /** @deprecated These come from an unrouted db method (get_global_stats) */
  total_tasks?: number
  /** @deprecated These come from an unrouted db method (get_global_stats) */
  status_counts?: Record<string, number>
  /** @deprecated These come from an unrouted db method (get_global_stats) */
  last_capture?: string | null
}

export interface PageStats {
  note_count: number
  edge_count: number
  region_count: number
  element_count: number
  tags: TagCount[]

  // Legacy alias retained for existing page cards.
  cluster_count?: number
}

// ─────────────────────────────────────────────────────────────
// CURATOR
// ─────────────────────────────────────────────────────────────

export interface CuratorScanResult {
  potential_duplicates: DuplicateInfo[]
  orphan_notes: OrphanInfo[]
  stale_notes: StaleInfo[]
  region_issues: RegionIssue[]
  missing_connections: MissingConnectionInfo[]
  auto_applied: number
  needs_confirmation: ConfirmationAction[]
}

export type CuratorReport = CuratorScanResult

export interface DuplicateInfo {
  note_a: string
  note_b: string
  similarity: number
  suggestion: "merge"
  reason: string
}

export interface OrphanInfo {
  note_id: string
  title: string
  suggestion: "connect_orphan"
  reason: string
}

export interface StaleInfo {
  note_id: string
  title: string
  days_old: number
}

export interface RegionIssue {
  region_id: string
  issue: "too_large" | "empty"
  size: number
  suggestion: string
}

export interface MissingConnectionInfo {
  note_a: string
  note_b: string
  similarity: number
  suggested_type: EdgeType
  reason: string
}

export interface ConfirmationAction {
  action_type: "merge_notes" | "delete_note"
  params: Record<string, string>
  reason: string
}

export interface CuratorApplyRequest {
  action_type: "merge_notes" | "delete_note" | "connect_orphan"
  params: Record<string, string>
}

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────

export interface SearchResult extends Note {
  similarity: number
}

export interface SearchResponse {
  results: SearchResult[]
  count: number
  query: string
}

export interface TagSearchResponse {
  results: Note[]
  count: number
  tags: string[]
}

// ─────────────────────────────────────────────────────────────
// GRAPH
// ─────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  tags: string[]
  page_id: string | null
  content_type: ContentType
}

export interface FullGraph {
  nodes: GraphNode[]
  edges: Edge[]
}

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export type ContentType = "note" | "code" | "url" | "thought" | "question" | "clip"

export type ProcessingStatus = "pending" | "processing" | "done" | "failed"

export type EdgeType =
  | "related"
  | "depends_on"
  | "extends"
  | "contradicts"
  | "summarizes"
  | "example_of"

export type LayoutPattern = "freeform" | "grid" | "timeline" | "mindmap" | "flow" | "columns"

export type ReadingDirection = "left-to-right" | "top-to-bottom" | "radial" | "mixed"

export type Density = "empty" | "sparse" | "moderate" | "dense"

export type RegionType = "cluster" | "section" | "timeline-segment" | "comparison-column" | "freeform"

export type ElementType =
  | "note-card"
  | "composed-text"
  | "diagram-node"
  | "diagram-arrow"
  | "sticky"
  | "freehand"
  | "image"
  | "group"

export type ContentSource = "note" | "ai-compose" | "ai-diagram" | "user-draw" | "clip"

export type OpType =
  | "create_note"
  | "create_text"
  | "create_diagram"
  | "create_sticky"
  | "update_element"
  | "move_element"
  | "delete_element"
  | "group_elements"
  | "create_edge_line"
  | "set_background"
  | "set_theme"
  | "pan_to"
  | "zoom_to"
  | "stream_start"
  | "stream_chunk"
  | "stream_end"
  | "arrange_cluster"
  | "batch"
  | "info"
  | "error"
  | "done"

export type Intent = "compose" | "command" | "arrange" | "capture" | "query" | "diagram" | "search" | "navigate"

// ─────────────────────────────────────────────────────────────
// REQUEST BODIES
// ─────────────────────────────────────────────────────────────

export interface PageCreateRequest {
  name: string
  description?: string
  icon?: string
  color?: string
}

export interface PageUpdateRequest {
  name?: string
  description?: string
  icon?: string
  color?: string
  is_archived?: boolean
}

export interface NoteUpdateRequest {
  title?: string
  summary?: string
  tags?: string[]
  tasks?: string[]
  entities?: string[]
  page_id?: string
  metadata?: Record<string, unknown>
}

export interface NoteMoveRequest {
  page_id: string
}

export interface EdgeCreateRequest {
  source_id: string
  target_id: string
  edge_type?: EdgeType
  label?: string
  strength?: number
  created_by?: string
}

export interface ChatRequest {
  question: string
  history?: ChatMessage[]
  context_type?: string
  page_id?: string
}

export interface ChatResponse {
  response: string
  sources: ChatSource[]
}

export interface CaptureRequest {
  text: string
  source_url?: string
  source_title?: string
  capture_type?: string
  page_hint?: string
  custom_command?: string
  viewport?: Viewport
}

export interface SceneSaveRequest {
  elements: ExcalidrawElement[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

export interface ViewportSaveRequest {
  scroll_x: number
  scroll_y: number
  zoom: number
}

export interface SettingsUpdateRequest {
  theme?: "dark" | "light"
  model?: string
  groq_model?: string
  similarity_threshold?: number
  embedding_dimensions?: number
  auto_layout?: boolean
  auto_connect?: boolean
}

// ─────────────────────────────────────────────────────────────
// UI STREAM TYPES
// ─────────────────────────────────────────────────────────────

export type BlockType =
  | "welcome"
  | "help"
  | "note-grid"
  | "note-detail"
  | "search-results"
  | "stats"
  | "tag-cloud"
  | "task-list"
  | "page-list"
  | "page-stats"
  | "reading-path"
  | "gap-analysis"
  | "curator-report"
  | "settings"
  | "history"
  | "export"
  | "batch"

export interface NoteGridData {
  limit?: number
}

export interface NoteDetailData {
  note?: Note
}

export interface ReadingStep {
  title: string
  reason?: string
}

export type BlockData = NoteGridData | NoteDetailData | Record<string, unknown>

export interface StreamMetadata {
  noteIds?: string[]
  query?: string
  tag?: string
  pageId?: string
  command?: string
  topic?: string
}

interface BaseStreamItem {
  id: string
  timestamp: number
}

export interface UserItem extends BaseStreamItem {
  type: "user"
  content: string
}

export interface AssistantItem extends BaseStreamItem {
  type: "assistant"
  content: string
  sources?: ChatSource[]
  followUps?: string[]
}

export interface SystemItem extends BaseStreamItem {
  type: "system"
  content: string
}

export interface BlockItem extends BaseStreamItem {
  type: "block"
  blockType: BlockType
  blockData?: BlockData
  metadata?: StreamMetadata
  loading?: boolean
}

export type StreamItem = UserItem | AssistantItem | SystemItem | BlockItem

// ─────────────────────────────────────────────────────────────
// APP CONTEXT & COMMANDS
// ─────────────────────────────────────────────────────────────

export type ContextType = "home" | "page" | "settings" | "history"

export interface AppContext {
  type: ContextType
  pageId?: string
  pageName?: string
  previousContext?: AppContext
}

export interface Command {
  name: string
  aliases: string[]
  description: string
  context: ContextType[]
  args?: string
  handler: string
}

export interface IntentDecision {
  mode: "command" | "chat"
  command?: string
  args?: string
  confidence: number
}

export interface ModelCatalog {
  google: string[]
  groq: string[]
}
// Default settings for the frontend.
// Default settings for the frontend.
// Note: "glass" is sent dynamically to the backend as "dark" or mapped accordingly.
export const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: "glass",
  model: "gemini-2.5-flash",
  groq_model: "llama-3.3-70b-versatile",
  similarity_threshold: 0.65,
  embedding_dimensions: 768,
  auto_layout: true,
  auto_connect: true,
}
