import { create } from "zustand"
import type {
  StreamItem, BlockType, BlockData,
  ChatSource, StreamMetadata,
} from "../types"
import { uid } from "../utils"

interface StreamState {
  items: StreamItem[]
  isLoading: boolean
  chatId: string | null
  canvasIntent: string | null

  addUserMessage: (content: string) => void
  addAssistantMessage: (
    content: string,
    sources?: ChatSource[],
    followUps?: string[]
  ) => void
  upsertAssistantMessage: (
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
  setCanvasIntent: (intent: string | null) => void
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
  canvasIntent: null,

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

  upsertAssistantMessage: (content, sources, followUps) =>
    set((s) => {
      const last = s.items[s.items.length - 1]
      if (last?.type === "assistant") {
        return {
          items: [
            ...s.items.slice(0, -1),
            {
              ...last,
              content,
              sources: sources ?? last.sources,
              followUps: followUps ?? last.followUps,
              timestamp: Date.now(),
            },
          ],
        }
      }

      return {
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
      }
    }),

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

  setCanvasIntent: (intent) => set({ canvasIntent: intent }),

  setBlockLoading: (id, loading) =>
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id && item.type === "block" ? { ...item, loading } : item
      ),
    })),

  clearStream: () => set({ items: [makeWelcome()], chatId: null, canvasIntent: null }),

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

  saveConversation: async () => {
    // Backend API v3 does not support saving conversations.
    // Chat messages are automatically recorded when sent through /chat or /canvas-chat endpoints.
    // This function is kept for backward compatibility but is now a no-op.
    return Promise.resolve()
  },
}))

export function useStream() {
  return useStreamStore()
}