// === FILE: frontend/src/lib/constants.ts ===

export const SYNC_DEBOUNCE_MS = 2000
export const SSE_RECONNECT_MS = 3000
export const MAX_CHAT_CONTEXT = 10

// ── Canvas column model ──
// Think of the canvas as a vertical document with fixed-width content area.
// Everything lives within this column. No horizontal scroll, no zoom.
export const CANVAS_CONTENT_WIDTH = 800
export const CANVAS_COLUMN_X = 0        // Left edge in canvas coordinates
export const CANVAS_COLUMN_CENTER = CANVAS_COLUMN_X + CANVAS_CONTENT_WIDTH / 2

export interface Command {
  id: string
  slash: string
  label: string
  description: string
  icon: import("@/components/shared/Icon").IconName
  category: "navigate" | "capture" | "search" | "system"
}

export const COMMANDS: Command[] = [
  { id: "boards",    slash: "/boards",    label: "Boards",         description: "List all boards",         icon: "boards",   category: "navigate" },
  { id: "items",     slash: "/items",     label: "Items",          description: "List all items",          icon: "note",     category: "navigate" },
  { id: "remember",  slash: "/remember",  label: "Remember",       description: "Save a note or thought",  icon: "note",     category: "capture" },
  { id: "board",     slash: "/board",     label: "New Board",      description: "Create a new board",      icon: "boards",   category: "capture" },
  { id: "search",    slash: "/search",    label: "Search",         description: "Find by meaning",         icon: "search",   category: "search" },
  { id: "settings",  slash: "/settings",  label: "Settings",       description: "Models & preferences",    icon: "settings", category: "system" },
]

export const COMMAND_TO_MESSAGE: Record<string, string> = {
  "/boards":    "show boards",
  "/items":     "show cards",
  "/remember":  "remember ",
  "/board":     "create board ",
  "/search":    "search for ",
  "/settings":  "open settings",
}

export const CATEGORY_LABELS: Record<string, string> = {
  navigate: "Navigate",
  capture: "Capture",
  search: "Search",
  system: "System",
}

export const PRIMARY_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "fast" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "premium" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", tier: "fast" },
] as const

export const SECONDARY_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tier: "fast" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", tier: "instant" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", tier: "fast" },
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 70B", tier: "reasoning" },
] as const