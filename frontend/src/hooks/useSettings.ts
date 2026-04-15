import { create } from "zustand"
import type { WorkspaceSettings } from "../types"
import { DEFAULT_SETTINGS } from "../types"
import { api } from "../api/client"

const STORAGE_KEY = "mnemos-settings"

function loadLocal(): WorkspaceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveLocal(settings: WorkspaceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
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
    set({ loading: true })
    try {
      // Try loading from backend first
      const remote = await api.getSettings()
      const merged = { ...DEFAULT_SETTINGS, ...remote }
      saveLocal(merged)
      set({ settings: merged })
    } catch {
      // Fallback to local
      set({ settings: loadLocal() })
    } finally {
      set({ loading: false })
    }
  },

  update: async (partial) => {
    const next = { ...get().settings, ...partial }
    saveLocal(next)
    set({ settings: next })

    // Sync to backend (non-blocking)
    try {
      await api.updateSettings({
        ...partial,
        theme: partial.theme === "glass" ? "dark" : partial.theme,
      })
    } catch {
      console.warn("Failed to sync settings to backend")
    }
  },
}))

export function useSettings() {
  return useSettingsStore()
}