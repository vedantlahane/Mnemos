import { useRef, type RefObject } from "react"
import { ChatBox } from "./ChatBox"
import { PanelContainer } from "@/components/panels/PanelContainer"
import { useAppStore } from "@/store"
import { useDraggable } from "@/hooks/useDraggable"
import { GripHorizontal } from "lucide-react"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export function Overlay({ inputRef }: Props) {
  const panel = useAppStore((s) => s.activePanel)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const dragHandleRef = useRef<HTMLDivElement>(null)
  
  // Starting position assuming window is ~1200px width.
  // Draggable handles absolute offset.
  const position = useDraggable(dragHandleRef, { x: window.innerWidth - 420, y: 64 })

  if (!activeWorkspace) {
    // Hyper-minimal center-down fixed chat when no workspace is open
    return (
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-end items-center pb-12 z-50">
        <div className="pointer-events-auto w-full max-w-2xl px-4 animate-slide-up">
          <ChatBox inputRef={inputRef} minimal />
        </div>
      </div>
    )
  }

  // Draggable liquid glass panel when canvas is open
  return (
    <div
      className="absolute flex flex-col pointer-events-auto z-50 shadow-2xl overflow-hidden transition-shadow"
        style={{
          width: 380,
          height: "calc(100vh - 140px)",
          left: position.x || undefined,
          top: position.y || undefined,
          right: position.x ? undefined : 40,
          borderRadius: 24,
          background: "linear-gradient(to bottom, rgba(30, 30, 40, 0.45), rgba(20, 20, 30, 0.35))",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 30px 60px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <div 
          ref={dragHandleRef} 
          className="h-10 flex items-center justify-center cursor-grab active:cursor-grabbing border-b border-white/5 text-white/30 hover:text-white/80 hover:bg-white/5 transition-all"
        >
          <GripHorizontal size={18} strokeWidth={2} />
        </div>

        {panel !== "none" && (
          <div className="flex-shrink-0 max-h-[50%] overflow-y-auto border-b border-white/10 bg-black/20">
            <PanelContainer />
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <ChatBox inputRef={inputRef} />
        </div>
      </div>
  )
}
