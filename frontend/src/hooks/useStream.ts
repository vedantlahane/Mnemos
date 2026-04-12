import { create } from "zustand"
import type { StreamItem, BlockType, ChatSource } from "../types"

interface StreamState {
  items: StreamItem[]
  isLoading: boolean
  addUserMessage: (content: string) => void
  addAssistantMessage: (content: string, sources?: ChatSource[], followUps?: string[]) => void
  addBlock: (blockType: BlockType, blockData?: any, metadata?: any) => void
  addSystemMessage: (content: string) => void
  setLoading: (loading: boolean) => void
  clearStream: () => void
}

export const useStreamStore = create<StreamState>((set) => ({
  items: [
    {
      id: "welcome",
      type: "block",
      blockType: "welcome",
      timestamp: Date.now(),
    },
  ],
  isLoading: false,
  addUserMessage: (content) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: Math.random().toString(36).substring(7),
          type: "user",
          content,
          timestamp: Date.now(),
        },
      ],
    })),
  addAssistantMessage: (content, sources, followUps) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: Math.random().toString(36).substring(7),
          type: "assistant",
          content,
          sources,
          followUps,
          timestamp: Date.now(),
        },
      ],
    })),
  addBlock: (blockType, blockData, metadata) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: Math.random().toString(36).substring(7),
          type: "block",
          blockType,
          blockData,
          metadata,
          timestamp: Date.now(),
        },
      ],
    })),
  addSystemMessage: (content) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: Math.random().toString(36).substring(7),
          type: "system",
          content,
          timestamp: Date.now(),
        },
      ],
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  clearStream: () =>
    set({
      items: [
        {
          id: "welcome",
          type: "block",
          blockType: "welcome",
          timestamp: Date.now(),
        },
      ],
    }),
}))

export function useStream() {
  return useStreamStore()
}
