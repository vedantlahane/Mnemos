import { create } from "zustand"
import type { StreamItem, BlockType, ChatSource } from "../types"

function uid() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).substring(2, 10)
}

interface StreamState {
  items: StreamItem[]
  isLoading: boolean

  addUserMessage: (content: string) => void
  addAssistantMessage: (content: string, sources?: ChatSource[], followUps?: string[]) => void
  addBlock: (blockType: BlockType, blockData?: unknown, metadata?: StreamItem["metadata"]) => void
  addSystemMessage: (content: string) => void
  setLoading: (loading: boolean) => void
  setBlockLoading: (id: string, loading: boolean) => void
  clearStream: () => void
  getLastBlock: () => StreamItem | undefined
  getVisibleNoteIds: () => string[]
}

const WELCOME_ITEM: StreamItem = {
  id: "welcome",
  type: "block",
  blockType: "welcome",
  timestamp: Date.now(),
}

export const useStreamStore = create<StreamState>((set, get) => ({
  items: [WELCOME_ITEM],
  isLoading: false,

  addUserMessage: (content) =>
    set((s) => ({
      items: [...s.items, { id: uid(), type: "user", content, timestamp: Date.now() }],
    })),

  addAssistantMessage: (content, sources, followUps) =>
    set((s) => ({
      items: [
        ...s.items,
        { id: uid(), type: "assistant", content, sources, followUps, timestamp: Date.now() },
      ],
    })),

  addBlock: (blockType, blockData, metadata) =>
    set((s) => ({
      items: [
        ...s.items,
        { id: uid(), type: "block", blockType, blockData, metadata, timestamp: Date.now() },
      ],
    })),

  addSystemMessage: (content) =>
    set((s) => ({
      items: [...s.items, { id: uid(), type: "system", content, timestamp: Date.now() }],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  // Spec: toggle loading state on a specific block
  setBlockLoading: (id, loading) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id ? { ...item, loading } : item)),
    })),

  clearStream: () => set({ items: [{ ...WELCOME_ITEM, timestamp: Date.now() }] }),

  // Spec: returns most recent block for context awareness
  getLastBlock: () => {
    const blocks = get().items.filter((i) => i.type === "block")
    return blocks[blocks.length - 1]
  },

  // Spec: collects all noteIds from visible blocks for "explain the first one" resolution
  getVisibleNoteIds: () => {
    const ids: string[] = []
    for (const item of get().items) {
      if (item.metadata?.noteIds) {
        ids.push(...item.metadata.noteIds)
      }
    }
    return ids
  },
}))

export function useStream() {
  return useStreamStore()
}