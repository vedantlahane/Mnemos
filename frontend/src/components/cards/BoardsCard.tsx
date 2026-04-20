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
      <div className="rounded-2xl p-4 text-center bg-white/[0.03] border border-white/[0.06]">
        <Icon name="boards" size={18} className="text-white/15 mx-auto mb-2" />
        <p className="text-[12px] text-white/30 mb-2">No boards yet</p>
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
    <div className="space-y-1">
      {data.boards.map((b) => (
        <button
          key={b.id}
          onClick={() => send(`open ${b.display_name}`)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left group cursor-pointer bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.08] transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/10 flex items-center justify-center flex-shrink-0 group-hover:border-[var(--accent)]/25 transition-colors">
            <span className="text-sm">{b.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white/80 truncate group-hover:text-white transition-colors">
              {b.display_name}
            </p>
            {b.description && (
              <p className="text-[10px] text-white/20 truncate mt-0.5">{b.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-white/20">{formatTime(b.updated_at)}</span>
            <Icon name="chevronRight" size={12} className="text-white/20" />
          </div>
        </button>
      ))}
    </div>
  )
}