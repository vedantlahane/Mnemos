import { Icon, contentTypeIconName } from "@/components/shared/Icon"
import type { SearchData } from "@/api/types"

interface Props {
  data: SearchData
  send: (msg: string) => void
}

export function SearchCard({ data, send }: Props) {
  if (!data.results.length) {
    return (
      <div className="rounded-2xl p-4 text-center bg-white/[0.03] border border-white/[0.06]">
        <Icon name="search" size={16} className="text-white/15 mx-auto mb-2" />
        <p className="text-[12px] text-white/30">No results for "{data.query}"</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {data.results.map((r) => (
        <button
          key={r.id}
          onClick={() => send(`show item ${r.title || r.id}`)}
          className="w-full rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left cursor-pointer bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.08] transition-all"
        >
          <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
            <Icon name={contentTypeIconName(r.content_type)} size={12} className="text-[var(--accent-light)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white/70 truncate">{r.title || "Untitled"}</p>
            {r.tags.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {r.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[9px] text-[var(--accent-light)]/40">#{t}</span>
                ))}
              </div>
            )}
          </div>
          {r.similarity !== undefined && (
            <span className="text-[11px] font-mono text-[var(--accent-light)]/60 tabular-nums flex-shrink-0">
              {Math.round(r.similarity * 100)}%
            </span>
          )}
        </button>
      ))}
    </div>
  )
}