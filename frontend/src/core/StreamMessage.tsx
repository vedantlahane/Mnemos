import { FileText, Sparkles } from "lucide-react"
import type { StreamItem } from "../types"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import { api } from "../api/client"

function renderBold(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

export default function StreamMessage({ item }: { item: StreamItem }) {
  const isUser = item.type === "user"
  const { addUserMessage, addAssistantMessage, setLoading, items } = useStream()
  const { current } = useAppContext()

  async function followUp(q: string) {
    addUserMessage(q)
    setLoading(true)
    try {
      const h = items.filter(i => i.type === "user" || i.type === "assistant").slice(-10).map(i => ({ role: i.type as string, content: i.content || "" }))
      const r = await api.chat(q, h, current.type, current.pageId)
      addAssistantMessage(r.answer || "No response.", r.sources, r.follow_ups)
    } catch { addAssistantMessage("Connection error.") }
    finally { setLoading(false) }
  }

  // ── User message ──
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-[var(--accent)] text-white px-4 py-2.5 rounded-[18px] rounded-br-[4px] text-[13.5px] leading-relaxed shadow-lg" style={{ boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}>
          {item.content}
        </div>
      </div>
    )
  }

  // ── Assistant message ──
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--purple)] flex items-center justify-center shadow-md" style={{ boxShadow: "0 2px 10px rgba(99,102,241,0.3)" }}>
          <Sparkles size={9} className="text-white" />
        </div>
        <span className="text-[9px] uppercase font-bold tracking-[0.15em] text-[var(--glass-text-muted)]">Mnemos</span>
      </div>

      <div className="text-[13.5px] text-[var(--glass-text)] leading-[1.75] whitespace-pre-wrap pl-6.5">
        {renderBold(item.content || "")}
      </div>

      {/* Sources */}
      {item.sources && item.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-6.5 mt-1">
          {item.sources.map(s => (
            <div key={s.id} className="glass rounded-full px-2 py-0.5 flex items-center gap-1 text-[10px] glass-hover cursor-pointer relative">
              <FileText size={9} className="text-[var(--glass-text-dim)]" />
              <span className="text-[var(--glass-text)] max-w-[100px] truncate">{s.title}</span>
              <span className="text-[var(--green)] font-bold">{Math.round(s.similarity * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Follow-ups */}
      {item.followUps && item.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-6.5 mt-1.5">
          {item.followUps.map((q, i) => (
            <button key={i} onClick={() => followUp(q)} className="text-[11px] text-[var(--accent-light)] border border-[rgba(99,102,241,0.15)] rounded-full px-3 py-1 hover:bg-[rgba(99,102,241,0.06)] transition-colors">
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}