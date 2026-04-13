import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import type { BlockItem } from "../types"
import { CheckSquare, FileText } from "lucide-react"
import { pluralize } from "../utils"

interface TaskGroupItem {
  noteId: string
  noteTitle: string
  tasks: string[]
}

export default function TaskListBlock({ item }: { item: BlockItem }) {
  const pageId = item.metadata?.pageId

  const { data, loading, error } = useAsyncData(
    async (): Promise<TaskGroupItem[]> => {
      const resp = await api.listNotes(1, 100, undefined, pageId)
      return resp.notes
        .filter((n) => n.tasks && n.tasks.length > 0)
        .map((n) => ({
          noteId: n.id,
          noteTitle: n.title || "Untitled",
          tasks: n.tasks,
        }))
    },
    [pageId]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      empty={data?.length === 0}
      emptyMessage="No tasks found. Tasks are extracted from captured notes."
      loadingMessage="Loading tasks…"
    >
      {(groups) => {
        const totalTasks = groups.reduce((sum, g) => sum + g.tasks.length, 0)
        return (
          <div className="glass-surface-1 p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)]">
                Tasks
              </div>
              <span className="text-[11px] text-[var(--glass-text-dim)]">
                {totalTasks} {pluralize(totalTasks, "task")} from{" "}
                {groups.length} {pluralize(groups.length, "note")}
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.noteId}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={12} className="text-[var(--accent)]" />
                    <span className="text-[12px] font-semibold text-white">
                      {group.noteTitle}
                    </span>
                  </div>
                  {group.tasks.map((task, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 py-1.5 pl-5"
                    >
                      <CheckSquare
                        size={13}
                        className="text-[var(--green)] mt-0.5 shrink-0"
                      />
                      <span className="text-[12px] text-[var(--glass-text-dim)] leading-relaxed">
                        {task}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      }}
    </AsyncBlock>
  )
}