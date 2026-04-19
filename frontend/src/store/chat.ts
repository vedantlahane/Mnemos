import { create } from "zustand"
import type { ChatMessage, ChatResponse } from "@/api/types"

const MAX_CONTEXT = 10

interface ChatStore {
  messages: ChatMessage[]
  isLoading: boolean
  lastResponse: ChatResponse | null

  addUserMessage: (text: string) => void
  addAssistantMessage: (text: string) => void
  setLoading: (v: boolean) => void
  setLastResponse: (r: ChatResponse | null) => void
  clearHistory: () => void
  getContext: () => ChatMessage[]
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  lastResponse: null,

  addUserMessage: (content) =>
    set((s) => ({ messages: [...s.messages, { role: "user" as const, content }] })),

  addAssistantMessage: (content) =>
    set((s) => ({ messages: [...s.messages, { role: "assistant" as const, content }] })),

  setLoading: (isLoading) => set({ isLoading }),
  setLastResponse: (lastResponse) => set({ lastResponse }),
  clearHistory: () => set({ messages: [], lastResponse: null }),
  getContext: () => get().messages.slice(-MAX_CONTEXT),
}))