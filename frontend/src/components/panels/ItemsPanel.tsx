import { usePanel } from "@/hooks/usePanel"
import { EmptyState } from "@/components/shared/EmptyState"
import { contentTypeIcon, statusColor } from "@/lib/utils"

export function ItemsPanel() {
  const { items } = usePanel()

  if (!items?.items.length) {
    return <EmptyState icon="📌" message="No items yet" hint='Say "remember ..." to capture' />
  }

  return (
    <div className="p-3 space-y-1">
      <p className="text-xs text-[var(--glass-text-muted)] px-2 mb-2">
        Items ({items.total})
      </p>
      {items.items.map((item) => (
        <div
          key={item.id}
          className="px-3 py-2.5 rounded-lg bg-[var(--glass-bg-thick)] border border-[var(--glass-border)]"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs">{contentTypeIcon(item.content_type)}</span>
            <p className="text-sm font-medium text-white truncate flex-1">
              {item.title || "Untitled"}
            </p>
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusColor(item.status) }}
              title={item.status}
            />
          </div>
          {item.summary && (
            <p className="text-xs text-[var(--glass-text-muted)] line-clamp-2">{item.summary}</p>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)]"
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