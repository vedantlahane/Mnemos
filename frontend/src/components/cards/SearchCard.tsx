import { Icon, contentTypeIconName } from "@/components/shared/Icon"
import type { SearchData } from "@/api/types"

interface Props {
  data: SearchData
}

export function SearchCard({ data }: Props) {
  if (!data.results.length) {
    return (
      <div className="glass-card rounded-2xl p-4 text-center">
        <Icon name="search" size={18} className="text-[var(--glass-text-muted)] mx-auto mb-2" />
        <p className="text-xs text-[var(--glass-text-dim)]">No results for "{data.query}"</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 stagger-children">
      {data.results.map((r) => (
        <div key={r.id} className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
            <Icon name={contentTypeIconName(r.content_type)} size={13} className="text-[var(--accent-light)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{r.title || "Untitled"}</p>
            {r.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {r.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] text-[var(--accent-light)]/70">#{t}</span>
                ))}
              </div>
            )}
          </div>
          {r.similarity !== undefined && (
            <span className="text-[11px] font-mono text-[var(--accent-light)] tabular-nums flex-shrink-0">
              {Math.round(r.similarity * 100)}%
            </span>
          )}
        </div>
      ))}
    </div>
  )
}