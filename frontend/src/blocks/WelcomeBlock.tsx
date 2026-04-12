import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useAppContext } from "../hooks/useAppContext"
import { useStream } from "../hooks/useStream"
import type { Page, WorkspaceStats } from "../types"
import { BarChart2, FileText, Hash, Zap } from "lucide-react"
import { motion } from "framer-motion"

export default function WelcomeBlock() {
  const [pages, setPages] = useState<Page[]>([])
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const { switchTo } = useAppContext()
  const { addBlock } = useStream()

  useEffect(() => {
    Promise.all([
      api.listPages().then((r) => setPages(r.pages || r || [])),
      api.getStats().then(setStats),
    ]).catch(console.error)
  }, [])

  return (
    <div className="flex flex-col items-center pt-12 pb-4">
      {/* Header */}
      <div className="text-[28px] font-bold tracking-tight text-white mb-1">
        Mnemos
      </div>
      <div className="text-[14px] text-[var(--color-secondary)] mb-10">
        Your personal knowledge workspace
      </div>

      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 w-full mb-8">
          {[
            { label: "Notes", value: stats.total_notes, icon: FileText, color: "var(--color-accent)" },
            { label: "Pages", value: stats.total_pages, icon: BarChart2, color: "var(--color-accent-purple)" },
            { label: "Tags", value: stats.total_tags, icon: Hash, color: "var(--color-success)" },
            { label: "Tasks", value: stats.total_tasks, icon: Zap, color: "var(--color-warning)" },
          ].map((s) => (
            <div key={s.label} className="glass-surface-1 p-3 rounded-xl text-center">
              <s.icon size={16} className="mx-auto mb-1.5" style={{ color: s.color }} />
              <div className="text-[18px] font-bold text-white">{s.value}</div>
              <div className="text-[10px] text-[var(--color-tertiary)] uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Page cards */}
      {pages.length > 0 && (
        <>
          <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-tertiary)] mb-3 self-start">
            Your Pages
          </div>
          <div className="grid grid-cols-2 gap-3 w-full">
            {pages.slice(0, 6).map((page, i) => (
              <motion.div
                key={page.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => switchTo("page", page.id, page.name)}
                className="glass-surface-2 p-4 rounded-xl glass-hover cursor-pointer flex items-center gap-3"
              >
                <div className="text-xl">{page.icon || "📄"}</div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate">{page.name}</div>
                  <div className="text-[11px] text-[var(--color-tertiary)]">
                    {page.note_count} note{page.note_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Hint */}
      <div className="mt-10 text-[12px] text-[var(--color-tertiary)] text-center leading-relaxed">
        Type a question to search your knowledge, or use{" "}
        <button
          onClick={() => addBlock("help")}
          className="text-[var(--color-accent)] hover:underline font-mono"
        >
          /help
        </button>{" "}
        to see all commands.
      </div>
    </div>
  )
}