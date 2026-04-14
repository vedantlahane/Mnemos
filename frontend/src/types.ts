// ─── Stream (discriminated union) ────────────────────

export type StreamItem = UserItem | AssistantItem | SystemItem | BlockItem

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

export interface StreamMetadata {
  noteIds?: string[]
  query?: string
  tag?: string
  pageId?: string
  command?: string
  topic?: string
}

export type BlockData = Record<string, unknown>

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

// ─── Block-specific data shapes ──────────────────────

export interface NoteGridData extends BlockData { limit?: number }
export interface NoteDetailData extends BlockData { note?: Note }

// ─── Context ─────────────────────────────────────────

export type ContextType = "home" | "page" | "settings" | "history"

export interface AppContext {
  type: ContextType
  pageId?: string
  pageName?: string
  previousContext?: AppContext
}

// ─── Notes ───────────────────────────────────────────

export interface Note {
  id: string
  title: string | null
  raw_text: string
  summary: string | null
  tags: string[]
  tasks: string[]
  entities: string[]
  source_url: string | null
  page_title: string | null
  capture_type: string
  processing_status: "pending" | "processing" | "done" | "failed"
  related_note_ids: string[]
  page_id: string | null
  canvas_x: number | null
  canvas_y: number | null
  canvas_width: number
  canvas_height: number | null
  cluster_id: string | null
  centrality: number
  is_bridge: boolean
  created_at: string
  updated_at: string
  similarity?: number
  // Enriched by frontend
  page_name?: string
}

// ─── Pages ───────────────────────────────────────────

export interface Page {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  is_archived: boolean
  canvas_data: Record<string, unknown>
  viewport: { x: number; y: number; zoom: number }
  note_count: number
  last_activity: string
  created_at: string
  updated_at: string
  user_id?: string | null
}

// ─── Edges ───────────────────────────────────────────

export type EdgeType =
  | "related"
  | "depends_on"
  | "extends"
  | "contradicts"
  | "summarizes"
  | "example_of"

export interface NoteEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: EdgeType
  strength: number
  label: string | null
  created_by: string
  created_at: string
}

// ─── Clusters ────────────────────────────────────────

export interface Cluster {
  id: string
  page_id: string
  label: string
  description: string | null
  color: string
  center_x: number | null
  center_y: number | null
  created_at: string
  updated_at: string
}

// ─── Canvas Elements ─────────────────────────────────

export type ElementType = "sticky" | "drawing" | "annotation" | "image"

export interface CanvasElement {
  id: string
  page_id: string
  element_type: ElementType
  content: string | null
  canvas_data: Record<string, unknown> | null
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  style: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Canvas State ────────────────────────────────────

export interface CanvasState {
  page: Page
  notes: Note[]
  edges: NoteEdge[]
  elements: CanvasElement[]
  clusters: Cluster[]
  viewport: { x: number; y: number; zoom: number }
}

// ─── Chat ────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  sources?: ChatSource[]
  followUps?: string[]
}

export interface ChatSource {
  id: string
  title: string
  similarity: number
}

// ─── Stats ───────────────────────────────────────────

export interface WorkspaceStats {
  total_notes: number
  total_pages: number
  total_tags: number
  total_tasks: number
  status_counts: Record<string, number>
  last_capture: string | null
}

export interface PageStats {
  note_count: number
  edge_count: number
  cluster_count: number
  element_count: number
  tags: TagWithCount[]
}

// ─── Tags ────────────────────────────────────────────

export interface TagWithCount {
  name: string
  count: number
}

// ─── Curator ─────────────────────────────────────────

export interface CuratorReport {
  potential_duplicates: Array<{
    note_a: string; note_b: string; similarity: number
    suggestion: string; reason: string
  }>
  orphan_notes: Array<{
    note_id: string; title: string; suggestion: string; reason: string
  }>
  stale_notes: Array<{
    note_id: string; title: string; days_old: number
  }>
  cluster_issues: Array<{
    cluster_id: string; issue: string; size?: number; suggestion: string
  }>
  missing_connections: Array<{
    note_a: string; note_b: string; similarity: number
    suggested_type: string; reason: string
  }>
  auto_applied: number
  needs_confirmation: Array<{
    action_type: string; params: Record<string, unknown>; reason: string
  }>
}

// ─── AI ──────────────────────────────────────────────

export interface AILayoutPosition {
  note_id: string
  x: number
  y: number
  cluster?: string
}

export interface AILayoutResult {
  positions: AILayoutPosition[]
  clusters: Array<{ label: string; color: string; center_x: number; center_y: number }>
  edges: Array<{ source_id: string; target_id: string; edge_type: string }>
}

export interface GapAnalysisResult {
  covered: string[]
  missing: string[]
  suggestions: string[]
}

export interface ReadingStep {
  title: string
  noteId?: string | null
  reason?: string
}

export interface PageSummary {
  summary: string
  key_topics: string[]
  connections: string[]
}

// ─── Commands ────────────────────────────────────────

export interface Command {
  name: string
  aliases: string[]
  description: string
  context: ContextType[]
  args?: string
  handler: string
}

// ─── History ─────────────────────────────────────────

export interface ChatConversation {
  id: string
  context_type: string
  context_id: string | null
  messages: ChatMessage[]
  title: string | null
  user_id?: string | null
  created_at: string
  updated_at: string
}

// ─── Settings ────────────────────────────────────────

export interface WorkspaceSettings {
  theme: "glass" | "dark"
  model: string
  groq_model: string
  similarity_threshold: number
  embedding_dimensions: number
  auto_layout: boolean
  auto_connect: boolean
}

export interface ModelCatalog {
  google: string[]
  groq: string[]
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: "glass",
  model: "gemini-2.5-flash",
  groq_model: "llama-3.3-70b-versatile",
  similarity_threshold: 0.65,
  embedding_dimensions: 768,
  auto_layout: true,
  auto_connect: true,
}