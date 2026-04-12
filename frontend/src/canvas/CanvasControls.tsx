import { ZoomIn, ZoomOut, Maximize, StickyNote, RotateCcw, Search, Hand, MousePointer2 } from "lucide-react"
import type { ReactFlowInstance } from "@xyflow/react"
import { api } from "../api/client"
import { useStream } from "../hooks/useStream"
import { useState } from "react"

interface Props {
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>
  pageId: string
}

export default function CanvasControls({ reactFlowInstance, pageId }: Props) {
  const { addSystemMessage } = useStream()
  const [tool, setTool] = useState<"select" | "pan">("select")

  const btns = [
    { icon: MousePointer2, tip: "Select", action: () => setTool("select"), active: tool === "select" },
    { icon: Hand, tip: "Pan", action: () => setTool("pan"), active: tool === "pan" },
    { divider: true },
    { icon: ZoomIn, tip: "Zoom In", action: () => reactFlowInstance.current?.zoomIn({ duration: 250 }) },
    { icon: ZoomOut, tip: "Zoom Out", action: () => reactFlowInstance.current?.zoomOut({ duration: 250 }) },
    { icon: Maximize, tip: "Fit All", action: () => reactFlowInstance.current?.fitView({ duration: 350, padding: 0.12 }) },
    { divider: true },
    {
      icon: StickyNote, tip: "Add Sticky", action: async () => {
        const vp = reactFlowInstance.current?.getViewport()
        await api.createElement(pageId, {
          element_type: "sticky", content: "…",
          position_x: -(vp?.x ?? 0) / (vp?.zoom ?? 1) + 200 + Math.random() * 100,
          position_y: -(vp?.y ?? 0) / (vp?.zoom ?? 1) + 200 + Math.random() * 100,
        }).catch(() => {})
        window.dispatchEvent(new CustomEvent("canvas:refresh"))
      }
    },
    { icon: Search, tip: "Search Canvas", action: () => window.dispatchEvent(new CustomEvent("canvas:focus-search")) },
    {
      icon: RotateCcw, tip: "Auto Layout", action: async () => {
        addSystemMessage("Reorganizing canvas…")
        await api.triggerPageLayout(pageId).catch(() => {})
        window.dispatchEvent(new CustomEvent("canvas:refresh"))
        addSystemMessage("✓ Layout updated")
      }
    },
  ]

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[72px] z-10">
      <div className="glass rounded-2xl flex items-center p-1 gap-0.5 relative">
        {btns.map((btn, i) => {
          if ('divider' in btn && btn.divider) {
            return <div key={i} className="w-px h-5 bg-[var(--glass-border)] mx-0.5" />
          }
          const Icon = btn.icon!
          return (
            <button
              key={i}
              onClick={btn.action}
              title={btn.tip}
              className={`relative z-10 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                'active' in btn && btn.active
                  ? "bg-[rgba(99,102,241,0.15)] text-[var(--accent-light)]"
                  : "text-[var(--glass-text-dim)] hover:text-white hover:bg-[rgba(255,255,255,0.07)]"
              }`}
            >
              <Icon size={15} />
            </button>
          )
        })}
      </div>
    </div>
  )
}