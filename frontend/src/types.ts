// === FILE: src/types.ts ===
// Complete type definitions for Mnemos v2.0

// ═══════════════════════════════════════════════════════
// Core entities
// ═══════════════════════════════════════════════════════

export interface Page {
  id: string
  name: string
  description?: string
  icon: string
  color: string
  layout_mode: "canvas" | "notebook"
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  raw_text: string
  title?: string
  summary?: string
  tags: string[]
  tasks: string[]
  entities: string[]
  content_type: "note" | "code" | "url" | "thought" | "question" | "clip"
  source_url?: string
  source_title?: string
  capture_type: string
  processing_status: "pending" | "processing" | "done" | "failed"
  page_id?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  /** Present in search results */
  similarity?: number
  /** Enriched client-side */
  page_name?: string
}

// ═══════════════════════════════════════════════════════
// Canvas & Scene
// ═══════════════════════════════════════════════════════

export interface SceneResponse {
  page: Page
  scene_data: {
    elements: any[]
    appState: Record<string, any>
    files: Record<string, any>
  }
  notes: Note[]
  edges: NoteEdge[]
  regions: Region[]
  visual_context: VisualContext | null
  viewport: {
    scroll_x: number
    scroll_y: number
    zoom: number
  }
}

export interface VisualContext {
  page_id: string
  background_color: string
  theme: "dark" | "light"
  dominant_colors: string[]
  layout_pattern: "freeform" | "grid" | "timeline" | "mindmap" | "flow" | "columns"
  reading_direction: "left-to-right" | "top-to-bottom" | "radial" | "mixed"
  density: "empty" | "sparse" | "moderate" | "dense"
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  element_count: number
  last_analyzed?: string
}

export interface Region {
  id: string
  page_id: string
  label?: string
  description?: string
  color?: string
  region_type: "cluster" | "section" | "timeline-segment" | "comparison-column" | "freeform"
  layout_hint: string
  metadata: Record<string, unknown>
  element_count?: number
  created_at: string
  updated_at: string
}

export interface ElementRegistryEntry {
  id: string
  page_id: string
  element_id: string
  element_type: string
  content_source: string
  note_id?: string
  region_id?: string
  cached_x?: number
  cached_y?: number
  cached_width?: number
  cached_height?: number
  style_snapshot: Record<string, unknown>
}

export interface CanvasOp {
  op: string
  element_id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  color?: string
  theme?: string
  zoom?: number
  note?: Note
  note_id?: string
  elements?: Record<string, unknown>[]
  connections?: Record<string, unknown>[]
  operations?: CanvasOp[]
  topology?: Record<string, unknown>
  message?: string
  metadata?: Record<string, unknown>
  timestamp: number
}

// ═══════════════════════════════════════════════════════
// Graph
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Document / Notebook
// ═══════════════════════════════════════════════════════

export interface PageDocument {
  page_id: string
  user_id?: string | null
  default_font: string
  content_width: number
  line_height: number
  left_padding: number
  right_padding: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PageBlock {
  id: string
  page_id: string
  parent_block_id?: string | null
  order_key: number
  depth: number
  block_type: string
  text_content?: string | null
  attrs: Record<string, unknown>
  provenance: Record<string, unknown>
  metadata: Record<string, unknown>
  note_id?: string | null
  is_deleted: boolean
  version: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface PageDocumentBundle {
  page: Page
  document: PageDocument | null
  blocks: PageBlock[]
}

// ═══════════════════════════════════════════════════════
// Chat
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Stats & Tags
// ═══════════════════════════════════════════════════════

export interface TagWithCount {
  name: string
  count: number
}

// ═══════════════════════════════════════════════════════
// Curator
// ═══════════════════════════════════════════════════════

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
  region_issues: Array<{
    region_id: string; issue: string; size?: number; suggestion: string
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

// ═══════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Stream items (for chat UI)
// ═══════════════════════════════════════════════════════

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
  blockData?: Record<string, unknown>
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

export type BlockType =
  | "welcome" | "help" | "note-grid" | "note-detail"
  | "search-results" | "stats" | "tag-cloud" | "task-list"
  | "page-list" | "page-stats" | "reading-path" | "gap-analysis"
  | "curator-report" | "settings" | "history" | "export"

export type ContextType = "home" | "page" | "settings" | "history"

export interface AppContext {
  type: ContextType
  pageId?: string
  pageName?: string
  previousContext?: AppContext
}

// ═══════════════════════════════════════════════════════
// Legacy aliases (remove after full migration)
// ═══════════════════════════════════════════════════════

/** @deprecated Use Region instead */
export type Cluster = Region

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════

export function nanoid(size = 21): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""
  const values = crypto.getRandomValues(new Uint8Array(size))
  for (let i = 0; i < size; i++) {
    id += chars[values[i] % chars.length]
  }
  return id
}

export function uid(): string {
  return crypto.randomUUID?.() ?? nanoid(12)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}