/**
 * Typed canvas event bus using Zustand instead of window.dispatchEvent.
 * All canvas communication flows through this store.
 */
import { create } from "zustand"

export interface CanvasStyleSettings {
  theme?: "light" | "dark"
  viewBackgroundColor?: string
  currentItemStrokeColor?: string
  currentItemBackgroundColor?: string
  currentItemFillStyle?: "solid" | "hachure" | "cross-hatch"
  currentItemStrokeWidth?: number
  currentItemStrokeStyle?: "solid" | "dashed" | "dotted"
  currentItemRoughness?: number
  currentItemOpacity?: number
  currentItemFontFamily?: number
  currentItemFontSize?: number
  currentItemTextAlign?: "left" | "center" | "right"
  currentItemStartArrowhead?: string | null
  currentItemEndArrowhead?: string | null
  currentItemRoundness?: string | null | { type: number; value?: number }
}

export type CanvasCommand =
  | { type: "search"; query: string }
  | { type: "add"; addType: "sticky" | "note" | "text"; content: string; x?: number; y?: number }
  | { type: "ai-compose"; request: string; pageId?: string; includeDiagram?: boolean }
  | { type: "set-background"; color: string }
  | { type: "set-theme"; theme: "light" | "dark" }
  | { type: "set-style"; settings: CanvasStyleSettings }
  | { type: "open-library" }
  | { type: "close-library" }
  | { type: "zoom"; direction: "in" | "out" | "fit" }
  | { type: "refresh" }
  | { type: "generate-diagram"; request: string; pageId?: string }

interface CanvasEventState {
  /** Incremented on every dispatch so subscribers always re-render */
  seq: number
  lastCommand: CanvasCommand | null

  dispatch: (cmd: CanvasCommand) => void
  consume: () => CanvasCommand | null
}

export const useCanvasEvents = create<CanvasEventState>((set, get) => ({
  seq: 0,
  lastCommand: null,

  dispatch: (cmd) =>
    set((s) => ({ lastCommand: cmd, seq: s.seq + 1 })),

  consume: () => {
    const cmd = get().lastCommand
    set({ lastCommand: null })
    return cmd
  },
}))