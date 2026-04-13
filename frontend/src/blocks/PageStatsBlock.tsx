import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import type { BlockItem, PageStats, TagWithCount } from "../types"
import { BarChart2, Link, Layers, Tag, StickyNote } from "lucide-react"
import { motion } from "framer-motion"

export default function PageStatsBlock({ item }: { item: BlockItem }) {
  const pageId = item.metadata?.pageId

  const { data, loading, error } = useAsyncData(
    async (): Promise<PageStats | null> => {
      if (!pageId) return null
      return api.getPageStats(pageId)
    },
    [pageId]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      loadingMessage="Loading page stats…"
    >
      {(stats) => <PageStatsContent stats={stats} />}
    </AsyncBlock>
  )
}

function PageStatsContent({ stats }: { stats: PageStats }) {
  const cards = [
    { label: "Notes", value: stats.note_count, icon: BarChart2, color: "var(--accent)" },
    { label: "Edges", value: stats.edge_count, icon: Link, color: "var(--purple)" },
    { label: "Clusters", value: stats.cluster_count, icon: Layers, color: "var(--green)" },
    { label: "Elements", value: stats.element_count, icon: StickyNote, color: "var(--amber)" },
  ]

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-3">
        Page Statistics
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="glass-surface-2 p-3 rounded-xl text-center"
          >
            <c.icon size={16} style={{ color: c.color }} className="mx-auto mb-1" />
            <div className="text-[18px] font-bold text-white">{c.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--glass-text-muted)]">
              {c.label}
            </div>
          </motion.div>
        ))}
      </div>

      {stats.tags.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Tag size={12} className="text-[var(--accent)]" />
            <span className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold">
              Top Tags
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.tags.map((t: TagWithCount) => (
              <span
                key={t.name}
                className="text-[10px] bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 rounded-full font-semibold"
              >
                #{t.name} ({t.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}