import type { ChatMessage as Msg } from "@/api/types"
import { Markdown } from "@/components/shared/Markdown"

interface Props {
  message: Msg
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user"
  const isError = message.content.startsWith("⚠️")

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-[var(--accent)] text-white rounded-br-md"
            : isError
              ? "glass border-[var(--red)]/30 text-[var(--red)] rounded-bl-md"
              : "glass rounded-bl-md",
        )}
      >
        {isUser ? <p>{message.content}</p> : <Markdown content={message.content} />}
      </div>
    </div>
  )
}

function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}