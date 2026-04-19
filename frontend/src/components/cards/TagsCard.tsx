import { useChat } from "@/hooks/useChat"
import type { TagListData } from "@/api/types"

interface Props {
  data: TagListData
}

export function TagsCard({ data }: Props) {
  const { send } = useChat()

  if (!data.tags.length) return null

  return (
    <div className="flex flex-wrap gap-1.5 stagger-children">
      {data.tags.map((tag) => (
        <button
          key={tag.name}
          onClick={() => send(`search #${tag.name}`)}
          className="glass-pill flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs group"
        >
          <span className="text-[var(--accent-light)] group-hover:text-[var(--accent)]">#{tag.name}</span>
          <span className="text-[10px] text-[var(--glass-text-muted)] tabular-nums">{tag.count}</span>
        </button>
      ))}
    </div>
  )
}