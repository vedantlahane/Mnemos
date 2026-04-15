import { useState } from "react"
import { useAppContext } from "../hooks/useAppContext"
import ExcalidrawCanvas from "./ExcalidrawCanvas"
import { VisualContextBadge } from "../components/canvas/VisualContextBadge"
import { RegionPanel } from "../components/canvas/RegionPanel"
import { Monitor, BookOpen } from "lucide-react"

export default function CanvasOverlay() {
  const { current } = useAppContext()
  const [viewMode, setViewMode] = useState<"canvas" | "notebook">("canvas")

  if (current.type !== "page" || !current.pageId) return null

  const isNotebook = viewMode === "notebook"

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-void)]">
      {/* Top Header UI with Seamless Switcher */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 pointer-events-auto bg-[rgba(10,10,20,0.8)] backdrop-blur-md px-2 py-1.5 rounded-xl border border-white/5 shadow-lg">
         <button
          onClick={() => setViewMode("canvas")}
          className={
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all " +
            (!isNotebook
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--glass-text-dim)] hover:bg-white/5 hover:text-white")
          }
         >
           <Monitor size={14} />
           Canvas
         </button>

         <button
          onClick={() => setViewMode("notebook")}
          className={
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all " +
            (isNotebook
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--glass-text-dim)] hover:bg-white/5 hover:text-white")
          }
         >
           <BookOpen size={14} />
           Notebook
         </button>
      </div>

      {viewMode === "canvas" && (
        <>
          <RegionPanel pageId={current.pageId} />
          <VisualContextBadge />
        </>
      )}

      <div className="flex-1 relative">
        <ExcalidrawCanvas pageId={current.pageId} viewMode={viewMode} />
      </div>
    </div>
  )
}