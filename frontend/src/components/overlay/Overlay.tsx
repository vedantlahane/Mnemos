import { useRef, type RefObject } from "react"
import { ChatBox } from "./ChatBox"
import { useAppStore } from "@/store"
import { useDraggable } from "@/hooks/useDraggable"
import { Logo } from "@/components/shared/Logo"
import { useChatStore } from "@/store"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export function Overlay({ inputRef }: Props) {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const messageCount = useChatStore((s) => s.messages.length)
  const dragHandleRef = useRef<HTMLDivElement>(null)
  const position = useDraggable(dragHandleRef, {
    x: window.innerWidth - 420,
    y: 56,
  })

  // ── No workspace → full-screen conversational mode ──
  if (!activeWorkspace) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col pointer-events-none">
        {/* Top — branding (only when no messages) */}
        {messageCount === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center pointer-events-none animate-fade-in">
            <div className="inline-block mb-4">
              <Logo size={48} animated />
            </div>
            <h1 className="text-lg font-semibold text-white tracking-tight mb-1.5">Mnemos</h1>
            <p className="text-[13px] text-white/25 max-w-[280px] text-center leading-relaxed">
              Your second brain. Type anything below, or <span className="font-mono text-[var(--accent-light)]/40">/</span> for commands.
            </p>
          </div>
        )}

        {/* Chat area — grows from bottom */}
        <div className={`pointer-events-auto w-full max-w-2xl mx-auto px-4 ${
          messageCount === 0 ? "pb-10" : "flex-1 flex flex-col pb-6 pt-16"
        }`}>
          <ChatBox inputRef={inputRef} minimal={messageCount === 0} />
        </div>
      </div>
    )
  }

  // ── Workspace open → floating panel ──
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
      <div
        ref={dragHandleRef}
        className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing group flex-shrink-0"
      >
        <div className="w-6 h-[3px] rounded-full bg-white/10 group-hover:bg-white/20 group-hover:w-8 transition-all duration-200" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatBox inputRef={inputRef} />
      </div>
    </div>
  )
}