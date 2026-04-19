import { useRef, type RefObject } from "react"
import { ChatBox } from "./ChatBox"
import { useAppStore } from "@/store"
import { useDraggable } from "@/hooks/useDraggable"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export function Overlay({ inputRef }: Props) {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const dragHandleRef = useRef<HTMLDivElement>(null)
  const position = useDraggable(dragHandleRef, {
    x: window.innerWidth - 420,
    y: 56,
  })

  // No workspace → centered minimal chat at bottom
  if (!activeWorkspace) {
    return (
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-end items-center pb-10 z-50">
        <div className="pointer-events-auto w-full max-w-xl px-4 animate-slide-up">
          <ChatBox inputRef={inputRef} minimal />
        </div>
      </div>
    )
  }

  // Workspace open → floating glass chat panel
  return (
    <div
      className="absolute flex flex-col pointer-events-auto z-50 overflow-hidden animate-scale-in"
      style={{
        width: 380,
        height: "calc(100vh - 120px)",
        left: position.x || undefined,
        top: position.y || undefined,
        right: position.x ? undefined : 32,
        borderRadius: 24,
        background: "linear-gradient(165deg, rgba(18, 18, 32, 0.55), rgba(10, 10, 22, 0.45))",
        backdropFilter: "blur(48px) saturate(1.4)",
        WebkitBackdropFilter: "blur(48px) saturate(1.4)",
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.06),
          0 0 0 0.5px rgba(255,255,255,0.03) inset,
          0 1px 0 rgba(255,255,255,0.04) inset,
          0 32px 64px -16px rgba(0,0,0,0.55)
        `,
      }}
    >
      {/* Drag handle */}
      <div
        ref={dragHandleRef}
        className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing group"
      >
        <div className="w-6 h-[3px] rounded-full bg-white/10 group-hover:bg-white/20 group-hover:w-8 transition-all duration-200" />
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatBox inputRef={inputRef} />
      </div>
    </div>
  )
}