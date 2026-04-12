import { ContextProvider } from "./core/ContextProvider"
import Stream from "./core/Stream"
import CommandBar from "./core/CommandBar"
import CanvasOverlay from "./canvas/CanvasOverlay"

export default function App() {
  return (
    <ContextProvider>
      <div className="w-full h-screen bg-[var(--color-void)] text-[var(--color-primary)] flex flex-col overflow-hidden relative z-10">
        {/* Canvas renders behind stream when in page context */}
        <CanvasOverlay />

        {/* Main conversation stream — scrollable */}
        <Stream />

        {/* Always-visible command bar at bottom */}
        <CommandBar />
      </div>
    </ContextProvider>
  )
}