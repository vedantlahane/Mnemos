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
  /** true = just the input bar, no message list */
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

  // Minimal = just the input, no message history
  if (minimal) {
    return (
      <div className="animate-slide-up">
        <ChatInput ref={inputRef} onSend={send} disabled={isLoading} minimal />
      </div>
    )
  }

  // Full chat with messages
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <Logo size={28} animated className="opacity-30 mb-3" />
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
      <ChatInput ref={inputRef} onSend={send} disabled={isLoading} />
    </div>
  )
}