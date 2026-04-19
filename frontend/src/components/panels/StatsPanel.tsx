import { usePanel } from "@/hooks/usePanel"
import { EmptyState } from "@/components/shared/EmptyState"

export function StatsPanel() {
  const { stats } = usePanel()

  if (!stats) {
    return <EmptyState icon="📊" message="No statistics" hint='Say "show stats"' />
  }

  const statusEntries = Object.entries(stats.statuses).filter(([, v]) => v > 0)

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-[var(--glass-text-muted)] uppercase tracking-wider">Dashboard</p>

      {/* Top-level stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Items" value={stats.total_items} />
        <StatCard label="Boards" value={stats.total_workspaces} />
        <StatCard label="Tags" value={stats.total_tags} />
      </div>

      {/* Status breakdown */}
      {statusEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--glass-text-muted)]">By status</p>
          <div className="space-y-1.5">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <StatusDot status={status} />
                <span className="text-xs text-[var(--glass-text-dim)] flex-1 capitalize">{status}</span>
                <span className="text-xs text-white font-medium">{count}</span>
              </div>
            ))}
          </div>

          {/* Visual bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-[var(--glass-bg-thick)]">
            {statusEntries.map(([status, count]) => (
              <div
                key={status}
                className="h-full transition-all"
                style={{
                  width: `${(count / stats.total_items) * 100}%`,
                  backgroundColor: STATUS_COLORS[status] ?? "var(--glass-text-muted)",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  ready: "var(--green)",
  processing: "var(--accent)",
  pending: "var(--amber)",
  error: "var(--red)",
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg p-3 bg-[var(--glass-bg-thick)] border border-[var(--glass-border)] text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-[var(--glass-text-muted)] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: STATUS_COLORS[status] ?? "var(--glass-text-muted)" }}
    />
  )
}