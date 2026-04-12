import { useEffect, useState } from "react"
import { api } from "../api/client"
import { BarChart2, Hash, CheckCircle, Clock } from "lucide-react"
import type { WorkspaceStats } from "../types"

export default function StatsBlock() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null)

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error)
  }, [])

  if (!stats) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
       <div className="glass-elevated p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgba(37,99,235,0.1)] flex items-center justify-center">
             <BarChart2 className="text-[var(--color-accent-blue)]" size={18} />
          </div>
          <div>
            <div className="text-[12px] text-[var(--color-muted)]">Notes</div>
            <div className="text-[18px] font-bold text-white">{stats.total_notes}</div>
          </div>
       </div>

       <div className="glass-elevated p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgba(168,85,247,0.1)] flex items-center justify-center">
             <Hash className="text-[var(--color-ai)]" size={18} />
          </div>
          <div>
            <div className="text-[12px] text-[var(--color-muted)]">Tags</div>
            <div className="text-[18px] font-bold text-white">{stats.total_tags}</div>
          </div>
       </div>

       <div className="glass-elevated p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgba(16,185,129,0.1)] flex items-center justify-center">
             <CheckCircle className="text-[var(--color-success)]" size={18} />
          </div>
          <div>
            <div className="text-[12px] text-[var(--color-muted)]">Tasks</div>
            <div className="text-[18px] font-bold text-white">{stats.total_tasks}</div>
          </div>
       </div>

       <div className="glass-elevated p-4 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgba(245,158,11,0.1)] flex items-center justify-center">
             <Clock className="text-[var(--color-warning)]" size={18} />
          </div>
          <div>
            <div className="text-[12px] text-[var(--color-muted)]">Pages</div>
            <div className="text-[18px] font-bold text-white">{stats.total_pages}</div>
          </div>
       </div>
    </div>
  )
}
