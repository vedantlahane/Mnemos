import { Icon } from "@/components/shared/Icon"
import type { StatsData } from "@/api/types"

interface Props {
  data: StatsData
}

const STATUS_COLORS: Record<string, string> = {
  ready: "var(--green)",
  processing: "var(--accent)",
  pending: "var(--amber)",
  error: "var(--red)",
}

export function StatsCard({ data }: Props) {
  const statusEntries = Object.entries(data.statuses).filter(([, v]) => v > 0)

  return (
    <div className="space-y-3 animate-scale-in">
      {/* Stat pills */}
      <div className="grid grid-cols-3 gap-2">
        <StatPill icon="note" label="Items" value={data.total_items} />
        <StatPill icon="boards" label="Boards" value={data.total_workspaces} />
        <StatPill icon="tags" label="Tags" value={data.total_tags} />
      </div>

      {/* Status bar */}
      {statusEntries.length > 0 && (
        <div className="glass-card rounded-2xl p-3 space-y-2.5">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-black/30">
            {statusEntries.map(([status, count]) => (
              <div
                key={status}
                className="h-full transition-all duration-500"
                style={{
                  width: `${(count / data.total_items) * 100}%`,
                  backgroundColor: STATUS_COLORS[status] ?? "var(--glass-text-muted)",
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span className="text-[11px] text-[var(--glass-text-dim)] capitalize">{status}</span>
                <span className="text-[11px] text-white font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({ icon, label, value }: { icon: "note" | "boards" | "tags"; label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl p-3 text-center">
      <Icon name={icon} size={14} className="text-[var(--accent-light)] mx-auto mb-1.5" />
      <p className="text-lg font-bold text-white leading-none">{value}</p>
      <p className="text-[9px] text-[var(--glass-text-muted)] uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}