import type { RefObject } from "react"
import { useRef, useEffect } from "react"
import { ChatMessage } from "./ChatMessage"
import { ChatInput } from "./ChatInput"
import { TypingIndicator } from "./TypingIndicator"
import { useChatStore } from "@/store"
import { useChat } from "@/hooks/useChat"
import { useAppStore } from "@/store"
import { Icon } from "@/components/shared/Icon"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
  /** true = just the input bar, no message list */
  minimal?: boolean
}

const WORKSPACE_HINTS = [
  { label: "Compose text", msg: "write about ", icon: "sparkles" as const },
  { label: "Add diagram", msg: "draw diagram ", icon: "graph" as const },
  { label: "What's here?", msg: "what's on this page", icon: "search" as const },
]

export function ChatBox({ inputRef, minimal }: Props) {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
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
            {activeWorkspace ? (
              <>
                <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent)]/10 flex items-center justify-center mb-3">
                  <span className="text-lg">{activeWorkspace.icon}</span>
                </div>
                <p className="text-[13px] text-white/30 mb-1 font-medium">
                  {activeWorkspace.display_name}
                </p>
                <p className="text-[11px] text-white/15 mb-5 text-center max-w-[200px]">
                  Ask anything about this board or add content
                </p>
                <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                  {WORKSPACE_HINTS.map((hint) => (
                    <button
                      key={hint.label}
                      onClick={() => {
                        if (hint.msg.endsWith(" ")) {
                          const input = inputRef.current
                          if (input) {
                            input.focus()
                            const setter = Object.getOwnPropertyDescriptor(
                              window.HTMLTextAreaElement.prototype,
                              "value",
                            )?.set
                            setter?.call(input, hint.msg)
                            input.dispatchEvent(new Event("input", { bubbles: true }))
                          }
                        } else {
                          send(hint.msg)
                        }
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[12px] text-white/25 hover:text-white/50 hover:bg-white/[0.03] transition-all group"
                    >
                      <Icon
                        name={hint.icon}
                        size={13}
                        className="text-white/15 group-hover:text-[var(--accent-light)]/50 transition-colors"
                      />
                      {hint.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[12px] text-white/20 text-center max-w-[200px] leading-relaxed">
                  Ask anything or type{" "}
                  <span className="font-mono text-[var(--accent-light)]/40">
                    /
                  </span>{" "}
                  for commands
                </p>
              </>
            )}
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