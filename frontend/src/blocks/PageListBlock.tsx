import { useAsyncData } from "../hooks/useAsyncData"
import { pages } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import { useAppContext } from "../hooks/useAppContext"
import type { Page, BlockItem } from "../types"
import { Trash2 } from "lucide-react"
import { motion } from "framer-motion"
import { useState } from "react"

export default function PageListBlock(_props: { item: BlockItem }) {
  const { switchTo } = useAppContext()
  const { data, loading, error, refetch } = useAsyncData(
    () => pages.list().then((r) => r.pages),
    []
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      empty={data?.length === 0}
      emptyMessage="No pages. Use /page create <name> to create one."
      loadingMessage="Loading pagesâ€¦"
    >
      {(pageList) => (
        <div>
          <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-3">
            Pages
            <span className="ml-2 text-[var(--glass-text-dim)]">
              ({pageList.length})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {pageList.map((page, i) => (
              <PageCard
                key={page.id}
                page={page}
                index={i}
                onOpen={() => switchTo("page", page.id, page.name)}
                onDelete={async () => {
                  await pages.delete(page.id)
                  refetch()
                }}
              />
            ))}
          </div>
        </div>
      )}
    </AsyncBlock>
  )
}

function PageCard({
  page,
  index,
  onOpen,
  onDelete,
}: {
  page: Page
  index: number
  onOpen: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass-surface-2 p-4 rounded-xl glass-hover cursor-pointer relative group"
      onClick={onOpen}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-lg">{page.icon || "ðŸ“„"}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[13px] text-white truncate">
            {page.name}
          </div>
          <div className="text-[10px] text-[var(--glass-text-muted)]">
            {page.note_count || 0} note
            {(page.note_count || 0) !== 1 ? "s" : ""}
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
            if (confirming) {
              onDelete()
            } else {
              setConfirming(true)
              setTimeout(() => setConfirming(false), 3000)
            }
          }}
          className={`absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all p-1 rounded ${
            confirming
              ? "opacity-100 text-[var(--red)]"
              : "text-[var(--glass-text-muted)] hover:text-[var(--red)]"
          }`}
          title={confirming ? "Click again to confirm" : "Delete page"}
        >
          <Trash2 size={12} />
        </button>
      )}
    </motion.div>
  )
}