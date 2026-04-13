import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Page } from "../types"
import { useAppContext } from "../hooks/useAppContext"
import { Loader2, Trash2 } from "lucide-react"
import { motion } from "framer-motion"
import { useStream } from "../hooks/useStream"

export default function PageListBlock() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const { switchTo } = useAppContext()
  const { addSystemMessage } = useStream()

  useEffect(() => {
    api.listPages()
      .then((res) => setPages(res.pages || res || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(e: React.MouseEvent, page: Page) {
    e.stopPropagation()
    if (page.name === "Uncategorized") return
    try {
      await api.deletePage(page.id)
      setPages((prev) => prev.filter((p) => p.id !== page.id))
      addSystemMessage(`Deleted page: ${page.name}. Notes moved to Uncategorized.`)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-[var(--glass-text-muted)]" size={20} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)]">
          All Pages
          <span className="ml-2 text-[var(--glass-text-dim)]">({pages.length})</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {pages.map((page, i) => (
          <motion.div
            key={page.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => switchTo("page", page.id, page.name)}
            className="glass-surface-3 p-4 rounded-xl glass-hover cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-xl shrink-0">{page.icon || "📄"}</div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white truncate">{page.name}</div>
                <div className="text-[11px] text-[var(--glass-text-muted)]">
                  {page.note_count} note{page.note_count !== 1 ? "s" : ""}
                  {page.description && (
                    <span className="ml-1 hidden sm:inline">• {page.description.slice(0, 40)}</span>
                  )}
                </div>
              </div>
            </div>

            {page.name !== "Uncategorized" && (
              <button
                onClick={(e) => handleDelete(e, page)}
                className="text-[var(--glass-text-muted)] hover:text-[var(--red)] transition-colors opacity-0 group-hover:opacity-100 p-1"
              >
                <Trash2 size={13} />
              </button>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}