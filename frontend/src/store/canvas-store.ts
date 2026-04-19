// === FILE: frontend/src/store/canvas-store.ts ===

import { create } from "zustand";
import type { ExcalidrawScene } from "@/lib/types";

interface CanvasState {
  version: number;
  scene: ExcalidrawScene | null;
  isSyncing: boolean;
  isDirty: boolean;
  lastSyncedAt: number | null;

  setVersion: (version: number) => void;
  setScene: (scene: ExcalidrawScene) => void;
  setSyncing: (syncing: boolean) => void;
  setDirty: (dirty: boolean) => void;
  markSynced: (version: number) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  version: 0,
  scene: null,
  isSyncing: false,
  isDirty: false,
  lastSyncedAt: null,

  setVersion: (version) => set({ version }),
  setScene: (scene) => set({ scene }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setDirty: (isDirty) => set({ isDirty }),
  markSynced: (version) =>
    set({ version, isDirty: false, isSyncing: false, lastSyncedAt: Date.now() }),
}));
