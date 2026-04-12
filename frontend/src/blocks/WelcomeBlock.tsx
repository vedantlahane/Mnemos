import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useAppContext } from "../hooks/useAppContext"
import type { Page, WorkspaceStats } from "../types"
import { FileText, Layers, Hash, Zap } from "lucide-react"
import { motion } from "framer-motion"

export default function WelcomeBlock() {
  const [pages, setPages] = useState<Page[]>([])
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const { switchTo } = useAppContext()

  useEffect(() => {
    Promise.all([
      api.listPages().then(r => setPages(r.pages || r || [])),
      api.getStats().then(setStats),
    ]).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col items-center pt-24 pb-8">
      <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-[36px] font-extrabold tracking-tight text-white mb-1">
        Mnemos
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-[14px] text-[var(--glass-text-dim)] mb-16">
        Your knowledge, connected.
      </motion.p>

      {/* Stats */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex gap-10 mb-16">
          {[
            { icon: FileText, v: stats.total_notes, l: "notes", c: "var(--accent)" },
            { icon: Layers, v: stats.total_pages, l: "pages", c: "var(--purple)" },
            { icon: Hash, v: stats.total_tags, l: "tags", c: "var(--green)" },
            { icon: Zap, v: stats.total_tasks, l: "tasks", c: "var(--amber)" },
          ].map(s => (
            <div key={s.l} className="flex flex-col items-center">
              <s.icon size={15} style={{ color: s.c }} className="mb-2" />
              <span className="text-[24px] font-bold text-white">{s.v}</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--glass-text-muted)] mt-0.5">{s.l}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Pages */}
      {pages.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full max-w-[480px]">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--glass-text-muted)] font-semibold mb-3">Pages</div>
          <div className="grid grid-cols-2 gap-2.5">
            {pages.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.03 }}
                onClick={() => switchTo("page", p.id, p.name)}
                className="glass rounded-xl p-3.5 text-left glass-hover flex items-center gap-3 relative"
              >
                <span className="text-lg">{p.icon || "📄"}</span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-[var(--glass-text-muted)]">{p.note_count} note{p.note_count !== 1 ? "s" : ""}</div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-[11px] text-[var(--glass-text-muted)] mt-14 text-center">
        Type a question below, or <span className="text-[var(--accent-light)] font-mono">/help</span> for commands
      </motion.p>
    </div>
  )
}