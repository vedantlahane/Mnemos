import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Note, StreamItem } from "../types"
import { CheckSquare, FileText, Loader2 } from "lucide-react"

interface TaskGroup {
  noteId: string
  noteTitle: string
  tasks: string[]
}

export default function TaskListBlock({ item }: { item: StreamItem }) {
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const resp = await api.listNotes(1, 100, undefined, item.metadata?.pageId)
        const notes: Note[] = resp.notes || []
        const withTasks = notes
          .filter((n) => n.tasks && n.tasks.length > 0)
          .map((n) => ({
            noteId: n.id,
            noteTitle: n.title || "Untitled",
            tasks: n.tasks,
          }))
        setGroups(withTasks)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [item.metadata?.pageId])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-[var(--glass-text-muted)]" size={20} />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[13px] text-[var(--glass-text-dim)]">
        No tasks found. Tasks are automatically extracted when you capture notes.
      </div>
    )
  }

  const totalTasks = groups.reduce((sum, g) => sum + g.tasks.length, 0)

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)]">
          Tasks
        </div>
        <span className="text-[11px] text-[var(--glass-text-dim)]">
          {totalTasks} task{totalTasks !== 1 ? "s" : ""} from {groups.length} note{groups.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.noteId}>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={12} className="text-[var(--accent)]" />
              <span className="text-[12px] font-semibold text-white">{group.noteTitle}</span>
            </div>
            {group.tasks.map((task, i) => (
              <div key={i} className="flex items-start gap-2.5 py-1.5 pl-5">
                <CheckSquare size={13} className="text-[var(--green)] mt-0.5 shrink-0" />
                <span className="text-[12px] text-[var(--glass-text-dim)] leading-relaxed">{task}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}