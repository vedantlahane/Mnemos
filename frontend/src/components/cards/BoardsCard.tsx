import { Icon } from "@/components/shared/Icon"
import { formatTime } from "@/lib/utils"
import type { BoardListData } from "@/api/types"

interface Props {
  data: BoardListData
  send: (msg: string) => void
}

export function BoardsCard({ data, send }: Props) {
  if (!data.boards.length) {
    return (
      <div className="glass-card rounded-2xl p-4 text-center">
        <Icon name="boards" size={20} className="text-[var(--glass-text-muted)] mx-auto mb-2" />
        <p className="text-xs text-[var(--glass-text-dim)] mb-2">No boards yet</p>
        <button
          onClick={() => send("create board My First Board")}
          className="text-[11px] text-[var(--accent-light)] hover:text-white transition-colors cursor-pointer"
        >
          + Create one
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 stagger-children">
      {data.boards.map((b) => (
        <button
          key={b.id}
          onClick={() => send(`open ${b.display_name}`)}
          className="glass-card w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/10 flex items-center justify-center flex-shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
            <span className="text-base">{b.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{b.display_name}</p>
            {b.description && (
              <p className="text-[11px] text-[var(--glass-text-muted)] truncate mt-0.5">{b.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-[var(--glass-text-muted)]">{formatTime(b.updated_at)}</span>
            <Icon name="chevronRight" size={14} className="text-[var(--glass-text-muted)]" />
          </div>
        </button>
      ))}
    </div>
  )
}