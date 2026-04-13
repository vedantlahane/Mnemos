/**
 * Typed canvas event bus using Zustand instead of window.dispatchEvent.
 * All canvas communication flows through this store.
 */
import { create } from "zustand"

export type CanvasCommand =
  | { type: "search"; query: string }
  | { type: "add"; addType: "sticky" | "note"; content: string; x?: number; y?: number }
  | { type: "set-background"; color: string }
  | { type: "open-library" }
  | { type: "zoom"; direction: "in" | "out" | "fit" }
  | { type: "refresh" }

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