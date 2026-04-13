import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Note, StreamItem } from "../types"
import {
  FileText,
  ExternalLink,
  Tag,
  CheckSquare,
  Link,
  Clock,
  Loader2,
} from "lucide-react"
import { GlassBadge } from "../glass/GlassBadge"

export default function NoteDetailBlock({ item }: { item: StreamItem }) {
  const [note, setNote] = useState<Note | null>(
    (item.blockData as any)?.note || null
  )
  const [loading, setLoading] = useState(!note)

  useEffect(() => {
    if (note) return
    const noteId = item.metadata?.noteIds?.[0]
    if (!noteId) {
      setLoading(false)
      return
    }

    api
      .getNote(noteId)
      .then(setNote)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [note, item.metadata?.noteIds])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="animate-spin text-[var(--glass-text-muted)]"
          size={20}
        />
      </div>
    )
  }

  if (!note) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[var(--glass-text-dim)] text-[13px]">
        Note not found.
      </div>
    )
  }

  const statusColors: Record<string, "success" | "warning" | "info" | "error"> =
    {
      done: "success",
      pending: "warning",
      processing: "info",
      failed: "error",
    }

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <FileText size={18} className="text-[var(--accent)]" />
          <h3 className="text-[16px] font-bold text-white">
            {note.title || "Untitled"}
          </h3>
        </div>
        <GlassBadge variant={statusColors[note.processing_status] || "info"}>
          {note.processing_status}
        </GlassBadge>
      </div>

      {/* Summary */}
      {note.summary && (
        <div className="text-[13px] text-[var(--glass-text-dim)] leading-relaxed mb-4">
          {note.summary}
        </div>
      )}

      {/* Raw text */}
      <div className="glass-surface-2 p-4 rounded-xl mb-4">
        <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
          Original Text
        </div>
        <div className="text-[12px] text-[var(--glass-text)] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {note.raw_text}
        </div>
      </div>

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {note.tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 text-[10px] bg-[rgba(99,102,241,0.08)] text-[var(--accent)] px-2 py-1 rounded-full font-semibold"
            >
              <Tag size={9} /> {t}
            </span>
          ))}
        </div>
      )}

      {/* Tasks */}
      {note.tasks && note.tasks.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
            Tasks
          </div>
          {note.tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <CheckSquare
                size={13}
                className="text-[var(--green)] mt-0.5 shrink-0"
              />
              <span className="text-[12px] text-[var(--glass-text-dim)]">
                {task}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Entities */}
      {note.entities && note.entities.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
            Entities
          </div>
          <div className="flex flex-wrap gap-1.5">
            {note.entities.map((e) => (
              <span
                key={e}
                className="text-[10px] glass-surface-2 px-2 py-0.5 rounded text-[var(--glass-text-dim)]"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 pt-3 border-t border-[var(--glass-border)] text-[11px] text-[var(--glass-text-muted)]">
        <div className="flex items-center gap-1">
          <Clock size={11} />
          {new Date(note.created_at).toLocaleDateString()}
        </div>
        {note.source_url && (
          <a
            href={note.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            <ExternalLink size={11} />
            Source
          </a>
        )}
        {note.is_bridge && (
          <div className="flex items-center gap-1 text-[var(--accent)]">
            <Link size={11} />
            Bridge note
          </div>
        )}
      </div>
    </div>
  )
}