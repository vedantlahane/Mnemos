import { usePanel } from "@/hooks/usePanel"
import { EmptyState } from "@/components/shared/EmptyState"

export function GraphPanel() {
  const { graph } = usePanel()

  if (!graph?.nodes.length) {
    return <EmptyState icon="🌐" message="No connections yet" hint='Say "show graph" after capturing items' />
  }

  return (
    <div className="p-3 space-y-2">
      <p className="text-xs text-[var(--glass-text-muted)] px-2 mb-2">
        Knowledge Graph · {graph.nodes.length} nodes · {graph.edges.length} edges
      </p>
      {/* Simple list representation — d3-force graph can be added later */}
      <div className="space-y-1">
        {graph.nodes.map((node) => {
          const connections = graph.edges.filter(
            (e) => e.source === node.id || e.target === node.id,          )
          return (
            <div
              key={node.id}
              className="px-3 py-2 rounded-lg bg-[var(--glass-bg-thick)] border border-[var(--glass-border)]"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0" />
                <p className="text-sm text-white truncate flex-1">{node.title}</p>
                <span className="text-[10px] text-[var(--glass-text-muted)]">
                  {connections.length} link{connections.length !== 1 ? "s" : ""}
                </span>
              </div>
              {node.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 ml-4">
                  {node.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}