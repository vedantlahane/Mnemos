// === FILE: frontend/src/lib/constants.ts ===

export const SYNC_DEBOUNCE_MS = 2500   // was 2000 — slightly more breathing room
export const SSE_RECONNECT_MS = 3000
export const MAX_CHAT_CONTEXT = 10

// ── Canvas column model ──
export const CANVAS_CONTENT_WIDTH = 800
export const CANVAS_COLUMN_X = 0
export const CANVAS_COLUMN_CENTER = CANVAS_COLUMN_X + CANVAS_CONTENT_WIDTH / 2

export interface Command {
  id: string
  slash: string
  label: string
  description: string
  icon: import("@/components/shared/Icon").IconName
  category: "navigate" | "capture" | "canvas" | "search" | "system"
}

export const COMMANDS: Command[] = [
  // Navigate
  { id: "boards",    slash: "/boards",    label: "Boards",         description: "List all boards",              icon: "boards",   category: "navigate" },
  { id: "items",     slash: "/items",     label: "Items",          description: "List all items",               icon: "note",     category: "navigate" },
  // Capture
  { id: "remember",  slash: "/remember",  label: "Remember",       description: "Save a note or thought",       icon: "note",     category: "capture" },
  { id: "board",     slash: "/board",     label: "New Board",      description: "Create a new board",           icon: "boards",   category: "capture" },
  // Canvas
  { id: "diagram",   slash: "/diagram",   label: "Diagram",        description: "Draw a diagram on canvas",     icon: "graph",    category: "canvas" },
  { id: "sticky",    slash: "/sticky",    label: "Sticky Note",    description: "Add a sticky note",            icon: "note",     category: "canvas" },
  { id: "compose",   slash: "/compose",   label: "Compose",        description: "Write text on canvas",         icon: "sparkles", category: "canvas" },
  { id: "organize",  slash: "/organize",  label: "Organize",       description: "Clean up & reorganize canvas", icon: "boards",   category: "canvas" },
  { id: "dark",      slash: "/dark",      label: "Dark Mode",      description: "Switch to dark theme",         icon: "moon",     category: "canvas" },
  { id: "light",     slash: "/light",     label: "Light Mode",     description: "Switch to light theme",        icon: "sun",      category: "canvas" },
  // Search
  { id: "search",    slash: "/search",    label: "Search",         description: "Find by meaning",              icon: "search",   category: "search" },
  // System
  { id: "settings",  slash: "/settings",  label: "Settings",       description: "Models & preferences",         icon: "settings", category: "system" },
]

export const COMMAND_TO_MESSAGE: Record<string, string> = {
  "/boards":    "show boards",
  "/items":     "show cards",
  "/remember":  "remember ",        // trailing space = needs input
  "/board":     "create board ",
  "/diagram":   "draw diagram ",
  "/sticky":    "add sticky ",
  "/compose":   "write about ",
  "/organize":  "organize page",
  "/dark":      "dark mode",
  "/light":     "light mode",
  "/search":    "search for ",
  "/settings":  "open settings",
}

export const CATEGORY_LABELS: Record<string, string> = {
  navigate: "Navigate",
  capture: "Capture",
  canvas: "Canvas",
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