import { FileText, Sparkles } from "lucide-react"
import type { UserItem, AssistantItem } from "../types"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import { api } from "../api/client"

function renderBold(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export default function StreamMessage({
  item,
}: {
  item: UserItem | AssistantItem
}) {
  const { addUserMessage, addAssistantMessage, setLoading, items, addSystemMessage } = useStream()
  const { current } = useAppContext()

  async function followUp(q: string) {
    addUserMessage(q)
    setLoading(true)
    try {
      const h = items
        .filter((i): i is UserItem | AssistantItem =>
          i.type === "user" || i.type === "assistant"
        )
        .slice(-10)
        .map((i) => ({ role: i.type, content: i.content }))

      const r = await api.chat(q, h, current.type, current.pageId)
      addAssistantMessage(
        r.answer || "No response.",
        r.sources,
        r.follow_ups
      )
    } catch {
      addAssistantMessage("Connection error.")
    } finally {
      setLoading(false)
    }
  }

  if (item.type === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] bg-[var(--accent)] text-white px-4 py-2.5 rounded-[18px] rounded-br-[4px] text-[13.5px] leading-relaxed shadow-lg"
          style={{ boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}
        >
          {item.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div
          className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--purple)] flex items-center justify-center shadow-md"
          style={{ boxShadow: "0 2px 10px rgba(99,102,241,0.3)" }}
        >
          <Sparkles size={9} className="text-white" />
        </div>
        <span className="text-[9px] uppercase font-bold tracking-[0.15em] text-[var(--glass-text-muted)]">
          Mnemos
        </span>
      </div>

      <div className="text-[13.5px] text-[var(--glass-text)] leading-[1.75] whitespace-pre-wrap pl-[26px]">
        {renderBold(item.content || "")}
      </div>

      {item.sources && item.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-[26px] mt-1">
          {item.sources.map((s) => (
            <div
              key={s.id}
              className="glass rounded-full px-2 py-0.5 flex items-center gap-1 text-[10px] glass-hover cursor-pointer relative"
            >
              <FileText size={9} className="text-[var(--glass-text-dim)]" />
              <span className="text-[var(--glass-text)] max-w-[100px] truncate">
                {s.title}
              </span>
              <span className="text-[var(--green)] font-bold">
                {Math.round(s.similarity * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {item.followUps && item.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-[26px] mt-1.5">
          {item.followUps.map((q, i) => (
            <button
              key={i}
              onClick={() => followUp(q)}
              className="text-[11px] text-[var(--accent-light)] border border-[rgba(99,102,241,0.15)] rounded-full px-3 py-1 hover:bg-[var(--accent-subtle)] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      
      {current.type === "page" && item.content && (
        <div className="flex pl-[26px] mt-1">
           <button
             onClick={() => {
               import("../hooks/useCanvasEvents").then(({ useCanvasEvents }) => {
                 useCanvasEvents.getState().dispatch({ type: "add", addType: "text", content: item.content })
                 addSystemMessage("Sent to canvas.")
               })
             }}
             title="Add this response to the canvas as text"
             className="text-[10px] uppercase font-bold tracking-wider text-[var(--accent)] hover:text-white bg-[var(--accent-subtle)] hover:bg-[var(--accent)] transition-colors px-2 py-1 rounded"
           >
             Move to Canvas
           </button>
        </div>
      )}
    </div>
  )
}