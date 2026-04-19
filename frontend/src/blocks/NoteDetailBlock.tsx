import { useAsyncData } from "../hooks/useAsyncData"
import { notes, pages } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import { useStream } from "../hooks/useStream"
import type { EnrichedNote, BlockItem, NoteDetailData, Page } from "../types"
import {
  FileText, ExternalLink, Tag, CheckSquare, Link,
  Clock, RefreshCw, ArrowRight, Trash2,
} from "lucide-react"
import { GlassBadge } from "../glass/GlassBadge"
import { useState } from "react"

export default function NoteDetailBlock({ item }: { item: BlockItem }) {
  const blockData = (item.blockData || {}) as NoteDetailData
  const noteId = item.metadata?.noteIds?.[0]
  const prefetched = blockData.note

  const { data, loading, error, refetch } = useAsyncData(
    async () => {
      if (prefetched) return prefetched
      if (!noteId) throw new Error("No note ID")
      return notes.get(noteId)
    },
    [noteId, prefetched?.id]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      emptyMessage="Note not found."
      loadingMessage="Loading noteâ€¦"
    >
      {(note) => <NoteDetailContent note={note} onRefetch={refetch} />}
    </AsyncBlock>
  )
}

function NoteDetailContent({ note, onRefetch }: { note: EnrichedNote; onRefetch: () => void }) {
  const { addSystemMessage, addBlock } = useStream()
  const [retrying, setRetrying] = useState(false)
  const [moving, setMoving] = useState(false)
  const [availablePages, setAvailablePages] = useState<Page[]>([])
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  const statusColors: Record<string, "success" | "warning" | "info" | "error"> = {
    done: "success",
    pending: "warning",
    processing: "info",
    failed: "error",
  }

  async function handleRetry() {
    setRetrying(true)
    try {

      addSystemMessage(`Retrying processing for "${note.title || "Untitled"}"â€¦`)
      setTimeout(onRefetch, 5000)
    } catch (err) {
      addSystemMessage(`Retry failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setRetrying(false)
    }
  }

  async function handleDelete() {
    try {
      await notes.delete(note.id)
      addSystemMessage(`Deleted: "${note.title || "Untitled"}"`)
    } catch {
      addSystemMessage("Failed to delete note.")
    }
  }

  async function handleShowMove() {
    setShowMoveMenu(!showMoveMenu)
    if (availablePages.length === 0) {
      try {
        const resp = await pages.list()
        setAvailablePages(resp.pages.filter((p) => p.id !== note.page_id))
      } catch { /* ignore */ }
    }
  }

  async function handleMove(targetPageId: string, pageName: string) {
    setMoving(true)
    try {
      await notes.move(note.id, targetPageId)
      addSystemMessage(`Moved "${note.title || "Untitled"}" â†’ ${pageName}`)
      setShowMoveMenu(false)
      onRefetch()
    } catch {
      addSystemMessage("Failed to move note.")
    } finally {
      setMoving(false)
    }
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
        <div className="flex items-center gap-2">
          <GlassBadge variant={statusColors[note.processing_status] || "info"}>
            {note.processing_status}
          </GlassBadge>
        </div>
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
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {note.tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 text-[10px] bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-1 rounded-full font-semibold"
            >
              <Tag size={9} /> {t}
            </span>
          ))}
        </div>
      )}

      {/* Tasks */}
      {note.tasks.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
            Tasks
          </div>
          {note.tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <CheckSquare size={13} className="text-[var(--green)] mt-0.5 shrink-0" />
              <span className="text-[12px] text-[var(--glass-text-dim)]">{task}</span>
            </div>
          ))}
        </div>
      )}

      {/* Entities */}
      {note.entities.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
            Entities
          </div>
          <div className="flex flex-wrap gap-1.5">
            {note.entities.map((e) => (
              <span
                key={e}
                className="text-[10px] glass-surface-3 px-2 py-0.5 rounded text-[var(--glass-text-dim)]"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related notes */}
      {(note.related_note_ids || []).length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--glass-text-muted)] font-semibold mb-2">
            Related Notes ({(note.related_note_ids || []).length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(note.related_note_ids || []).map((rid) => (
              <button
                key={rid}
                onClick={() => addBlock("note-detail", undefined, { noteIds: [rid] })}
                className="text-[10px] text-[var(--accent)] border border-[rgba(99,102,241,0.15)] px-2 py-0.5 rounded-full hover:bg-[var(--accent-subtle)] transition-colors"
              >
                {rid.slice(0, 8)}â€¦
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-[var(--glass-border)]">
        {(note.processing_status === "failed" || note.processing_status === "pending") && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1 text-[11px] text-[var(--amber)] border border-[rgba(245,158,11,0.2)] px-3 py-1 rounded-lg hover:bg-[var(--amber-subtle)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />
            {retrying ? "Retryingâ€¦" : "Retry Processing"}
          </button>
        )}

        <button
          onClick={handleShowMove}
          className="flex items-center gap-1 text-[11px] text-[var(--accent)] border border-[rgba(99,102,241,0.2)] px-3 py-1 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors"
        >
          <ArrowRight size={11} />
          Move
        </button>

        <button
          onClick={handleDelete}
          className="flex items-center gap-1 text-[11px] text-[var(--red)] border border-[rgba(239,68,68,0.2)] px-3 py-1 rounded-lg hover:bg-[var(--red-subtle)] transition-colors ml-auto"
        >
          <Trash2 size={11} />
          Delete
        </button>
      </div>

      {/* Move dropdown */}
      {showMoveMenu && (
        <div className="mt-2 glass-surface-2 rounded-xl p-2 max-h-[160px] overflow-y-auto">
          {availablePages.length === 0 ? (
            <div className="text-[11px] text-[var(--glass-text-muted)] p-2">No other pages.</div>
          ) : (
            availablePages.map((p) => (
              <button
                key={p.id}
                onClick={() => handleMove(p.id, p.name)}
                disabled={moving}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-[var(--glass-text-dim)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <span>{p.icon || "ðŸ“„"}</span>
                <span>{p.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 pt-3 text-[11px] text-[var(--glass-text-muted)]">
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
        {(note.centrality || 0) > 0 && (
          <div className="text-[var(--glass-text-muted)]">
            Centrality: {((note.centrality || 0) * 100).toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  )
}