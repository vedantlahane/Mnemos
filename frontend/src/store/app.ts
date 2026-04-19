import { create } from "zustand"
import type { User, Workspace, Preferences } from "@/api/types"

interface AppStore {
  user: User | null
  authEnabled: boolean
  activeWorkspace: Workspace | null
  preferences: Preferences | null
  chatOpen: boolean

  setUser: (user: User | null) => void
  setAuthEnabled: (v: boolean) => void
  setActiveWorkspace: (ws: Workspace | null) => void
  setPreferences: (prefs: Preferences) => void
  setChatOpen: (v: boolean) => void
  toggleChat: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  authEnabled: false,
  activeWorkspace: null,
  preferences: null,
  chatOpen: false,

  setUser: (user) => set({ user }),
  setAuthEnabled: (authEnabled) => set({ authEnabled }),
  setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),
  setPreferences: (preferences) => set({ preferences }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
}))