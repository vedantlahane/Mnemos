import type { RichMessage } from "@/store"
import { Markdown } from "@/components/shared/Markdown"
import { BoardsCard } from "@/components/cards/BoardsCard"
import { SearchCard } from "@/components/cards/SearchCard"
import { SettingsCard } from "@/components/cards/SettingsCard"
import { useChat } from "@/hooks/useChat"
import { asBoardList, asSearch, asPreferences } from "@/lib/utils"

interface Props {
  message: RichMessage
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user"
  const isError = !!message.error || message.content.startsWith("⚠️")
  const isStreaming = !!(message as any).isStreaming
  const { send } = useChat()

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up`}>
      <div className={cn("space-y-2", isUser ? "max-w-[80%]" : "max-w-[88%]")}>
        {/* Message bubble */}
        <div
          className={cn(
            "rounded-[18px] px-4 py-2.5 text-[13.5px] leading-relaxed",
            isUser
              ? "bg-gradient-to-br from-[var(--accent)] to-[#6d28d9] text-white rounded-br-md shadow-[0_2px_12px_var(--accent-glow)]"
              : isError
                ? "bg-[var(--red-subtle)] border border-[var(--red)]/15 text-[var(--red)]/80 rounded-bl-md"
                : isStreaming
                  ? "glass rounded-bl-md border-[var(--accent)]/15"
                  : "glass rounded-bl-md",
          )}
        >
          {isStreaming && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/[0.05]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-glow-pulse" />
              <span className="text-[10px] text-[var(--accent-light)]/70 font-medium tracking-wide uppercase">
                Writing to canvas
              </span>
            </div>
          )}

          {isUser ? (
            <p>{message.content}</p>
          ) : isStreaming ? (
            <StreamingText content={message.content} />
          ) : (
            <Markdown content={message.content} />
          )}
        </div>

        {/* Inline cards */}
        {!isUser && !isStreaming && !!message.data && (
          <InlineCard action={message.ui_action} data={message.data} send={send} />
        )}
      </div>
    </div>
  )
}

function StreamingText({ content }: { content: string }) {
  const maxPreview = 250
  const display = content.length > maxPreview ? "…" + content.slice(-maxPreview) : content

  return (
    <div className="font-mono text-[11.5px] leading-relaxed text-white/60 max-h-[100px] overflow-hidden">
      <p className="whitespace-pre-wrap break-words">{display}</p>
      <span className="inline-block w-[5px] h-[13px] bg-[var(--accent-light)] animate-pulse ml-0.5 align-middle rounded-sm" />
    </div>
  )
}

function InlineCard({
  action,
  data,
  send,
}: {
  action?: string | null
  data: unknown
  send: (msg: string) => void
}) {
  switch (action) {
    case "list_boards": {
      const d = asBoardList(data)
      return d ? <BoardsCard data={d} send={send} /> : null
    }
    case "show_search": {
      const d = asSearch(data)
      return d ? <SearchCard data={d} send={send} /> : null
    }
    case "open_settings": {
      const d = asPreferences(data)
      return d ? <SettingsCard data={d} send={send} /> : null
    }
    default:
      return null
  }
}

function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}