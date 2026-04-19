import { usePanel } from "@/hooks/usePanel"
import { useChat } from "@/hooks/useChat"
import { formatTime } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"

export function BoardsPanel() {
  const { boards } = usePanel()
  const { send } = useChat()

  if (!boards?.boards.length) {
    return <EmptyState icon="📋" message="No boards yet" hint='Say "create board My Board"' />
  }

  return (
    <div className="p-3 space-y-1">
      <p className="text-xs text-[var(--glass-text-muted)] px-2 mb-2">Boards</p>
      {boards.boards.map((b) => (
        <button
          key={b.id}
          onClick={() => send(`open ${b.display_name}`)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[var(--glass-text)] hover:bg-[var(--glass-bg-thick)] transition-all group"
        >
          <span className="text-lg flex-shrink-0">{b.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{b.display_name}</p>
            {b.description && (
              <p className="text-xs text-[var(--glass-text-muted)] truncate">{b.description}</p>
            )}
          </div>
          <span className="text-xs text-[var(--glass-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {formatTime(b.updated_at)}
          </span>
        </button>
      ))}
    </div>
  )
}