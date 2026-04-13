import { create } from "zustand"
import type {
  StreamItem, BlockType, BlockData,
  ChatSource, StreamMetadata, ChatMessage,
} from "../types"
import { uid } from "../utils"
import { api } from "../api/client"

interface StreamState {
  items: StreamItem[]
  isLoading: boolean
  chatId: string | null

  addUserMessage: (content: string) => void
  addAssistantMessage: (
    content: string,
    sources?: ChatSource[],
    followUps?: string[]
  ) => void
  addBlock: (
    blockType: BlockType,
    blockData?: BlockData,
    metadata?: StreamMetadata
  ) => void
  addSystemMessage: (content: string) => void
  setLoading: (loading: boolean) => void
  setBlockLoading: (id: string, loading: boolean) => void
  clearStream: () => void
  getLastBlock: () => StreamItem | undefined
  getVisibleNoteIds: () => string[]
  saveConversation: (contextType: string, contextId?: string) => Promise<void>
}

function makeWelcome(): StreamItem {
  return {
    id: "welcome",
    type: "block",
    blockType: "welcome",
    timestamp: Date.now(),
  }
}

export const useStreamStore = create<StreamState>((set, get) => ({
  items: [makeWelcome()],
  isLoading: false,
  chatId: null,

  addUserMessage: (content) =>
    set((s) => ({
      items: [
        ...s.items,
        { id: uid(), type: "user", content, timestamp: Date.now() },
      ],
    })),

  addAssistantMessage: (content, sources, followUps) =>
    set((s) => ({
      items: [
        ...s.items,
        {
          id: uid(),
          type: "assistant",
          content,
          sources,
          followUps,
          timestamp: Date.now(),
        },
      ],
    })),

  addBlock: (blockType, blockData, metadata) =>
    set((s) => ({
      items: [
        ...s.items,
        {
          id: uid(),
          type: "block",
          blockType,
          blockData,
          metadata,
          timestamp: Date.now(),
        },
      ],
    })),

  addSystemMessage: (content) =>
    set((s) => ({
      items: [
        ...s.items,
        { id: uid(), type: "system", content, timestamp: Date.now() },
      ],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setBlockLoading: (id, loading) =>
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id && item.type === "block" ? { ...item, loading } : item
      ),
    })),

  clearStream: () => set({ items: [makeWelcome()], chatId: null }),

  getLastBlock: () => {
    const blocks = get().items.filter((i) => i.type === "block")
    return blocks[blocks.length - 1]
  },

  getVisibleNoteIds: () => {
    const ids: string[] = []
    for (const item of get().items) {
      if (item.type === "block" && item.metadata?.noteIds) {
        ids.push(...item.metadata.noteIds)
      }
    }
    return ids
  },

  saveConversation: async (contextType, contextId) => {
    const messages: ChatMessage[] = get()
      .items.filter((i): i is Extract<StreamItem, { type: "user" | "assistant" }> =>
        i.type === "user" || i.type === "assistant"
      )
      .map((i) => ({
        role: i.type as "user" | "assistant",
        content: i.content,
        sources: i.type === "assistant" ? (i as { sources?: ChatSource[] }).sources : undefined,
        followUps: i.type === "assistant" ? (i as { followUps?: string[] }).followUps : undefined,
      }))

    if (messages.length === 0) return

    try {
      const firstUserMsg = messages.find((m) => m.role === "user")
      const title = firstUserMsg?.content.slice(0, 50) || "Chat"

      const saved = await api.saveHistory({
        context_type: contextType,
        context_id: contextId,
        messages,
        title,
      })
      set({ chatId: saved.id })
    } catch {
      console.warn("Failed to save conversation")
    }
  },
}))

export function useStream() {
  return useStreamStore()
}