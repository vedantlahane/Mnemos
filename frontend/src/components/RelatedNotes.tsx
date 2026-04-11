import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "../api/client"
import type { Note } from "../types"

interface Props {
  noteIds: string[]
}

export default function RelatedNotes({ noteIds }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (noteIds.length === 0) {
      setLoading(false)
      return
    }

    async function fetchRelated() {
      const results: Note[] = []
      for (const id of noteIds.slice(0, 5)) {
        try {
          const note = await api.getNote(id)
          results.push(note)
        } catch {
          // Note may have been deleted
        }
      }
      setNotes(results)
      setLoading(false)
    }

    fetchRelated()
  }, [noteIds])

  if (loading) return <div className="text-xs text-slate-500">Loading related...</div>
  if (notes.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-400 mb-3">Related Notes</h3>
      <div className="space-y-2">
        {notes.map((note) => (
          <Link
            key={note.id}
            to={`/note/${note.id}`}
            className="block bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 hover:border-indigo-500/30 transition-colors"
          >
            <div className="text-sm font-medium text-slate-200">
              {note.title || "Untitled"}
            </div>
            {note.summary && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                {note.summary}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
