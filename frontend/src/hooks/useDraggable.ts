import { useState, useEffect, useRef, type RefObject } from "react"

export function useDraggable(
  handleRef: RefObject<HTMLElement | null>,
  initialPosition = { x: 0, y: 0 }
) {
  const [position, setPosition] = useState(initialPosition)
  const lastPosition = useRef(initialPosition)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const elementStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      elementStart.current = { ...lastPosition.current }
      e.stopPropagation()
      // Disable text selection during drag
      document.body.style.userSelect = "none"
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return

      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y

      const newPos = {
        x: elementStart.current.x + dx,
        y: elementStart.current.y + dy,
      }
      
      lastPosition.current = newPos
      setPosition(newPos)
    }

    const onMouseUp = () => {
      if (isDragging.current) {
        document.body.style.userSelect = ""
      }
      isDragging.current = false
    }

    handle.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      handle.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [handleRef])
  return position
}
