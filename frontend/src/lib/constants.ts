export const SYNC_DEBOUNCE_MS = 1500
export const SSE_RECONNECT_MS = 3000
export const MAX_CHAT_CONTEXT = 10

export const CHAT_SUGGESTIONS = [
  "show boards",
  "open settings",
  "show stats",
  "show tags",
  "search for Docker",
] as const

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