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

  switchTo: (type, pageId, pageName) =>
    set({
      current: {
        type,
        pageId,
        pageName,
        previousContext: get().current,
      },
    }),

  goBack: () =>
    set((state) => ({
      current: state.current.previousContext || { type: "home" },
    })),

  goHome: () =>
    set({ current: { type: "home" } }),
}))

// Named useAppContext to avoid shadowing React.useContext
export function useAppContext() {
  return useAppContextStore()
}