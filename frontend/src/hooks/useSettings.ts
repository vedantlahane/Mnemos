import { create } from "zustand"
import type { WorkspaceSettings } from "../types"
import { DEFAULT_SETTINGS } from "../types"

const STORAGE_KEY = "mnemos-settings"

function loadLocal(): WorkspaceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS }
}

function saveLocal(settings: WorkspaceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

interface SettingsState {
  settings: WorkspaceSettings
  loading: boolean
  update: (partial: Partial<WorkspaceSettings>) => Promise<void>
  load: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadLocal(),
  loading: false,

  load: async () => {
    // Load from local storage only (backend settings endpoint not yet implemented)
    set({ loading: true })
    try {
      const local = loadLocal()
      set({ settings: local })
    } finally {
      set({ loading: false })
    }
  },

  update: async (partial) => {
    const next = { ...get().settings, ...partial }
    saveLocal(next)
    set({ settings: next })
  },
}))

export function useSettings() {
  return useSettingsStore()
}