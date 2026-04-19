import { usePanel } from "@/hooks/usePanel"
import { useChat } from "@/hooks/useChat"
import { EmptyState } from "@/components/shared/EmptyState"

export function TagsPanel() {
  const { tags } = usePanel()
  const { send } = useChat()

  if (!tags?.tags.length) {
    return <EmptyState icon="🏷️" message="No tags yet" hint="Tags appear when you capture items" />
  }

  return (
    <div className="p-3">
      <p className="text-xs text-[var(--glass-text-muted)] px-2 mb-3">
        Tags ({tags.tags.length})
      </p>
      <div className="flex flex-wrap gap-2 px-1">
        {tags.tags.map((tag) => (
          <button
            key={tag.name}
            onClick={() => send(`search for #${tag.name}`)}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
              bg-[var(--accent-subtle)] text-[var(--accent)] text-xs
              border border-transparent hover:border-[var(--accent)]/30
              transition-all"
          >
            <span>#{tag.name}</span>
            <span className="text-[10px] text-[var(--glass-text-muted)] group-hover:text-[var(--accent-light)]">
              {tag.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}