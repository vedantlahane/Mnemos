import { FileText, Sparkles } from "lucide-react"
import type { StreamItem } from "../types"
import { useStream } from "../hooks/useStream"
import { api } from "../api/client"

export default function StreamMessage({ item }: { item: StreamItem }) {
  const isUser = item.type === "user"
  const { addAssistantMessage, setLoading } = useStream()

  // Follow-up handler
  async function handleFollowUp(q: string) {
    setLoading(true)
    try {
      const resp = await api.chat(q, []) // Simple no-history follow up for demo
      addAssistantMessage(resp.answer || "No response.", resp.sources, resp.follow_ups)
    } catch {
      addAssistantMessage("Error connecting to backend.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {isUser ? (
        <div className="flex items-center gap-3 max-w-[80%]">
          <div className="glass-elevated px-4 py-2 rounded-2xl text-[14px] text-[var(--color-primary)]">
            {item.content}
          </div>
          <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-[12px] text-[var(--color-secondary)] font-semibold shrink-0 border border-[rgba(255,255,255,0.1)]">
            Y
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-w-[700px] w-full">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[var(--color-accent-blue)] to-[var(--color-accent-cyan)] flex items-center justify-center shrink-0">
              <Sparkles size={12} className="text-white" strokeWidth={2} />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-secondary)]">
              Mnemos
            </span>
          </div>

          <div className="glass-primary rounded-2xl p-5 border border-[rgba(255,255,255,0.06)]">
            <div
              className="text-[14px] text-[var(--color-primary)] leading-[1.7] whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: (item.content || "").replace(
                  /\*\*(.*?)\*\*/g,
                  '<strong class="font-semibold text-white">$1</strong>'
                ),
              }}
            />

            {item.sources && item.sources.length > 0 && (
              <>
                <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-4" />
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-3">
                  Sources
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.sources.map((src) => (
                    <div
                      key={src.id}
                      className="glass-elevated rounded-full pl-3 pr-2 py-1.5 flex items-center gap-2 border border-[rgba(255,255,255,0.08)] cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    >
                      <FileText size={14} className="text-[var(--color-secondary)]" />
                      <span className="text-[12px] text-[var(--color-primary)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                        {src.title}
                      </span>
                      <span className="text-[10px] text-[var(--color-success)] bg-[rgba(16,185,129,0.1)] px-1.5 py-0.5 rounded ml-1 font-semibold">
                        {Math.round(src.similarity * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {item.followUps && item.followUps.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-3 mt-5">
                  Follow Up
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.followUps.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleFollowUp(q)}
                      className="text-[12px] text-[var(--color-accent-blue)] border border-[rgba(37,99,235,0.3)] bg-transparent hover:bg-[rgba(37,99,235,0.1)] rounded-full px-4 py-1.5 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
