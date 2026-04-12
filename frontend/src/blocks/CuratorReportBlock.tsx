import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useStream } from "../hooks/useStream"
import type { CuratorReport, StreamItem } from "../types"
import { AlertTriangle, CheckCircle, Link, Trash2, Loader2 } from "lucide-react"

export default function CuratorReportBlock({}: { item: StreamItem }) {
  const [report, setReport] = useState<CuratorReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)
  const { addSystemMessage } = useStream()

  useEffect(() => {
    api.curatorScan()
      .then(setReport)
      .catch((err) => {
        console.error(err)
        setReport(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function applyAction(action: { action_type: string; params: Record<string, unknown>; reason: string }) {
    setApplying(action.action_type)
    try {
      await api.curatorApply({ action_type: action.action_type, params: action.params })
      addSystemMessage(`✓ Applied: ${action.reason}`)
    } catch {
      addSystemMessage(`✗ Failed to apply: ${action.reason}`)
    } finally {
      setApplying(null)
    }
  }

  if (loading) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl flex items-center gap-3">
        <Loader2 className="animate-spin text-[var(--color-accent)]" size={18} />
        <span className="text-[13px] text-[var(--color-secondary)]">Running curator scan...</span>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[13px] text-[var(--color-error)]">
        Curator scan failed. Backend may not support this endpoint yet.
      </div>
    )
  }

  const hasIssues =
    report.potential_duplicates.length +
    report.orphan_notes.length +
    report.stale_notes.length +
    report.missing_connections.length > 0

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-tertiary)] mb-4">
        Curator Report
      </div>

      {!hasIssues ? (
        <div className="flex items-center gap-2 text-[var(--color-success)]">
          <CheckCircle size={16} />
          <span className="text-[13px] font-semibold">Workspace is well maintained. No issues found.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Duplicates */}
          {report.potential_duplicates.length > 0 && (
            <Section title={`${report.potential_duplicates.length} Potential Duplicate${report.potential_duplicates.length > 1 ? "s" : ""}`} icon={<AlertTriangle size={14} className="text-[var(--color-warning)]" />}>
              {report.potential_duplicates.map((d, i) => (
                <div key={i} className="text-[12px] text-[var(--color-secondary)] py-1">
                  Similarity {Math.round(d.similarity * 100)}% — {d.reason}
                </div>
              ))}
            </Section>
          )}

          {/* Orphans */}
          {report.orphan_notes.length > 0 && (
            <Section title={`${report.orphan_notes.length} Orphan Note${report.orphan_notes.length > 1 ? "s" : ""}`} icon={<Trash2 size={14} className="text-[var(--color-error)]" />}>
              {report.orphan_notes.map((o, i) => (
                <div key={i} className="text-[12px] text-[var(--color-secondary)] py-1">
                  "{o.title}" — {o.suggestion}
                </div>
              ))}
            </Section>
          )}

          {/* Missing connections */}
          {report.missing_connections.length > 0 && (
            <Section title={`${report.missing_connections.length} Missing Connection${report.missing_connections.length > 1 ? "s" : ""}`} icon={<Link size={14} className="text-[var(--color-accent)]" />}>
              {report.missing_connections.map((m, i) => (
                <div key={i} className="text-[12px] text-[var(--color-secondary)] py-1">
                  {m.reason} (suggested: {m.suggested_type})
                </div>
              ))}
            </Section>
          )}

          {/* Actions needing confirmation */}
          {report.needs_confirmation.length > 0 && (
            <div className="pt-3 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-tertiary)] font-semibold mb-2">
                Suggested Actions
              </div>
              {report.needs_confirmation.map((action, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-[12px] text-[var(--color-secondary)]">{action.reason}</span>
                  <button
                    onClick={() => applyAction(action)}
                    disabled={applying === action.action_type}
                    className="text-[11px] text-[var(--color-accent)] border border-[rgba(99,102,241,0.25)] px-3 py-1 rounded-lg hover:bg-[rgba(99,102,241,0.1)] transition-colors disabled:opacity-50"
                  >
                    {applying === action.action_type ? "Applying..." : "Apply"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {report.auto_applied > 0 && (
        <div className="mt-4 text-[11px] text-[var(--color-success)]">
          ✓ Auto-applied {report.auto_applied} safe action{report.auto_applied > 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
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