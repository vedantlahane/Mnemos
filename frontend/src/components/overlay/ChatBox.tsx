import type { RefObject } from "react"
import { useRef, useEffect } from "react"
import { ChatMessage } from "./ChatMessage"
import { ChatInput } from "./ChatInput"
import { TypingIndicator } from "./TypingIndicator"
import { useChatStore } from "@/store"
import { useChat } from "@/hooks/useChat"
import { Logo } from "@/components/shared/Logo"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
  minimal?: boolean
}

export function ChatBox({ inputRef, minimal }: Props) {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const { send } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages.length, isLoading])

  return (
    <div className={`flex flex-col ${minimal ? "h-auto max-h-[70vh] justify-end" : "h-full"}`}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-4 py-3 space-y-4 ${
          minimal
            ? messages.length > 0 ? "mb-2" : "hidden"
            : "flex-1"
        }`}
        style={
          minimal
            ? { WebkitMaskImage: "linear-gradient(to top, black 85%, rgba(0,0,0,0))" }
            : undefined
        }
      >
        {/* Empty state — just a subtle hint */}
        {messages.length === 0 && !minimal && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <Logo size={32} animated className="opacity-40 mb-3" />
            <p className="text-[12px] text-white/20 text-center max-w-[200px] leading-relaxed">
              Ask anything or type <span className="font-mono text-[var(--accent-light)]/40">/</span> for commands
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}
      </div>

      {/* Input */}
      <ChatInput ref={inputRef} onSend={send} disabled={isLoading} minimal={minimal} />
    </div>
  )
}