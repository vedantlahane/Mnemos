import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Note, StreamItem } from "../types"
import { FileText, Tag, Loader2 } from "lucide-react"

export default function NoteGridBlock({ item }: { item: StreamItem }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const resp = await api.listNotes(1, 20, item.metadata?.tag, item.metadata?.pageId)
        setNotes(resp.notes || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [item])

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[var(--color-muted)]" /></div>
  }

  if (notes.length === 0) {
    return <div className="text-center text-[12px] text-[var(--color-muted)] p-8 border border-dashed border-[rgba(255,255,255,0.06)] rounded-xl">No notes found.</div>
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {notes.map(note => (
        <div key={note.id} className="glass-elevated p-4 rounded-xl border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] cursor-pointer transition-all hover:-translate-y-1">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-[var(--color-accent-blue)]" />
              <div className="font-semibold text-[13px] text-white truncate max-w-[200px]">{note.title || "Untitled"}</div>
            </div>
          </div>
          <div className="text-[11px] text-[var(--color-secondary)] line-clamp-3 mb-3 leading-relaxed">
            {note.summary || note.raw_text}
          </div>
          <div className="flex flex-wrap gap-1">
             {note.tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-[9px] bg-slate-800/80 text-[var(--color-accent-blue)] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">
                   <Tag size={8} /> {t}
                </span>
             ))}
          </div>
        </div>
      ))}
    </div>
  )
}
