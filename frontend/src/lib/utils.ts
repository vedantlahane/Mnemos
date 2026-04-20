// === FILE: frontend/src/lib/utils.ts ===

import type {
  ChatResponse,
  Workspace,
  BoardListData,
  ItemListData,
  OpenBoardData,
  SearchData,
  Preferences,
} from "@/api/types"

// ══════════════════════════════════════════
// RESPONSE ROUTING
// ══════════════════════════════════════════

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

export function asSearch(data: unknown): SearchData | null {
  return hasKey(data, "results") ? (data as unknown as SearchData) : null
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

export function truncate(text: string | null | undefined, max = 100): string {
  if (!text) return ""
  return text.length <= max ? text : text.slice(0, max - 1) + "…"
}

// ══════════════════════════════════════════
// MISC
// ══════════════════════════════════════════

export interface DebouncedFn<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): void
  cancel: () => void
}

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  ms: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout>
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced as DebouncedFn<T>
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}