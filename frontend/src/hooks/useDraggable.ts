// === FILE: frontend/src/hooks/useDraggable.ts ===

import { useState, useEffect, useRef, type RefObject } from "react"

export function useDraggable(
  handleRef: RefObject<HTMLElement | null>,
  initialPosition = { x: 0, y: 0 },
  onDragStart?: () => void,
) {
  const [position, setPosition] = useState(initialPosition)

  const positionRef = useRef(position)
  positionRef.current = position

  const isDragging = useRef(false)
  const didMove = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const elementStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true
      didMove.current = false
      dragStart.current = { x: e.clientX, y: e.clientY }
      elementStart.current = {
        x: positionRef.current.x,
        y: positionRef.current.y,
      }

      e.stopPropagation()
      handle.setPointerCapture(e.pointerId)
      document.body.style.userSelect = "none"
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return

      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y

      // Only count as drag if moved more than 3px
      if (!didMove.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        didMove.current = true
        onDragStart?.()
      }

      if (didMove.current) {
        // Clamp within viewport
        const newX = Math.max(0, Math.min(window.innerWidth - 100, elementStart.current.x + dx))
        const newY = Math.max(0, Math.min(window.innerHeight - 100, elementStart.current.y + dy))
        setPosition({ x: newX, y: newY })
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging.current) {
        document.body.style.userSelect = ""
        try {
          handle.releasePointerCapture(e.pointerId)
        } catch {
          // pointer capture may already be released
        }
      }
      isDragging.current = false
      didMove.current = false
    }

    handle.addEventListener("pointerdown", onPointerDown)
    handle.addEventListener("pointermove", onPointerMove)
    handle.addEventListener("pointerup", onPointerUp)
    handle.addEventListener("pointercancel", onPointerUp)

    return () => {
      handle.removeEventListener("pointerdown", onPointerDown)
      handle.removeEventListener("pointermove", onPointerMove)
      handle.removeEventListener("pointerup", onPointerUp)
      handle.removeEventListener("pointercancel", onPointerUp)
    }
  }, [handleRef, onDragStart])

  return position
}