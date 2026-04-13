import { create } from "zustand"
import type {
  StreamItem,
  BlockType,
  BlockData,
  ChatSource,
  StreamMetadata,
} from "../types"
import { uid } from "../utils"

interface StreamState {
  items: StreamItem[]
  isLoading: boolean

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
        item.id === id && item.type === "block"
          ? { ...item, loading }
          : item
      ),
    })),

  clearStream: () => set({ items: [makeWelcome()] }),

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
}))

export function useStream() {
  return useStreamStore()
}