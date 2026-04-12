// src/types.ts

// ─── Stream ──────────────────────────────────────────

export interface StreamItem {
  id: string
  type: "user" | "assistant" | "block" | "system"

  // For text messages
  content?: string

  // For rich blocks
  blockType?: BlockType
  blockData?: any

  // For AI responses
  sources?: ChatSource[]
  followUps?: string[]

  // Metadata for context awareness
  metadata?: {
    noteIds?: string[]        // which notes are visible in this block
    query?: string            // what query produced this
    tag?: string              // what tag filter is active
    pageId?: string           // which page context
    command?: string          // what command triggered this
    topic?: string            // topic for reading path
  }

  timestamp: number
  loading?: boolean
}

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
  | "reading-path"
  | "gap-analysis"
  | "curator-report"
  | "settings"
  | "history"

// ─── Context ─────────────────────────────────────────

export type ContextType = "home" | "page" | "settings" | "history"

export interface AppContext {
  type: ContextType
  pageId?: string         // when type === "page"
  pageName?: string       // display name
  previousContext?: AppContext  // for /back navigation
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
  processing_status: string
  related_note_ids: string[]
  // New fields:
  page_id: string | null
  canvas_x: number | null
  canvas_y: number | null
  canvas_width: number
  canvas_height: number | null
  cluster_id: string | null
  centrality: number
  is_bridge: boolean
  //
  created_at: string
  updated_at: string
  similarity?: number      // from search results
}

// ─── Pages ───────────────────────────────────────────

export interface Page {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  is_archived: boolean
  canvas_data: Record<string, any>
  viewport: { x: number; y: number; zoom: number }
  note_count: number
  last_activity: string
  created_at: string
  updated_at: string
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
  canvas_data: Record<string, any> | null
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  style: Record<string, any>
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

// ─── Tags ────────────────────────────────────────────

export interface TagWithCount {
  name: string
  count: number
}

// ─── Curator ─────────────────────────────────────────

export interface CuratorReport {
  potential_duplicates: Array<{
    note_a: string; note_b: string; similarity: number;
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
    note_a: string; note_b: string; similarity: number;
    suggested_type: string; reason: string
  }>
  auto_applied: number
  needs_confirmation: Array<{
    action_type: string; params: Record<string, any>; reason: string
  }>
}

// ─── Commands ────────────────────────────────────────

export interface Command {
  name: string           // e.g., "/notes"
  aliases: string[]      // e.g., ["/note", "/n"]
  description: string
  context: ContextType[] // which contexts this works in
  args?: string          // description of expected args
  handler: string        // function name to call
}

// ─── History ─────────────────────────────────────────

export interface ChatConversation {
  id: string
  context_type: string
  context_id: string | null
  messages: ChatMessage[]
  title: string | null
  created_at: string
  updated_at: string
}
