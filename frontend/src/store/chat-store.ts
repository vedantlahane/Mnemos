// === FILE: frontend/src/store/chat-store.ts ===

import { create } from "zustand";
import type { ChatMessage, ChatResponse } from "@/lib/types";

const MAX_CHAT_CONTEXT = 10;

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  lastResponse: ChatResponse | null;

  addUserMessage: (text: string) => void;
  addAssistantMessage: (text: string) => void;
  setLoading: (loading: boolean) => void;
  setLastResponse: (response: ChatResponse | null) => void;
  clearHistory: () => void;
  getContext: () => ChatMessage[];
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  lastResponse: null,

  addUserMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, { role: "user" as const, content: text }],
    })),

  addAssistantMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, { role: "assistant" as const, content: text }],
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setLastResponse: (lastResponse) => set({ lastResponse }),

  clearHistory: () => set({ messages: [], lastResponse: null }),

  /** Get recent messages for API context (trimmed to limit) */
  getContext: () => {
    const msgs = get().messages;
    return msgs.slice(-MAX_CHAT_CONTEXT);
  },
}));
