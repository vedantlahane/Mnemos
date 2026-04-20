import { useRef, useEffect, useState, type RefObject } from "react"
import { ChatBox } from "./ChatBox"
import { useAppStore } from "@/store"
import { useDraggable } from "@/hooks/useDraggable"
import { Logo } from "@/components/shared/Logo"
import { useChatStore } from "@/store"
import { Icon } from "@/components/shared/Icon"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export function Overlay({ inputRef }: Props) {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const messageCount = useChatStore((s) => s.messages.length)
  const clearHistory = useChatStore((s) => s.clearHistory)
  const [chatOpen, setChatOpen] = useState(true)
  const dragHandleRef = useRef<HTMLDivElement>(null)
  const [hasDragged, setHasDragged] = useState(false)
  const prevWorkspaceRef = useRef<string | null>(null)

  useEffect(() => {
    const currentId = activeWorkspace?.id ?? null
    if (prevWorkspaceRef.current !== null && prevWorkspaceRef.current !== currentId) {
      clearHistory()
    }
    prevWorkspaceRef.current = currentId
  }, [activeWorkspace?.id, clearHistory])

  const initialPosition = useRef({
    x: window.innerWidth - 420,
    y: 56,
  })

  useEffect(() => {
    const handleResize = () => {
      if (!hasDragged) {
        initialPosition.current.x = window.innerWidth - 420
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [hasDragged])

  const position = useDraggable(dragHandleRef, initialPosition.current, () =>
    setHasDragged(true),
  )

  const goHome = () => {
    setActiveWorkspace(null)
    clearHistory()
  }

  // -- No workspace → full-screen home --
  if (!activeWorkspace) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col pointer-events-none">
        {messageCount === 0 ? (
          <>
            <div className="flex-1 flex flex-col items-center justify-center pointer-events-none animate-fade-in">
              <div
                className="absolute w-[600px] h-[400px] opacity-[0.06] pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse, var(--accent), transparent 70%)",
                  top: "30%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              />
              <div className="relative z-10 flex flex-col items-center">
                <div className="inline-block mb-5">
                  <Logo size={56} animated />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Mnemos</h1>
                <p className="text-[14px] text-white/30 max-w-[320px] text-center leading-relaxed">
                  Your visual knowledge workspace. Write, diagram, and organize ideas on an infinite canvas.
                </p>
              </div>
            </div>

            <div className="pointer-events-auto w-full max-w-xl mx-auto px-4 pb-10">
              <ChatBox inputRef={inputRef} minimal />
            </div>
          </>
        ) : (
          <div className="pointer-events-auto w-full max-w-xl mx-auto px-4 flex-1 flex flex-col pb-6 pt-8">
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <button
                onClick={() => clearHistory()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
              >
                <Icon name="arrowRight" size={11} className="rotate-180" />
                Home
              </button>
            </div>
            <ChatBox inputRef={inputRef} />
          </div>
        )}
      </div>
    )
  }

  // -- On a workspace --

  if (!chatOpen) {
    return (
      <button
        className="absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto transition-all hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, var(--accent), #6d28d9)",
          boxShadow: "0 4px 20px var(--accent-glow-strong), 0 8px 32px rgba(0,0,0,0.3)",
        }}
        onClick={() => setChatOpen(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    )
  }

  return (
    <div
      className="absolute flex flex-col pointer-events-auto z-50 overflow-hidden animate-scale-in"
      style={{
        width: 380,
        height: "calc(100vh - 120px)",
        left: position.x,
        top: position.y,
        borderRadius: 24,
        background: "linear-gradient(165deg, rgba(18, 18, 32, 0.60), rgba(10, 10, 22, 0.50))",
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
      {/* Header */}
      <div className="relative flex-shrink-0">
        <div
          ref={dragHandleRef}
          className="h-10 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing group"
        >
          <div className="flex items-center gap-2">
            {/* Home button */}
            <button
              onClick={goHome}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
              title="Go home"
            >
              <Icon name="arrowRight" size={12} className="rotate-180" />
            </button>
            <div className="w-1 h-1 rounded-full bg-[var(--accent)] animate-glow-pulse" />
            <span className="text-[11px] text-white/30 font-medium tracking-wide">
              {activeWorkspace.display_name}
            </span>
          </div>
          <div className="w-6 h-[3px] rounded-full bg-white/10 group-hover:bg-white/20 transition-all" />
        </div>
        <button
          onClick={() => setChatOpen(false)}
          className="absolute right-3 top-2 w-6 h-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
        >
          <Icon name="x" size={14} />
        </button>
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatBox inputRef={inputRef} />
      </div>
    </div>
  )
}