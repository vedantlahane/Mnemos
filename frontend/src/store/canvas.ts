import { create } from "zustand"
import type { ExcalidrawScene } from "@/api/types"

interface CanvasStore {
  version: number
  scene: ExcalidrawScene | null
  isSyncing: boolean
  isDirty: boolean

  setVersion: (v: number) => void
  setScene: (s: ExcalidrawScene) => void
  setSyncing: (v: boolean) => void
  setDirty: (v: boolean) => void
  markSynced: (version: number) => void
  reset: () => void
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  version: 0,
  scene: null,
  isSyncing: false,
  isDirty: false,

  setVersion: (version) => set({ version }),
  setScene: (scene) => set({ scene }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setDirty: (isDirty) => set({ isDirty }),
  markSynced: (version) => set({ version, isDirty: false, isSyncing: false }),
  reset: () => set({ version: 0, scene: null, isSyncing: false, isDirty: false }),
}))
