import { useRef, useEffect } from "react"
import { Canvas } from "@/components/canvas/Canvas"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { useAuth } from "@/hooks/useAuth"
import { useKeyboard } from "@/hooks/useKeyboard"
import { useAppStore } from "@/store"

export function Shell() {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const { init } = useAuth()

  useEffect(() => { init() }, [init])
  useKeyboard(inputRef, () => setActivePanel("none"))

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-void)]">
      <div className="flex-1 relative">
        <Canvas />
      </div>
      <Sidebar inputRef={inputRef} />
    </div>
  )
}