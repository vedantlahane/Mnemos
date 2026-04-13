import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import type { BlockItem, GapAnalysisResult } from "../types"
import { AlertTriangle, CheckCircle, Lightbulb } from "lucide-react"

export default function GapAnalysisBlock({ item }: { item: BlockItem }) {
  const pageId = item.metadata?.pageId

  const { data, loading, error } = useAsyncData(
    async (): Promise<GapAnalysisResult> => {
      try {
        return await api.gapAnalysis(pageId)
      } catch {
        // Fallback: use chat endpoint
        const resp = await api.chat(
          pageId
            ? "Analyze notes on this page. What's covered, missing, and what should I read next? Return JSON: {covered:[], missing:[], suggestions:[]}"
            : "Analyze all my notes. What's covered, missing, and what should I learn? Return JSON: {covered:[], missing:[], suggestions:[]}",
          [],
          pageId ? "page" : "home",
          pageId
        )
        try {
          return JSON.parse(resp.answer)
        } catch {
          return { covered: [], missing: [], suggestions: [resp.answer] }
        }
      }
    },
    [pageId]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      loadingMessage="Analyzing knowledge gaps…"
    >
      {(result) => <GapContent result={result} />}
    </AsyncBlock>
  )
}

function GapContent({ result }: { result: GapAnalysisResult }) {
  // If only suggestions (raw text fallback)
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
          <Section
            icon={<CheckCircle size={14} className="text-[var(--green)]" />}
            title={`Well Covered (${result.covered.length})`}
          >
            <div className="flex flex-wrap gap-1.5 pl-5">
              {result.covered.map((topic, i) => (
                <span
                  key={i}
                  className="text-[11px] bg-[var(--green-subtle)] text-[var(--green)] px-2 py-0.5 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </Section>
        )}
        {result.missing.length > 0 && (
          <Section
            icon={<AlertTriangle size={14} className="text-[var(--amber)]" />}
            title={`Missing (${result.missing.length})`}
          >
            <div className="flex flex-wrap gap-1.5 pl-5">
              {result.missing.map((topic, i) => (
                <span
                  key={i}
                  className="text-[11px] bg-[var(--amber-subtle)] text-[var(--amber)] px-2 py-0.5 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </Section>
        )}
        {result.suggestions.length > 0 && (
          <Section
            icon={<Lightbulb size={14} className="text-[var(--accent)]" />}
            title="Suggestions"
          >
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
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[12px] font-semibold text-white">{title}</span>
      </div>
      {children}
    </div>
  )
}