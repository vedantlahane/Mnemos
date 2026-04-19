import { Icon } from "@/components/shared/Icon"
import type { GraphData } from "@/api/types"

interface Props {
  data: GraphData
}

export function GraphCard({ data }: Props) {
  if (!data.nodes.length) {
    return (
      <div className="glass-card rounded-2xl p-4 text-center">
        <Icon name="graph" size={18} className="text-[var(--glass-text-muted)] mx-auto mb-2" />
        <p className="text-xs text-[var(--glass-text-dim)]">No connections yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 animate-scale-in">
      {/* Summary bar */}
      <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="graph" size={14} className="text-[var(--accent-light)]" />
          <span className="text-xs text-[var(--glass-text-dim)]">Knowledge Graph</span>
        </div>
        <div className="flex gap-3">
          <span className="text-[11px] text-white font-medium">{data.nodes.length} <span className="text-[var(--glass-text-muted)] font-normal">nodes</span></span>
          <span className="text-[11px] text-white font-medium">{data.edges.length} <span className="text-[var(--glass-text-muted)] font-normal">edges</span></span>
        </div>
      </div>

      {/* Node list */}
      <div className="space-y-1 stagger-children">
        {data.nodes.slice(0, 8).map((node) => {
          const connections = data.edges.filter(
            (e) => e.source === node.id || e.target === node.id,
          )
          return (
            <div key={node.id} className="glass-card rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 animate-glow-pulse" />
              <p className="text-sm text-white truncate flex-1">{node.title}</p>
              <span className="text-[10px] text-[var(--glass-text-muted)] tabular-nums">
                {connections.length}
              </span>
              {node.tags.length > 0 && (
                <span className="text-[10px] text-[var(--accent-light)]/50">
                  #{node.tags[0]}
                </span>
              )}
            </div>
          )
        })}
        {data.nodes.length > 8 && (
          <p className="text-[11px] text-[var(--glass-text-muted)] text-center py-1">
            +{data.nodes.length - 8} more nodes
          </p>
        )}
      </div>
    </div>
  )
}