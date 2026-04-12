import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { Link2, AlertTriangle, CheckSquare } from "lucide-react"

export default memo(function NoteNode({ data, selected }: any) {
  const { note, highlighted } = data
  const isRecent = Date.now() - new Date(note.created_at).getTime() < 3600000
  const isStale = Date.now() - new Date(note.updated_at).getTime() > 30 * 86400000
  const isOrphan = !note.related_note_ids?.length

  // Left accent stripe
  let accent = "#e5e7eb"
  if (note.is_bridge) accent = "#6366f1"
  else if (isOrphan) accent = "#f59e0b"
  else if (isRecent) accent = "#22c55e"

  return (
    <div
      className={`group w-[240px] paper overflow-hidden transition-all ${
        selected ? "ring-2 ring-[var(--accent)]" : ""
      } ${highlighted ? "ring-2 ring-amber-400" : ""} ${isStale ? "opacity-45" : ""}`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-gray-300 !border-0 !-top-1" />

      <div className="p-3">
        {/* Title */}
        <h4 className="text-[12.5px] font-semibold text-gray-900 leading-tight mb-1 line-clamp-2">
          {note.title || "Untitled"}
        </h4>

        {/* Summary */}
        <p className="text-[10.5px] text-gray-500 leading-[1.5] line-clamp-3 mb-2">
          {note.summary || note.raw_text?.slice(0, 120)}
        </p>

        {/* Tags */}
        {note.tags?.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mb-2">
            {note.tags.slice(0, 3).map((t: string) => (
              <span key={t} className="text-[8px] font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-500 px-1.5 py-[1px] rounded">
                {t}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="text-[8px] text-gray-400">+{note.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100 text-gray-400">
          {note.is_bridge && <Link2 size={10} className="text-indigo-400" />}
          {note.tasks?.length > 0 && <CheckSquare size={10} className="text-emerald-400" />}
          {isOrphan && <AlertTriangle size={10} className="text-amber-400" />}
          <span className="ml-auto text-[8px] font-mono text-gray-300">
            {new Date(note.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-gray-300 !border-0 !-bottom-1" />
    </div>
  )
})