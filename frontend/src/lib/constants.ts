export const SYNC_DEBOUNCE_MS = 1500
export const SSE_RECONNECT_MS = 3000
export const MAX_CHAT_CONTEXT = 10

export interface Command {
  id: string
  slash: string
  label: string
  description: string
  icon: import("@/components/shared/Icon").IconName
  category: "navigate" | "capture" | "search" | "system"
}

export const COMMANDS: Command[] = [
  // Navigate
  { id: "boards",    slash: "/boards",    label: "Boards",         description: "List all boards",                icon: "boards",   category: "navigate" },
  { id: "graph",     slash: "/graph",     label: "Graph",          description: "View knowledge graph",           icon: "graph",    category: "navigate" },
  { id: "stats",     slash: "/stats",     label: "Stats",          description: "Dashboard & analytics",          icon: "stats",    category: "navigate" },
  { id: "tags",      slash: "/tags",      label: "Tags",           description: "Browse all tags",                icon: "tags",     category: "navigate" },
  // Capture
  { id: "remember",  slash: "/remember",  label: "Remember",       description: "Save a note or thought",         icon: "note",     category: "capture" },
  { id: "save",      slash: "/save",      label: "Save URL",       description: "Save a link",                    icon: "url",      category: "capture" },
  { id: "code",      slash: "/code",      label: "Code",           description: "Save a code snippet",            icon: "code",     category: "capture" },
  { id: "board",     slash: "/board",     label: "New Board",      description: "Create a new board",             icon: "boards",   category: "capture" },
  // Search
  { id: "search",    slash: "/search",    label: "Search",         description: "Find by meaning",                icon: "search",   category: "search" },
  { id: "find",      slash: "/find",      label: "Find by tag",    description: "Filter items by tag",            icon: "tags",     category: "search" },
  // System
  { id: "settings",  slash: "/settings",  label: "Settings",       description: "Models, theme & preferences",    icon: "settings", category: "system" },
  { id: "theme",     slash: "/theme",     label: "Toggle Theme",   description: "Switch dark / light mode",       icon: "moon",     category: "system" },
  { id: "help",      slash: "/help",      label: "Help",           description: "What can Mnemos do?",            icon: "question", category: "system" },
]

/** Map slash command to the actual message sent to backend */
export const COMMAND_TO_MESSAGE: Record<string, string> = {
  "/boards":    "show boards",
  "/graph":     "show graph",
  "/stats":     "show stats",
  "/tags":      "show tags",
  "/remember":  "remember ",
  "/save":      "save ",
  "/code":      "capture code: ",
  "/board":     "create board ",
  "/search":    "search for ",
  "/find":      "find items tagged with ",
  "/settings":  "open settings",
  "/theme":     "toggle theme",
  "/help":      "what can you do?",
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