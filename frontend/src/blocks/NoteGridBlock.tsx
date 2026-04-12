import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useStream } from "../hooks/useStream"
import type { Note, StreamItem } from "../types"
import { FileText, Tag, Loader2 } from "lucide-react"
import { motion } from "framer-motion"

export default function NoteGridBlock({ item }: { item: StreamItem }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const { addBlock } = useStream()

  useEffect(() => {
    async function load() {
      try {
        const limit = (item.blockData as any)?.limit || 20
        const resp = await api.listNotes(1, limit, item.metadata?.tag, item.metadata?.pageId)
        setNotes(resp.notes || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [item.metadata?.tag, item.metadata?.pageId, item.blockData])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-[var(--color-tertiary)]" size={20} />
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="text-center text-[12px] text-[var(--color-tertiary)] py-12 glass-surface-1 rounded-xl">
        {item.metadata?.tag
          ? `No notes found with tag #${item.metadata.tag}`
          : "No notes found."}
      </div>
    )
  }

  function handleNoteClick(note: Note) {
    addBlock("note-detail", { note }, { noteIds: [note.id] })
  }

  return (
    <div>
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-tertiary)] mb-3">
        {item.metadata?.tag ? `Notes tagged #${item.metadata.tag}` : "All Notes"}
        <span className="ml-2 text-[var(--color-secondary)]">({notes.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {notes.map((note, i) => (
          <motion.div
            key={note.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => handleNoteClick(note)}
            className="glass-surface-2 p-4 rounded-xl glass-hover cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText size={13} className="text-[var(--color-accent)] shrink-0" />
              <div className="font-semibold text-[13px] text-white truncate">
                {note.title || "Untitled"}
              </div>
            </div>
            <div className="text-[11px] text-[var(--color-secondary)] line-clamp-3 leading-relaxed mb-3">
              {note.summary || note.raw_text}
            </div>
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {note.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-[9px] bg-[rgba(99,102,241,0.08)] text-[var(--color-accent)] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
                  >
                    <Tag size={7} /> {t}
                  </span>
                ))}
                {note.tags.length > 3 && (
                  <span className="text-[9px] text-[var(--color-tertiary)]">
                    +{note.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}