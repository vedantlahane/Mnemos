import { useEffect, useState, useRef } from "react"
import { api } from "../api/client"
import type { StreamItem } from "../types"
import { AlertTriangle, CheckCircle, Lightbulb, Loader2 } from "lucide-react"

interface GapResult {
  covered: string[]
  missing: string[]
  suggestions: string[]
}

export default function GapAnalysisBlock({ item }: { item: StreamItem }) {
  const [result, setResult] = useState<GapResult | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const pageId = item.metadata?.pageId

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    async function analyze() {
      try {
        const prompt = pageId
          ? "Analyze the notes on this page. What subtopics are covered, what's missing, and what should I read next?"
          : "Analyze all my notes. What topics are well covered, what's missing, and what should I learn next?"

        const resp = await api.chat(prompt, [], pageId ? "page" : "home", pageId)

        try {
          const parsed = JSON.parse(resp.answer)
          setResult(parsed)
        } catch {
          setResult({
            covered: [],
            missing: [],
            suggestions: [resp.answer],
          })
        }
      } catch (err) {
        console.error(err)
        setResult(null)
      } finally {
        setLoading(false)
      }
    }
    analyze()
  }, [pageId])

  if (loading) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl flex items-center gap-3">
        <Loader2 className="animate-spin text-[var(--accent)]" size={18} />
        <span className="text-[13px] text-[var(--glass-text-dim)]">
          Analyzing knowledge gaps...
        </span>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[13px] text-[var(--red)]">
        Gap analysis failed. Try again later.
      </div>
    )
  }

  if (
    result.covered.length === 0 &&
    result.missing.length === 0 &&
    result.suggestions.length > 0
  ) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl">
        <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-4">
          Gap Analysis
        </div>
        <div className="text-[13px] text-[var(--glass-text-dim)] leading-relaxed whitespace-pre-wrap">
          {result.suggestions[0]}
        </div>
      </div>
    )
  }

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-4">
        Gap Analysis
      </div>

      <div className="flex flex-col gap-4">
        {result.covered.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={14} className="text-[var(--green)]" />
              <span className="text-[12px] font-semibold text-white">
                Well Covered ({result.covered.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-5">
              {result.covered.map((topic, i) => (
                <span
                  key={i}
                  className="text-[11px] bg-[rgba(34,197,94,0.08)] text-[var(--green)] px-2 py-0.5 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.missing.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-[var(--amber)]" />
              <span className="text-[12px] font-semibold text-white">
                Missing ({result.missing.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-5">
              {result.missing.map((topic, i) => (
                <span
                  key={i}
                  className="text-[11px] bg-[rgba(245,158,11,0.08)] text-[var(--amber)] px-2 py-0.5 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.suggestions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={14} className="text-[var(--accent)]" />
              <span className="text-[12px] font-semibold text-white">
                Suggestions
              </span>
            </div>
            <ul className="pl-5 flex flex-col gap-1">
              {result.suggestions.map((s, i) => (
                <li
                  key={i}
                  className="text-[12px] text-[var(--glass-text-dim)] leading-relaxed"
                >
                  • {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}