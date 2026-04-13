import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import { useStream } from "../hooks/useStream"
import type { CuratorReport, BlockItem } from "../types"
import { AlertTriangle, CheckCircle, Link, Trash2 } from "lucide-react"
import { useState } from "react"

export default function CuratorReportBlock(_props: { item: BlockItem }) {
  const { addSystemMessage } = useStream()
  const [applying, setApplying] = useState<string | null>(null)

  const { data, loading, error } = useAsyncData(
    () => api.curatorScan(),
    []
  )

  async function applyAction(action: {
    action_type: string
    params: Record<string, unknown>
    reason: string
  }) {
    setApplying(action.action_type)
    try {
      await api.curatorApply({
        action_type: action.action_type,
        params: action.params,
      })
      addSystemMessage(`✓ Applied: ${action.reason}`)
    } catch {
      addSystemMessage(`✗ Failed: ${action.reason}`)
    } finally {
      setApplying(null)
    }
  }

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      loadingMessage="Running curator scan…"
    >
      {(report) => <ReportContent report={report} applying={applying} onApply={applyAction} />}
    </AsyncBlock>
  )
}

function ReportContent({
  report,
  applying,
  onApply,
}: {
  report: CuratorReport
  applying: string | null
  onApply: (action: {
    action_type: string
    params: Record<string, unknown>
    reason: string
  }) => void
}) {
  const hasIssues =
    report.potential_duplicates.length +
    report.orphan_notes.length +
    report.stale_notes.length +
    report.missing_connections.length > 0

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-4">
        Curator Report
      </div>

      {!hasIssues ? (
        <div className="flex items-center gap-2 text-[var(--green)]">
          <CheckCircle size={16} />
          <span className="text-[13px] font-semibold">
            Workspace is well maintained. No issues found.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {report.potential_duplicates.length > 0 && (
            <Section
              title={`${report.potential_duplicates.length} Potential Duplicate${report.potential_duplicates.length > 1 ? "s" : ""}`}
              icon={<AlertTriangle size={14} className="text-[var(--amber)]" />}
            >
              {report.potential_duplicates.map((d, i) => (
                <div key={i} className="text-[12px] text-[var(--glass-text-dim)] py-1">
                  Similarity {Math.round(d.similarity * 100)}% — {d.reason}
                </div>
              ))}
            </Section>
          )}

          {report.orphan_notes.length > 0 && (
            <Section
              title={`${report.orphan_notes.length} Orphan Note${report.orphan_notes.length > 1 ? "s" : ""}`}
              icon={<Trash2 size={14} className="text-[var(--red)]" />}
            >
              {report.orphan_notes.map((o, i) => (
                <div key={i} className="text-[12px] text-[var(--glass-text-dim)] py-1">
                  "{o.title}" — {o.suggestion}
                </div>
              ))}
            </Section>
          )}

          {report.missing_connections.length > 0 && (
            <Section
              title={`${report.missing_connections.length} Missing Connection${report.missing_connections.length > 1 ? "s" : ""}`}
              icon={<Link size={14} className="text-[var(--accent)]" />}
            >
              {report.missing_connections.map((m, i) => (
                <div key={i} className="text-[12px] text-[var(--glass-text-dim)] py-1">
                  {m.reason} (suggested: {m.suggested_type})
                </div>
              ))}
            </Section>
          )}

          {report.needs_confirmation.length > 0 && (
            <div className="pt-3 border-t border-[var(--glass-border)]">
              <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
                Suggested Actions
              </div>
              {report.needs_confirmation.map((action, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-[12px] text-[var(--glass-text-dim)]">
                    {action.reason}
                  </span>
                  <button
                    onClick={() => onApply(action)}
                    disabled={applying === action.action_type}
                    className="text-[11px] text-[var(--accent)] border border-[rgba(99,102,241,0.25)] px-3 py-1 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors disabled:opacity-50"
                  >
                    {applying === action.action_type ? "Applying…" : "Apply"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {report.auto_applied > 0 && (
        <div className="mt-4 text-[11px] text-[var(--green)]">
          ✓ Auto-applied {report.auto_applied} safe action
          {report.auto_applied > 1 ? "s" : ""}
        </div>
      )}
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
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[12px] font-semibold text-white">{title}</span>
      </div>
      {children}
    </div>
  )
}