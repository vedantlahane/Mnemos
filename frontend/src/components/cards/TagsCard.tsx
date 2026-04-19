import type { TagListData } from "@/api/types"

interface Props {
  data: TagListData
  send: (msg: string) => void
}

export function TagsCard({ data, send }: Props) {
  if (!data.tags.length) return null

  return (
    <div className="flex flex-wrap gap-1.5 stagger-children">
      {data.tags.map((tag) => (
        <button
          key={tag.name}
          onClick={() => send(`search #${tag.name}`)}
          className="glass-pill flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs group cursor-pointer"
        >
          <span className="text-[var(--accent-light)] group-hover:text-white transition-colors">#{tag.name}</span>
          <span className="text-[10px] text-[var(--glass-text-muted)] tabular-nums group-hover:text-[var(--accent-light)] transition-colors">{tag.count}</span>
        </button>
      ))}
    </div>
  )
}