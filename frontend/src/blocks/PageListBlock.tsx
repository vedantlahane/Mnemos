import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useAppContext } from "../hooks/useAppContext"
import type { Page } from "../types"
import { Layers, Loader2, Trash2 } from "lucide-react"
import { motion } from "framer-motion"

export default function PageListBlock() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const { switchTo } = useAppContext()

  useEffect(() => {
    api.listPages()
      .then((res) => setPages(res.pages || res || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string, name: string) {
    if (name === "Uncategorized") return
    try {
      await api.deletePage(id)
      setPages((prev) => prev.filter((p) => p.id !== id))
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

  if (pages.length === 0) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[13px] text-[var(--glass-text-dim)]">
        No pages found. Use <code className="font-mono text-[var(--accent)]">/page create &lt;name&gt;</code> to create one.
      </div>
    )
  }

  return (
    <div>
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-3">
        Pages
        <span className="ml-2 text-[var(--glass-text-dim)]">({pages.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {pages.map((page, i) => (
          <motion.div
            key={page.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass-surface-2 p-4 rounded-xl glass-hover cursor-pointer relative group"
            onClick={() => switchTo("page", page.id, page.name)}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-lg">{page.icon || "📄"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[13px] text-white truncate">
                  {page.name}
                </div>
                <div className="text-[10px] text-[var(--glass-text-muted)]">
                  {page.note_count || 0} note{(page.note_count || 0) !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            {page.description && (
              <div className="text-[11px] text-[var(--glass-text-dim)] line-clamp-2">
                {page.description}
              </div>
            )}
            {page.name !== "Uncategorized" && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(page.id, page.name)
                }}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--glass-text-muted)] hover:text-[var(--red)] p-1"
              >
                <Trash2 size={12} />
              </button>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}