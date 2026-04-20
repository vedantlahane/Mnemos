import { create } from "zustand"
import type { ChatMessage, ChatResponse, UIAction } from "@/api/types"

const MAX_CONTEXT = 10

/** Extended message that can carry inline card data */
export interface RichMessage extends ChatMessage {
  id: string
  timestamp: number
  ui_action?: UIAction
  data?: unknown
  error?: string | null
  isStreaming?: boolean
}

interface ChatStore {
  messages: RichMessage[]
  isLoading: boolean
  lastResponse: ChatResponse | null

  addUserMessage: (text: string) => void
  addAssistantMessage: (text: string, response?: ChatResponse) => void
  setLoading: (v: boolean) => void
  setLastResponse: (r: ChatResponse | null) => void
  clearHistory: () => void
  getContext: () => ChatMessage[]

  // Streaming
  startStream: (id: string, initialText: string) => void
  updateStream: (id: string, text: string) => void
  endStream: (id: string, finalText?: string) => void
}

let _msgId = 0
const nextId = () => `msg-${++_msgId}-${Date.now()}`

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  lastResponse: null,

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: "user" as const, content, timestamp: Date.now() },
      ],
    })),

  addAssistantMessage: (content, response?) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: nextId(),
          role: "assistant" as const,
          content,
          timestamp: Date.now(),
          ui_action: response?.ui_action ?? undefined,
          data: response?.data ?? undefined,
          error: response?.error ?? null,
        },
      ],
    })),

  setLoading: (isLoading) => set({ isLoading }),
  setLastResponse: (lastResponse) => set({ lastResponse }),
  clearHistory: () => set({ messages: [], lastResponse: null }),
  getContext: () =>
    get()
      .messages.slice(-MAX_CONTEXT)
      .filter((m) => !m.isStreaming)
      .map(({ role, content }) => ({ role, content })),

  // ── Streaming ──
  startStream: (id, initialText) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: "assistant" as const,
          content: initialText,
          timestamp: Date.now(),
          isStreaming: true,
        },
      ],
    })),

  updateStream: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: text } : m,
      ),
    })),

  endStream: (id, finalText?) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? { ...m, content: finalText ?? m.content, isStreaming: false }
          : m,
      ),
    })),
}))