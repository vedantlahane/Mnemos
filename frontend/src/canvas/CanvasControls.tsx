import { ZoomIn, ZoomOut, Maximize, FilePlus2, RotateCcw } from "lucide-react"
import type { ReactFlowInstance } from "@xyflow/react"
import { api } from "../api/client"
import { useStream } from "../hooks/useStream"

interface Props {
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>
  pageId: string
}

export default function CanvasControls({ reactFlowInstance, pageId }: Props) {
  const { addSystemMessage } = useStream()

  function zoomIn() {
    reactFlowInstance.current?.zoomIn({ duration: 300 })
  }

  function zoomOut() {
    reactFlowInstance.current?.zoomOut({ duration: 300 })
  }

  function fitView() {
    reactFlowInstance.current?.fitView({ duration: 400, padding: 0.15 })
  }

  async function addSticky() {
    const viewport = reactFlowInstance.current?.getViewport()
    const x = -(viewport?.x ?? 0) / (viewport?.zoom ?? 1) + 200
    const y = -(viewport?.y ?? 0) / (viewport?.zoom ?? 1) + 200

    try {
      await api.createElement(pageId, {
        element_type: "sticky",
        content: "New note...",
        position_x: x,
        position_y: y,
      })
      window.dispatchEvent(new CustomEvent("canvas:refresh"))
    } catch (err) {
      console.error(err)
    }
  }

  async function triggerLayout() {
    try {
      addSystemMessage("Reorganizing canvas...")
      await api.triggerPageLayout(pageId)
      window.dispatchEvent(new CustomEvent("canvas:refresh"))
      addSystemMessage("✓ Layout updated.")
    } catch {
      addSystemMessage("✗ Layout failed.")
    }
  }

  const buttons = [
    { icon: ZoomIn, title: "Zoom In", action: zoomIn },
    { icon: ZoomOut, title: "Zoom Out", action: zoomOut },
    { icon: Maximize, title: "Fit View", action: fitView },
    { icon: FilePlus2, title: "Add Sticky", action: addSticky },
    { icon: RotateCcw, title: "Auto Layout", action: triggerLayout },
  ]

  return (
    <div className="absolute right-4 bottom-20 flex gap-1.5 z-10">
      <div className="glass-surface-2 rounded-xl flex overflow-hidden shadow-xl">
        {buttons.map((btn, i) => (
          <button
            key={btn.title}
            onClick={btn.action}
            title={btn.title}
            className={`p-2.5 text-[var(--color-secondary)] hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors ${
              i < buttons.length - 1 ? "border-r border-[rgba(255,255,255,0.06)]" : ""
            }`}
          >
            <btn.icon size={15} />
          </button>
        ))}
      </div>
    </div>
  )
}