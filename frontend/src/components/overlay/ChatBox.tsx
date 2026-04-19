import type { RefObject } from "react"
import { useRef, useEffect } from "react"
import { ChatMessage } from "./ChatMessage"
import { ChatInput } from "./ChatInput"
import { TypingIndicator } from "./TypingIndicator"
import { useChatStore } from "@/store"
import { useChat } from "@/hooks/useChat"
import { CHAT_SUGGESTIONS } from "@/lib/constants"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
  minimal?: boolean
}

export function ChatBox({ inputRef, minimal }: Props) {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const { send } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages.length, isLoading])

  return (
    <div className={`flex flex-col ${minimal ? "h-auto max-h-[60vh] justify-end" : "h-full"}`}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-4 py-3 space-y-3 ${minimal ? (messages.length > 0 ? "mb-2" : "hidden") : "flex-1"}`}
        style={minimal ? { WebkitMaskImage: "linear-gradient(to top, black 80%, rgba(0,0,0,0))" } : undefined}
      >
        {messages.length === 0 && !minimal && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-sm text-[var(--glass-text-muted)]">
              Ask anything — I`ll navigate, capture, search, draw, and answer.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {CHAT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-[var(--glass-bg-thick)] text-[var(--glass-text-dim)] border border-[var(--glass-border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}
      </div>

      {/* Input */}
      <ChatInput ref={inputRef} onSend={send} disabled={isLoading} minimal={minimal} />
    </div>
  )
}

