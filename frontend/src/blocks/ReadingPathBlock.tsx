import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import type { BlockItem, ReadingStep } from "../types"
import { BookOpen, ChevronRight } from "lucide-react"

export default function ReadingPathBlock({ item }: { item: BlockItem }) {
  const topic = item.metadata?.topic || "this topic"
  const pageId = item.metadata?.pageId

  const { data, loading, error } = useAsyncData(
    async (): Promise<{ steps: ReadingStep[]; rawText?: string }> => {
      try {
        const result = await api.readingPath(topic, pageId)
        return { steps: result.steps }
      } catch {
        // Fallback to chat
        const resp = await api.chat(
          `Generate a reading order for "${topic}". List notes I should read first, second, third with reasons. Return JSON array: [{title, reason}]`,
          [],
          pageId ? "page" : "home",
          pageId
        )
        try {
          const parsed = JSON.parse(resp.answer)
          const steps = Array.isArray(parsed)
            ? parsed
            : parsed.steps || []
          return { steps }
        } catch {
          return { steps: [], rawText: resp.answer }
        }
      }
    },
    [topic, pageId]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      loadingMessage="Computing reading path…"
    >
      {(result) => (
        <div className="glass-surface-1 p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={16} className="text-[var(--accent)]" />
            <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)]">
              Reading Path — {topic}
            </div>
          </div>

          {result.rawText ? (
            <div className="text-[13px] text-[var(--glass-text-dim)] leading-relaxed whitespace-pre-wrap">
              {result.rawText}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {result.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 py-3 group">
                  <div className="w-7 h-7 rounded-full glass-surface-2 flex items-center justify-center shrink-0 text-[12px] font-bold text-[var(--accent)]">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-white">
                      {step.title}
                    </div>
                    {step.reason && (
                      <div className="text-[11px] text-[var(--glass-text-muted)] mt-0.5">
                        {step.reason}
                      </div>
                    )}
                  </div>
                  {i < result.steps.length - 1 && (
                    <ChevronRight
                      size={14}
                      className="text-[var(--glass-text-muted)] mt-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AsyncBlock>
  )
}