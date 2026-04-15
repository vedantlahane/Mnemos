import { useAsyncData } from "../hooks/useAsyncData"
import { api, notes } from "../api/client"
import { useStream } from "../hooks/useStream"
import { AsyncBlock } from "../components/AsyncBlock"
import type { Note, BlockItem, NoteGridData } from "../types"
import { FileText, Tag } from "lucide-react"
import { motion } from "framer-motion"

export default function NoteGridBlock({ item }: { item: BlockItem }) {
  const blockData = (item.blockData || {}) as NoteGridData
  const tag = item.metadata?.tag
  const pageId = item.metadata?.pageId
  const limit = blockData.limit || 20
  const { addBlock } = useStream()

  const { data, loading, error } = useAsyncData(
    () => notes.list(1, limit, tag, pageId).then((r) => r.notes),
    [tag, pageId, limit]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      empty={data?.length === 0}
      emptyMessage={
        tag ? `No notes with tag #${tag}` : "No notes found."
      }
      loadingMessage="Loading notesâ€¦"
    >
      {(notes) => (
        <div>
          <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-3">
            {tag ? `#${tag}` : "All Notes"}
            <span className="ml-2 text-[var(--glass-text-dim)]">
              ({notes.length})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {notes.map((note, i) => (
              <NoteCard
                key={note.id}
                note={note}
                index={i}
                onClick={() =>
                  addBlock("note-detail", { note }, { noteIds: [note.id] })
                }
              />
            ))}
          </div>
        </div>
      )}
    </AsyncBlock>
  )
}

function NoteCard({
  note,
  index,
  onClick,
}: {
  note: Note
  index: number
  onClick: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      className="glass-surface-2 p-4 rounded-xl glass-hover cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-2">
        <FileText size={13} className="text-[var(--accent)] shrink-0" />
        <div className="font-semibold text-[13px] text-white truncate">
          {note.title || "Untitled"}
        </div>
      </div>
      <div className="text-[11px] text-[var(--glass-text-dim)] line-clamp-3 leading-relaxed mb-3">
        {note.summary || note.raw_text}
      </div>
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 text-[9px] bg-[var(--accent-subtle)] text-[var(--accent)] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
            >
              <Tag size={7} /> {t}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className="text-[9px] text-[var(--glass-text-muted)]">
              +{note.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}