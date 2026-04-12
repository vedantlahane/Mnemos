import { FileText, Sparkles } from "lucide-react"
import type { StreamItem } from "../types"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import { api } from "../api/client"

// Simple markdown-like bold rendering without dangerouslySetInnerHTML
function renderContent(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default function StreamMessage({ item }: { item: StreamItem }) {
  const isUser = item.type === "user"
  const { addUserMessage, addAssistantMessage, setLoading, items } = useStream()
  const { current } = useAppContext()

  async function handleFollowUp(question: string) {
    addUserMessage(question)
    setLoading(true)
    try {
      const history = items
        .filter((i) => i.type === "user" || i.type === "assistant")
        .slice(-10)
        .map((i) => ({ role: i.type as string, content: i.content || "" }))

      const resp = await api.chat(question, history, current.type, current.pageId)
      addAssistantMessage(
        resp.answer || "No response.",
        resp.sources,
        resp.follow_ups
      )
    } catch {
      addAssistantMessage("Error connecting to backend.")
    } finally {
      setLoading(false)
    }
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-end gap-2.5 max-w-[75%]">
          <div className="glass-surface-2 px-4 py-2.5 rounded-2xl rounded-br-sm text-[14px] text-[var(--color-primary)] leading-relaxed">
            {item.content}
          </div>
          <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[11px] text-[var(--color-secondary)] font-semibold shrink-0 border border-[rgba(255,255,255,0.08)]">
            Y
          </div>
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex flex-col gap-2 max-w-full">
      {/* Avatar + label */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--color-accent-dim)] to-[var(--color-accent-purple)] flex items-center justify-center shrink-0">
          <Sparkles size={11} className="text-white" />
        </div>
        <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-secondary)]">
          Mnemos
        </span>
      </div>

      {/* Message body */}
      <div className="glass-surface-1 rounded-2xl rounded-tl-sm p-5">
        <div className="text-[14px] text-[var(--color-primary)] leading-[1.75] whitespace-pre-wrap">
          {renderContent(item.content || "")}
        </div>

        {/* Sources */}
        {item.sources && item.sources.length > 0 && (
          <>
            <div className="h-px bg-[rgba(255,255,255,0.06)] my-4" />
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-tertiary)] font-semibold mb-2.5">
              Sources
            </div>
            <div className="flex flex-wrap gap-2">
              {item.sources.map((src) => (
                <div
                  key={src.id}
                  className="glass-surface-2 rounded-full pl-2.5 pr-2 py-1 flex items-center gap-1.5 glass-hover cursor-pointer"
                >
                  <FileText size={12} className="text-[var(--color-secondary)]" />
                  <span className="text-[11px] text-[var(--color-primary)] max-w-[140px] truncate">
                    {src.title}
                  </span>
                  <span className="text-[9px] text-[var(--color-success)] bg-[rgba(34,197,94,0.1)] px-1.5 py-0.5 rounded font-semibold">
                    {Math.round(src.similarity * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Follow-ups */}
        {item.followUps && item.followUps.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-tertiary)] font-semibold mb-2.5 mt-5">
              Follow Up
            </div>
            <div className="flex flex-wrap gap-2">
              {item.followUps.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleFollowUp(q)}
                  className="text-[12px] text-[var(--color-accent)] border border-[rgba(99,102,241,0.25)] bg-[rgba(99,102,241,0.05)] hover:bg-[rgba(99,102,241,0.12)] rounded-full px-3.5 py-1.5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}