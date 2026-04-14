import { create } from "zustand"
import type { AppContext, ContextType } from "../types"
import { useStreamStore } from "./useStream"

interface ContextState {
  current: AppContext
  switchTo: (type: ContextType, pageId?: string, pageName?: string) => void
  goBack: () => void
  goHome: () => void
}

export const useAppContextStore = create<ContextState>((set, get) => ({
  current: { type: "home" },

  switchTo: (type, pageId, pageName) => {
    // Clear stream synchronously when switching contexts to avoid race conditions
    useStreamStore.getState().clearStream()

    set({
      current: {
        type,
        pageId,
        pageName,
        previousContext: get().current,
      },
    })
  },

  goBack: () => {
    useStreamStore.getState().clearStream()

    set((state) => ({
      current: state.current.previousContext || { type: "home" },
    }))
  },

  goHome: () => {
    useStreamStore.getState().clearStream()

    set({ current: { type: "home" } })
  },
}))

export function useAppContext() {
  return useAppContextStore()
}