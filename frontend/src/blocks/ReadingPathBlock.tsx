import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { StreamItem } from "../types"
import { BookOpen, ChevronRight, Loader2 } from "lucide-react"

interface ReadingStep {
  title: string
  noteId?: string
  reason?: string
}

export default function ReadingPathBlock({ item }: { item: StreamItem }) {
  const [steps, setSteps] = useState<ReadingStep[]>([])
  const [rawText, setRawText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const topic = item.metadata?.topic || "this topic"
        const pageId = item.metadata?.pageId
        const prompt = `Generate a suggested reading order for "${topic}". List the notes I should read first, second, third, etc. based on dependency relationships. For each step, explain why it should be read in that order.`

        const resp = await api.chat(prompt, [], pageId ? "page" : "home", pageId)

        // Try to parse structured response
        try {
          const parsed = JSON.parse(resp.answer)
          if (Array.isArray(parsed)) {
            setSteps(parsed)
          } else if (parsed.steps) {
            setSteps(parsed.steps)
          } else {
            setRawText(resp.answer)
          }
        } catch {
          setRawText(resp.answer)
        }
      } catch (err) {
        console.error(err)
        setRawText("Failed to generate reading path.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [item.metadata?.topic, item.metadata?.pageId])

  if (loading) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl flex items-center gap-3">
        <Loader2 className="animate-spin text-[var(--color-accent)]" size={18} />
        <span className="text-[13px] text-[var(--color-secondary)]">Computing reading path...</span>
      </div>
    )
  }

  const topic = item.metadata?.topic || "Current Context"

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={16} className="text-[var(--color-accent)]" />
        <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-tertiary)]">
          Reading Path — {topic}
        </div>
      </div>

      {rawText ? (
        <div className="text-[13px] text-[var(--color-secondary)] leading-relaxed whitespace-pre-wrap">
          {rawText}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 py-3 group">
              {/* Step number */}
              <div className="w-7 h-7 rounded-full glass-surface-2 flex items-center justify-center shrink-0 text-[12px] font-bold text-[var(--color-accent)]">
                {i + 1}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white">{step.title}</div>
                {step.reason && (
                  <div className="text-[11px] text-[var(--color-tertiary)] mt-0.5">{step.reason}</div>
                )}
              </div>

              {/* Arrow to next */}
              {i < steps.length - 1 && (
                <ChevronRight size={14} className="text-[var(--color-tertiary)] mt-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}