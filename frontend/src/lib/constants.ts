// === FILE: frontend/src/lib/constants.ts ===

export const CHAT_SUGGESTIONS = [
  "Show my recent notes",
  "Create a new board",
  "Find items with tag #important",
  "Visualize connections",
  "Summarize my workspace",
];

export const API_BASE = process.env.VITE_API_BASE || "http://localhost:8000/api";

export const SYNC_DEBOUNCE_MS = 1500;
export const SSE_RETRY_MS = 3000;
export const MAX_CHAT_CONTEXT = 10;

export const KEYBOARD_SHORTCUTS = {
  FOCUS_CHAT: ["MetaKey", "k", "CtrlKey"],
  CLOSE_PANEL: ["Escape"],
} as const;
