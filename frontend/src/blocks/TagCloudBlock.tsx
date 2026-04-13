import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import { useStream } from "../hooks/useStream"
import type { BlockItem } from "../types"

export default function TagCloudBlock(_props: { item: BlockItem }) {
  const { addUserMessage, addBlock } = useStream()

  const { data, loading, error } = useAsyncData(
    () => api.getTags().then((r) => r.tags),
    []
  )

  function handleTagClick(tagName: string) {
    addUserMessage(`/notes #${tagName}`)
    addBlock("note-grid", undefined, { tag: tagName })
  }

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      empty={data?.length === 0}
      emptyMessage="No tags yet. Capture notes to see tags."
      loadingMessage="Loading tags…"
    >
      {(tags) => (
        <div className="glass-surface-1 p-6 rounded-2xl">
          <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-4">
            Tags
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t.name}
                onClick={() => handleTagClick(t.name)}
                className="glass-surface-3 px-3 py-1.5 rounded-full flex items-center gap-2 glass-hover cursor-pointer"
              >
                <span className="text-[12px] font-mono text-[var(--accent)]">
                  #{t.name}
                </span>
                <span className="text-[10px] text-[var(--glass-text-muted)] bg-[rgba(255,255,255,0.05)] px-1.5 rounded">
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AsyncBlock>
  )
}