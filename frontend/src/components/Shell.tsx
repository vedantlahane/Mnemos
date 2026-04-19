import { useRef, useEffect } from "react"
import { Canvas } from "@/components/canvas/Canvas"
import { Overlay } from "@/components/overlay/Overlay"
import { useAuth } from "@/hooks/useAuth"
import { useKeyboard } from "@/hooks/useKeyboard"

export function Shell() {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { init } = useAuth()

  useEffect(() => { init() }, [init])
  useKeyboard(inputRef)

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-void)] relative">
      <div className="flex-1 relative w-full h-full">
        <Canvas />
      </div>
      <Overlay inputRef={inputRef} />
    </div>
  )
}