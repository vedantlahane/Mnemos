import { create } from "zustand"
import type { User, Workspace, ActivePanel, Preferences } from "@/api/types"

interface AppStore {
  // Auth
  user: User | null
  authEnabled: boolean

  // Navigation
  activeWorkspace: Workspace | null
  activePanel: ActivePanel

  // Settings
  preferences: Preferences | null

  // Actions
  setUser: (user: User | null) => void
  setAuthEnabled: (v: boolean) => void
  setActiveWorkspace: (ws: Workspace | null) => void
  setActivePanel: (panel: ActivePanel) => void
  setPreferences: (prefs: Preferences) => void
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  authEnabled: false,
  activeWorkspace: null,
  activePanel: "none" as ActivePanel,
  preferences: null,

  setUser: (user) => set({ user }),
  setAuthEnabled: (authEnabled) => set({ authEnabled }),
  setActiveWorkspace: (ws) => set({ activeWorkspace: ws, activePanel: "none" as ActivePanel }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setPreferences: (preferences) => set({ preferences }),
}))
