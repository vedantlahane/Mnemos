import { Icon } from "@/components/shared/Icon"
import type { GraphData } from "@/api/types"

interface Props {
  data: GraphData
  send: (msg: string) => void
}

export function GraphCard({ data, send }: Props) {
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
      {/* Summary */}
      <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="graph" size={14} className="text-[var(--accent-light)]" />
          <span className="text-xs text-[var(--glass-text-dim)]">Knowledge Graph</span>
        </div>
        <div className="flex gap-3">
          <span className="text-[11px] text-white font-medium">
            {data.nodes.length} <span className="text-[var(--glass-text-muted)] font-normal">nodes</span>
          </span>
          <span className="text-[11px] text-white font-medium">
            {data.edges.length} <span className="text-[var(--glass-text-muted)] font-normal">edges</span>
          </span>
        </div>
      </div>

      {/* Nodes */}
      <div className="space-y-1 stagger-children">
        {data.nodes.slice(0, 8).map((node) => {
          const conns = data.edges.filter(
            (e) => e.source === node.id || e.target === node.id,
          )
          return (
            <button
              key={node.id}
              onClick={() => send(`show item ${node.title}`)}
              className="glass-card w-full rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left cursor-pointer"
            >
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 animate-glow-pulse" />
              <p className="text-sm text-white truncate flex-1">{node.title}</p>
              <span className="text-[10px] text-[var(--glass-text-muted)] tabular-nums">
                {conns.length}
              </span>
              {node.tags.length > 0 && (
                <span className="text-[10px] text-[var(--accent-light)]/40">
                  #{node.tags[0]}
                </span>
              )}
            </button>
          )
        })}
        {data.nodes.length > 8 && (
          <button
            onClick={() => send("show full graph")}
            className="w-full text-[11px] text-[var(--accent-light)]/60 hover:text-[var(--accent-light)] text-center py-1.5 transition-colors cursor-pointer"
          >
            +{data.nodes.length - 8} more nodes
          </button>
        )}
      </div>
    </div>
  )
}