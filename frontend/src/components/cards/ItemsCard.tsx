import { Icon, contentTypeIconName, statusIconName } from "@/components/shared/Icon"
import type { ItemListData } from "@/api/types"

interface Props {
  data: ItemListData
}

export function ItemsCard({ data }: Props) {
  if (!data.items.length) {
    return (
      <div className="glass-card rounded-2xl p-4 text-center">
        <Icon name="note" size={20} className="text-[var(--glass-text-muted)] mx-auto mb-2" />
        <p className="text-xs text-[var(--glass-text-dim)]">No items found</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 stagger-children">
      <p className="text-[11px] text-[var(--glass-text-muted)] px-1 font-medium tracking-wide uppercase">
        {data.total} item{data.total !== 1 ? "s" : ""}
      </p>
      {data.items.map((item) => (
        <div
          key={item.id}
          className="glass-card rounded-2xl px-4 py-3"
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
              <Icon name={contentTypeIconName(item.content_type)} size={12} className="text-[var(--accent-light)]" />
            </div>
            <p className="text-sm font-medium text-white truncate flex-1">
              {item.title || "Untitled"}
            </p>
            <Icon
              name={statusIconName(item.status)}
              size={12}
              className={
                item.status === "ready" ? "text-[var(--green)]" :
                item.status === "error" ? "text-[var(--red)]" :
                item.status === "processing" ? "text-[var(--accent)] animate-spin" :
                "text-[var(--amber)]"
              }
            />
          </div>
          {item.summary && (
            <p className="text-xs text-[var(--glass-text-muted)] line-clamp-2 ml-[34px]">{item.summary}</p>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 ml-[34px]">
              {item.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/10"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}