import { Handle, Position } from "@xyflow/react"
import { FileText, Link, AlertTriangle, CheckSquare } from "lucide-react"

export default function NoteNode({ data, selected }: any) {
  const { note, highlighted } = data
  const isRecent = (Date.now() - new Date(note.created_at).getTime()) < 60 * 60 * 1000
  const isStale = (Date.now() - new Date(note.updated_at).getTime()) > 30 * 24 * 60 * 60 * 1000
  const isOrphan = !note.related_note_ids || note.related_note_ids.length === 0

  // Spec: border width = centrality score
  const borderWidth = Math.max(1, Math.min(3, (note.centrality || 0) * 6))

  return (
    <div
      className={`glass-surface-2 w-[280px] p-4 rounded-xl transition-all ${
        selected
          ? "border-[var(--color-accent)] shadow-[0_0_20px_rgba(99,102,241,0.2)]"
          : highlighted
          ? "border-[var(--color-warning)] shadow-[0_0_16px_rgba(245,158,11,0.2)]"
          : "border-[rgba(255,255,255,0.06)]"
      } ${isStale ? "opacity-50" : "opacity-100"} ${
        isRecent ? "shadow-[0_0_12px_rgba(99,102,241,0.15)]" : ""
      }`}
      style={{ borderWidth: `${borderWidth}px`, borderStyle: "solid" }}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-[var(--color-tertiary)] !border-none" />

      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={13} className="text-[var(--color-accent)] shrink-0" />
          <div className="font-semibold text-[12px] text-white truncate">
            {note.title || "Untitled"}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-[var(--color-secondary)] line-clamp-3 leading-relaxed pointer-events-none mb-2">
        {note.summary || note.raw_text}
      </div>

      {/* Tags */}
      {note.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {note.tags.slice(0, 3).map((t: string) => (
            <span key={t} className="text-[8px] bg-[rgba(99,102,241,0.08)] text-[var(--color-accent)] px-1 py-0.5 rounded font-semibold uppercase tracking-wider">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Visual cue icons */}
      <div className="flex items-center gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex gap-1.5 text-[var(--color-tertiary)]">
          {note.is_bridge && <div title="Bridge note"><Link size={11} className="text-[var(--color-accent)]" /></div>}
          {note.tasks?.length > 0 && <div title="Has tasks"><CheckSquare size={11} className="text-[var(--color-success)]" /></div>}
          {isOrphan && <div title="Orphan note"><AlertTriangle size={11} className="text-[var(--color-warning)]" /></div>}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[var(--color-tertiary)] !border-none" />
    </div>
  )
}