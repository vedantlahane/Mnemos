// === FILE: frontend/src/components/chat/ChatMessage.tsx ===

import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { Markdown } from "@/components/shared/Markdown";

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
        style={
          isUser
            ? {
                background: "var(--accent)",
                color: "white",
                borderBottomRightRadius: "4px",
              }
            : {
                background: "var(--glass-bg-thick)",
                color: "var(--glass-text)",
                border: "1px solid var(--glass-border)",
                borderBottomLeftRadius: "4px",
              }
        }
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  );
}
