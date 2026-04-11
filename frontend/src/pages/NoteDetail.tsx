import { useEffect, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { api } from "../api/client"
import type { Note } from "../types"
import StatusBadge from "../components/StatusBadge"
import TaskList from "../components/TaskList"
import RelatedNotes from "../components/RelatedNotes"
import ErrorState from "../components/ErrorState"

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editTags, setEditTags] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .getNote(id)
      .then((data) => {
        setNote(data)
        setEditTitle(data.title || "")
        setEditTags((data.tags || []).join(", "))
      })
      .catch(() => setError("Note not found"))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    if (!id) return
    const tags = editTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    await api.updateNote(id, { title: editTitle, tags })
    const updated = await api.getNote(id)
    setNote(updated)
    setEditing(false)
  }

  async function handleDelete() {
    if (!id || !confirm("Delete this note permanently?")) return
    setDeleting(true)
    await api.deleteNote(id)
    navigate("/")
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-800 rounded w-1/2" />
          <div className="h-4 bg-slate-800 rounded w-full" />
          <div className="h-4 bg-slate-800 rounded w-3/4" />
          <div className="h-32 bg-slate-800 rounded w-full" />
        </div>
      </div>
    )
  }

  if (error || !note) {
    return <ErrorState message={error || "Note not found"} onRetry={() => navigate("/")} />
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back Link */}
      <Link
        to="/"
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-block"
      >
        ← Back to notes
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-2xl font-bold bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          ) : (
            <h1 className="text-2xl font-bold text-slate-100">
              {note.title || "Untitled"}
            </h1>
          )}
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={note.processing_status} />
            <span className="text-xs text-slate-500">
              {new Date(note.created_at).toLocaleString()}
            </span>
            <span className="text-xs text-slate-600">•</span>
            <span className="text-xs text-slate-500">{note.capture_type}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Retry button for failed notes */}
          {note.processing_status === "failed" && (
            <button
              onClick={async () => {
                await fetch(
                  `${import.meta.env.VITE_API_URL}/notes/${note.id}/retry`,
                  { method: "POST" }
                )
                // Refresh the note
                const updated = await api.getNote(note.id)
                setNote(updated)
              }}
              className="px-3 py-1.5 text-sm bg-amber-900/30 text-amber-400 rounded-lg hover:bg-amber-900/50 transition-colors"
            >
              🔄 Retry Processing
            </button>
          )}
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-sm bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-sm bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition-colors"
              >
                ✏️ Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-sm bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors"
              >
                🗑️ Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Source */}
      {note.source_url && (
        <div className="mb-6 p-3 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-xs text-slate-500">Source: </span>
          <a
            href={note.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:underline break-all"
          >
            {note.page_title || note.source_url}
          </a>
        </div>
      )}

      {/* Summary */}
      {note.summary && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Summary</h2>
          <p className="text-sm text-slate-300 leading-relaxed">{note.summary}</p>
        </div>
      )}

      {/* Tags */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Tags</h2>
        {editing ? (
          <input
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="tag1, tag2, tag3"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {note.tags && note.tags.length > 0 ? (
              note.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/?tag=${tag}`}
                  className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                >
                  #{tag}
                </Link>
              ))
            ) : (
              <span className="text-xs text-slate-600">No tags</span>
            )}
          </div>
        )}
      </div>

      {/* Entities */}
      {note.entities && note.entities.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Entities</h2>
          <div className="flex flex-wrap gap-2">
            {note.entities.map((entity, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
              >
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {note.tasks && note.tasks.length > 0 && (
        <div className="mb-6">
          <TaskList tasks={note.tasks} />
        </div>
      )}

      {/* Raw Text */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">
          Original Text
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
          {note.raw_text}
        </div>
      </div>

      {/* Related Notes */}
      {note.related_note_ids && note.related_note_ids.length > 0 && (
        <div className="mb-6">
          <RelatedNotes noteIds={note.related_note_ids} />
        </div>
      )}
    </div>
  )
}
