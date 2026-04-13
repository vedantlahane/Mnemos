import { create } from "zustand"
import type { AppContext, ContextType } from "../types"

interface ContextState {
  current: AppContext
  switchTo: (type: ContextType, pageId?: string, pageName?: string) => void
  goBack: () => void
  goHome: () => void
}

export const useAppContextStore = create<ContextState>((set, get) => ({
  current: { type: "home" },

  switchTo: (type, pageId, pageName) => {
    // Clear stream when switching contexts
    import("./useStream").then(({ useStreamStore }) => {
      useStreamStore.getState().clearStream()
    })

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
    import("./useStream").then(({ useStreamStore }) => {
      useStreamStore.getState().clearStream()
    })

    set((state) => ({
      current: state.current.previousContext || { type: "home" },
    }))
  },

  goHome: () => {
    import("./useStream").then(({ useStreamStore }) => {
      useStreamStore.getState().clearStream()
    })

    set({ current: { type: "home" } })
  },
}))

export function useAppContext() {
  return useAppContextStore()
}