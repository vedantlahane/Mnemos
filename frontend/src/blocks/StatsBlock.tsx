import { useEffect, useState } from "react"
import { api } from "../api/client"
import { BarChart2, Hash, CheckCircle, Layers, Loader2 } from "lucide-react"
import type { WorkspaceStats } from "../types"
import { motion } from "framer-motion"

export default function StatsBlock() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-[var(--glass-text-muted)]" size={20} />
      </div>
    )
  }

  if (!stats) return null

  const cards = [
    { label: "Notes", value: stats.total_notes, icon: BarChart2, color: "var(--accent)", bg: "rgba(99,102,241,0.1)" },
    { label: "Pages", value: stats.total_pages, icon: Layers, color: "var(--purple)", bg: "rgba(168,85,247,0.1)" },
    { label: "Tags", value: stats.total_tags, icon: Hash, color: "var(--green)", bg: "rgba(34,197,94,0.1)" },
    { label: "Tasks", value: stats.total_tasks, icon: CheckCircle, color: "var(--amber)", bg: "rgba(245,158,11,0.1)" },
  ]

  return (
    <div>
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-3">
        Workspace Stats
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="glass-surface-2 p-4 rounded-xl flex items-center gap-3"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: card.bg }}
            >
              <card.icon size={18} style={{ color: card.color }} />
            </div>
            <div>
              <div className="text-[11px] text-[var(--glass-text-muted)]">{card.label}</div>
              <div className="text-[20px] font-bold text-white">{card.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Status breakdown */}
      {stats.status_counts && Object.keys(stats.status_counts).length > 0 && (
        <div className="mt-4 glass-surface-1 p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
            Processing Status
          </div>
          <div className="flex gap-4">
            {Object.entries(stats.status_counts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    status === "done" ? "bg-[var(--green)]"
                    : status === "failed" ? "bg-[var(--red)]"
                    : "bg-[var(--amber)]"
                  }`}
                />
                <span className="text-[11px] text-[var(--glass-text-dim)]">
                  {status}: {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.last_capture && (
        <div className="mt-3 text-[11px] text-[var(--glass-text-muted)]">
          Last capture: {new Date(stats.last_capture).toLocaleString()}
        </div>
      )}
    </div>
  )
}