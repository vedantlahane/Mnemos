// === FILE: frontend/src/store/app-store.ts ===

import { create } from "zustand";
import type {
  User,
  Workspace,
  ActivePanel,
  Preferences,
} from "@/lib/types";

export type PanelType = "none" | "boards" | "items" | "settings" | "graph" | "tags" | "stats" | "search";

interface AppState {
  // Auth
  user: User | null;
  authEnabled: boolean;

  // Navigation
  activeWorkspace: Workspace | null;
  activePanel: PanelType;

  // Settings
  preferences: Preferences | null;

  // Actions
  setUser: (user: User | null) => void;
  setAuthEnabled: (enabled: boolean) => void;
  setActiveWorkspace: (ws: Workspace | null) => void;
  setActivePanel: (panel: PanelType) => void;
  togglePanel: (panel: PanelType) => void;
  setPreferences: (prefs: Preferences) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  authEnabled: false,
  activeWorkspace: null,
  activePanel: "none",
  preferences: null,

  setUser: (user) => set({ user }),
  setAuthEnabled: (authEnabled) => set({ authEnabled }),
  
  setActiveWorkspace: (ws) => 
    set({ activeWorkspace: ws, activePanel: "none" }),
  
  setActivePanel: (panel) => set({ activePanel: panel }),
  
  togglePanel: (panel) => {
    const current = get().activePanel;
    set({ activePanel: current === panel ? "none" : panel });
  },
  
  setPreferences: (prefs) => set({ preferences: prefs }),
}));
