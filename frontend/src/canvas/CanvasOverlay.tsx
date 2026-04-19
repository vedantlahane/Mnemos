import { useAppContext } from "../hooks/useAppContext"
import ExcalidrawCanvas from "./ExcalidrawCanvas"

export default function CanvasOverlay() {
  const { current } = useAppContext()

  if (current.type !== "page" || !current.pageId) return null

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-void)]">
      <div className="flex-1 relative">
        <ExcalidrawCanvas pageId={current.pageId} />        
      </div>
    </div>
  )
}