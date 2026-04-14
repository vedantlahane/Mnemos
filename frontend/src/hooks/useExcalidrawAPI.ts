/**
 * Shared Excalidraw API ref via Zustand.
 * Allows any component (e.g. the Library panel inside Stream)
 * to call methods on the live Excalidraw instance.
 */
import { create } from "zustand"

interface ExcalidrawAPIStore {
  api: any | null
  setAPI: (api: any) => void
  clearAPI: () => void
}

export const useExcalidrawAPI = create<ExcalidrawAPIStore>((set) => ({
  api: null,
  setAPI: (api) => set({ api }),
  clearAPI: () => set({ api: null }),
}))
