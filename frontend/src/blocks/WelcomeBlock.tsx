import { useAsyncData } from "../hooks/useAsyncData"
import { api, workspace } from "../api/client"
import { useAppContext } from "../hooks/useAppContext"
import type { BlockItem, Page, WorkspaceStats } from "../types"
import { FileText, Layers, Hash, Zap, AlertCircle, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"

interface OverviewData {
  stats: WorkspaceStats | null
  pages: Page[]
  recentNotes: Array<{
    id: string
    title: string | null
    summary: string | null
    raw_text: string
    processing_status: string
  }>
}

export default function WelcomeBlock(_props: { item: BlockItem }) {
  const { switchTo } = useAppContext()

  const { data, error } = useAsyncData<OverviewData>(
    async () => {
      // Try the single overview endpoint first
      try {
        const overview = await workspace.overview()
        return {
          stats: overview.stats ?? null,
          pages: (overview.pages || []).map((p) => ({
            id: p.id,
            user_id: null,
            name: p.name,
            description: null,
            icon: p.icon,
            color: p.color,
            layout_mode: p.layout_mode,
            is_archived: p.is_archived,
            created_at: p.updated_at,
            updated_at: p.updated_at,
            note_count: p.note_count,
          })),
          recentNotes: (overview.recent_notes || []).map((n) => ({
            id: n.id,
            title: n.title,
            summary: n.summary,
            raw_text: n.raw_text,
            processing_status: n.processing_status,
          })),
        }
      } catch {
        // Fallback: make individual calls if /workspace/overview doesn't exist
        const [pagesResp, stats, notesResp] = await Promise.allSettled([
          api.listPages(),
          api.getStats(),
          api.listNotes(1, 5),
        ])

        return {
          stats: stats.status === "fulfilled" ? stats.value : null,
          pages: pagesResp.status === "fulfilled" ? pagesResp.value.pages : [],
          recentNotes:
            notesResp.status === "fulfilled"
              ? notesResp.value.notes.map((n) => ({
                  id: n.id,
                  title: n.title,
                  summary: n.summary,
                  raw_text: n.raw_text,
                  processing_status: n.processing_status,
                }))
              : [],
        }
      }
    },
    []
  )

  const stats = data?.stats ?? null
  const pages = data?.pages ?? []
  const recentNotes = data?.recentNotes ?? []

  return (
    <div className="flex flex-col items-center pt-24 pb-8">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[36px] font-extrabold tracking-tight text-white mb-1"
      >
        Mnemos
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-[14px] text-[var(--glass-text-dim)] mb-16"
      >
        Your knowledge, connected.
      </motion.p>

      {error && (
        <div className="flex items-center gap-2 text-[var(--amber)] text-[12px] mb-8">
          <AlertCircle size={14} />
          <span>Backend unreachable â€” some features may not work</span>
        </div>
      )}

      {stats && <StatsRow stats={stats} />}

      {/* Pages */}
      {pages.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-[480px]"
        >
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--glass-text-muted)] font-semibold mb-3">
            Pages
          </div>
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
                <span className="text-lg">{p.icon || "ðŸ“„"}</span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white truncate">
                    {p.name}
                  </div>

                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent Notes */}
      {recentNotes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-[480px] mt-8"
        >
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--glass-text-muted)] font-semibold mb-3">
            Recent Notes
          </div>
          <div className="flex flex-col gap-2">
            {recentNotes.slice(0, 5).map((note, i) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.04 }}
                className="glass-surface-2 px-4 py-3 rounded-xl flex items-center gap-3"
              >
                <FileText size={13} className="text-[var(--accent)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-white truncate">
                    {note.title || "Untitled"}
                  </div>
                  <div className="text-[10px] text-[var(--glass-text-muted)] truncate">
                    {note.summary || note.raw_text?.slice(0, 80)}
                  </div>
                </div>
                {note.processing_status === "failed" && (
                  <AlertCircle size={12} className="text-[var(--red)] shrink-0" />
                )}
                {note.processing_status === "processing" && (
                  <RefreshCw size={12} className="text-[var(--amber)] animate-spin shrink-0" />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-[11px] text-[var(--glass-text-muted)] mt-14 text-center"
      >
        Type a question below, or{" "}
        <span className="text-[var(--accent-light)] font-mono">/help</span> for commands
      </motion.p>
    </div>
  )
}

function StatsRow({ stats }: { stats: WorkspaceStats }) {
  const items = [
    { icon: FileText, v: stats.total_notes, l: "notes", c: "var(--accent)" },
    { icon: Layers, v: stats.total_pages, l: "pages", c: "var(--purple)" },
    { icon: Hash, v: stats.total_tags, l: "tags", c: "var(--green)" },
    { icon: Zap, v: stats.total_tasks, l: "tasks", c: "var(--amber)" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="flex gap-10 mb-16"
    >
      {items.map((s) => (
        <div key={s.l} className="flex flex-col items-center">
          <s.icon size={15} style={{ color: s.c }} className="mb-2" />
          <span className="text-[24px] font-bold text-white">{s.v}</span>
          <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--glass-text-muted)] mt-0.5">
            {s.l}
          </span>
        </div>
      ))}
    </motion.div>
  )
}