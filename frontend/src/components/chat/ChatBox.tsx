// === FILE: frontend/src/components/chat/ChatBox.tsx ===

import type { RefObject } from "react";
import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { useChatStore } from "@/store";
import { CHAT_SUGGESTIONS } from "@/lib/constants";
import { useChat } from "@/hooks/use-chat-new";

interface Props {
  inputRef: RefObject<HTMLTextAreaElement>;
}

export function ChatBox({ inputRef }: Props) {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const { send } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isLoading]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{
          background: "var(--glass-bg)",
        }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm" style={{ color: "var(--glass-text-muted)" }}>
              Type anything. I can navigate, capture, search, draw, and answer.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {CHAT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all hover:scale-105"
                  style={{
                    background: "var(--glass-bg-thick)",
                    color: "var(--glass-text-dim)",
                    border: "1px solid var(--glass-border)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--accent-glow-strong)";
                    (e.currentTarget as HTMLElement).style.color = "var(--accent)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--glass-bg-thick)";
                    (e.currentTarget as HTMLElement).style.color = "var(--glass-text-dim)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
                  }}
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
      <ChatInput ref={inputRef} onSend={send} disabled={isLoading} />
    </div>
  );
}
