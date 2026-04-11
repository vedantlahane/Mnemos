import { Link } from "react-router-dom"
import type { Note } from "../types"
import StatusBadge from "./StatusBadge"

interface Props {
  note: Note
}

export default function NoteCard({ note }: Props) {
  return (
    <Link
      to={`/note/${note.id}`}
      className="block bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-100 line-clamp-1 group-hover:text-indigo-300 transition-colors">
          {note.title || "Untitled"}
        </h3>
        <StatusBadge status={note.processing_status} />
      </div>

      {/* Summary */}
      {note.summary && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-3">
          {note.summary}
        </p>
      )}

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {note.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
            >
              #{tag}
            </span>
          ))}
          {note.tags.length > 4 && (
            <span className="text-[11px] text-slate-500">
              +{note.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/50">
        <span className="text-[11px] text-slate-500">
          {new Date(note.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {note.tasks && note.tasks.length > 0 && (
          <span className="text-[11px] text-amber-400">
            ✓ {note.tasks.length} task{note.tasks.length > 1 ? "s" : ""}
          </span>
        )}
        {note.similarity !== undefined && (
          <span className="text-[11px] text-emerald-400 font-medium">
            {Math.round(note.similarity * 100)}% match
          </span>
        )}
      </div>
    </Link>
  )
}
