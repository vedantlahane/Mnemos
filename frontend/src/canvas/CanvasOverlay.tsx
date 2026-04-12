import { useContext } from "../hooks/useContext"
import CanvasView from "./CanvasView"

export default function CanvasOverlay() {
  const { current } = useContext()

  if (current.type !== "page") {
    return null
  }

  return (
    <div className="absolute inset-0 z-0">
      <CanvasView />
    </div>
  )
}
