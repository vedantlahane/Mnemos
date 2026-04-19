import type { RichMessage } from "@/store"
import { Markdown } from "@/components/shared/Markdown"
import { BoardsCard } from "@/components/cards/BoardsCard"
import { ItemsCard } from "@/components/cards/ItemsCard"
import { StatsCard } from "@/components/cards/StatsCard"
import { TagsCard } from "@/components/cards/TagsCard"
import { SearchCard } from "@/components/cards/SearchCard"
import { SettingsCard } from "@/components/cards/SettingsCard"
import { GraphCard } from "@/components/cards/GraphCard"
import { useChat } from "@/hooks/useChat"
import {
  asBoardList, asItemList, asGraph,
  asSearch, asTags, asStats, asPreferences,
} from "@/lib/utils"

interface Props {
  message: RichMessage
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user"
  const isError = !!message.error || message.content.startsWith("⚠️")
  const { send } = useChat()

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up`}>
      <div className="max-w-[90%] space-y-2.5">
        {/* Text bubble */}
        <div
          className={cn(
            "rounded-[20px] px-4 py-2.5 text-[14px] leading-relaxed",
            isUser
              ? "bg-gradient-to-br from-[var(--accent)] to-[#6d28d9] text-white rounded-br-lg shadow-[0_4px_20px_var(--accent-glow)]"
              : isError
                ? "glass border-[var(--red)]/20 text-[var(--red)]/90 rounded-bl-lg"
                : "glass rounded-bl-lg",
          )}
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>

        {/* Inline interactive card */}
        {!isUser && !!message.data && (
          <div className="pl-1">
            <InlineCard action={message.ui_action} data={message.data} send={send} />
          </div>
        )}
      </div>
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
    case "list_items": {
      const d = asItemList(data)
      return d ? <ItemsCard data={d} send={send} /> : null
    }
    case "show_stats": {
      const d = asStats(data)
      return d ? <StatsCard data={d} /> : null
    }
    case "list_tags": {
      const d = asTags(data)
      return d ? <TagsCard data={d} send={send} /> : null
    }
    case "show_search": {
      const d = asSearch(data)
      return d ? <SearchCard data={d} send={send} /> : null
    }
    case "open_settings": {
      const d = asPreferences(data)
      return d ? <SettingsCard data={d} send={send} /> : null
    }
    case "open_graph": {
      const d = asGraph(data)
      return d ? <GraphCard data={d} send={send} /> : null
    }
    default:
      return null
  }
}

function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}