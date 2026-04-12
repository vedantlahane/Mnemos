import { Handle, Position } from "@xyflow/react"
import { FileText, Link, AlertTriangle, CheckSquare } from "lucide-react"

export default function NoteNode({ data, selected }: any) {
  const { note } = data
  const isStale = (Date.now() - new Date(note.updated_at).getTime()) > 30 * 24 * 60 * 60 * 1000

  return (
    <div className={`glass-elevated w-[280px] p-4 rounded-xl border transition-colors ${
       selected ? "border-[var(--color-accent-cyan)] shadow-[0_0_20px_rgba(6,182,212,0.15)]" : "border-[rgba(255,255,255,0.06)]"
    } ${isStale ? "opacity-60" : "opacity-100"}`}>
       
       <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-[var(--color-muted)] !border-none" />
       
       <div className="flex items-start justify-between mb-2">
         <div className="flex items-center gap-2">
            <FileText size={14} className="text-[var(--color-accent-blue)]" />
            <div className="font-semibold text-[13px] text-white truncate max-w-[200px]">{note.title || "Untitled"}</div>
         </div>
       </div>
       
       <div className="text-[11px] text-[var(--color-secondary)] line-clamp-3 mb-3 leading-relaxed pointer-events-none">
         {note.summary || note.raw_text}
       </div>
       
       <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex gap-1.5 text-[var(--color-muted)]">
             {note.is_bridge && <Link size={12} className="text-[var(--color-accent-cyan)]" />}
             {note.tasks?.length > 0 && <CheckSquare size={12} className="text-[var(--color-success)]" />}
             {(!note.related_note_ids || note.related_note_ids.length === 0) && <AlertTriangle size={12} className="text-[var(--color-warning)]" />}
          </div>
       </div>

       <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[var(--color-muted)] !border-none" />
    </div>
  )
}
