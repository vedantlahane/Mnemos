import type {
  ChatResponse,
  UIAction,
  ActivePanel,
  Workspace,
  BoardListData,
  ItemListData,
  OpenBoardData,
  GraphData,
  SearchData,
  TagListData,
  StatsData,
  Preferences,
} from "@/api/types"

// ══════════════════════════════════════════
// RESPONSE ROUTING
// ══════════════════════════════════════════

const ACTION_TO_PANEL: Record<string, ActivePanel> = {
  open_settings: "settings",
  list_boards: "boards",
  list_items: "items",
  open_board: "none",
  open_graph: "graph",
  list_tags: "tags",
  show_stats: "stats",
  show_search: "search",
}

export function panelForAction(action: UIAction): ActivePanel {
  if (!action) return "none"
  return ACTION_TO_PANEL[action] ?? "none"
}

export function extractNavigation(response: ChatResponse): Workspace | null {
  if (response.ui_action === "open_board") {
    return asOpenBoard(response.data)?.board ?? null
  }
  return null
}

export function shouldReloadCanvas(response: ChatResponse): boolean {
  return response.canvas_update?.action === "reload"
}

export function getCanvasVersion(response: ChatResponse): number | null {
  return response.canvas_update?.version ?? null
}

// ══════════════════════════════════════════
// TYPE-SAFE DATA EXTRACTORS
// ══════════════════════════════════════════

function hasKey(data: unknown, key: string): data is Record<string, unknown> {
  return data !== null && typeof data === "object" && key in data
}

export function asBoardList(data: unknown): BoardListData | null {
  return hasKey(data, "boards") ? (data as unknown as BoardListData) : null
}

export function asItemList(data: unknown): ItemListData | null {
  return hasKey(data, "items") ? (data as unknown as ItemListData) : null
}

export function asOpenBoard(data: unknown): OpenBoardData | null {
  return hasKey(data, "board") ? (data as unknown as OpenBoardData) : null
}

export function asGraph(data: unknown): GraphData | null {
  return hasKey(data, "nodes") ? (data as unknown as GraphData) : null
}

export function asSearch(data: unknown): SearchData | null {
  return hasKey(data, "results") ? (data as unknown as SearchData) : null
}

export function asTags(data: unknown): TagListData | null {
  return hasKey(data, "tags") ? (data as unknown as TagListData) : null
}

export function asStats(data: unknown): StatsData | null {
  return hasKey(data, "total_items") ? (data as unknown as StatsData) : null
}

export function asPreferences(data: unknown): Preferences | null {
  return hasKey(data, "primary_model") ? (data as unknown as Preferences) : null
}

// ══════════════════════════════════════════
// FORMATTING
// ══════════════════════════════════════════

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  const hr = Math.floor(ms / 3_600_000)
  const day = Math.floor(ms / 86_400_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function formatSimilarity(score: number | undefined): string {
  if (score === undefined) return ""
  return `${Math.round(score * 100)}%`
}

export function truncate(text: string | null | undefined, max = 100): string {
  if (!text) return ""
  return text.length <= max ? text : text.slice(0, max - 1) + "…"
}

export function contentTypeIcon(type: string): string {
  const map: Record<string, string> = {
    note: "📝", code: "💻", url: "🔗",
    thought: "💭", question: "❓", snippet: "✂️",
  }
  return map[type] ?? "📝"
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: "var(--amber)", processing: "var(--accent)",
    ready: "var(--green)", error: "var(--red)",
  }
  return map[status] ?? "var(--glass-text-dim)"
}

// ══════════════════════════════════════════
// MISC
// ══════════════════════════════════════════

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}