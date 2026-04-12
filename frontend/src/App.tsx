import { ContextProvider } from "./core/ContextProvider"
import Stream from "./core/Stream"
import CommandBar from "./core/CommandBar"
import CanvasOverlay from "./canvas/CanvasOverlay"

export default function App() {
  return (
    <ContextProvider>
      <div className="w-full h-full relative overflow-hidden" style={{ background: "var(--color-void)" }}>
        {/* z-0: Canvas (full screen when page open) */}
        <CanvasOverlay />

        {/* z-20: Stream (centered home / floating overlay on canvas) */}
        <Stream />

        {/* z-40: Command bar (always bottom center) */}
        <CommandBar />
      </div>
    </ContextProvider>
  )
}