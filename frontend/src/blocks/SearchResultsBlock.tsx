import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import type { BlockItem } from "../types"
import { Search } from "lucide-react"

export default function SearchResultsBlock({ item }: { item: BlockItem }) {
  const query = item.metadata?.query || ""
  const pageId = item.metadata?.pageId

  const { data, loading, error } = useAsyncData(
    () => (query ? api.search(query, 10, pageId).then((r) => r.results) : Promise.resolve([])),
    [query, pageId]
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      empty={data?.length === 0}
      emptyMessage={`No results for "${query}".`}
      loadingMessage="Searching…"
    >
      {(results) => (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[var(--glass-text-dim)] mb-2">
            <Search size={14} />
            <span className="text-[12px] font-semibold uppercase tracking-widest">
              Results for "{query}"
            </span>
          </div>
          {results.map((r) => (
            <div
              key={r.id}
              className="glass-interactive p-4 rounded-xl border border-[var(--glass-border)]"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="font-semibold text-white text-[14px]">
                  {r.title || "Untitled"}
                </div>
                <div className="text-[10px] bg-[var(--green-subtle)] text-[var(--green)] px-2 py-0.5 rounded font-bold">
                  {Math.round((r.similarity || 0) * 100)}%
                </div>
              </div>
              <div className="text-[12px] text-[var(--glass-text-dim)] line-clamp-2">
                {r.summary || r.raw_text}
              </div>
            </div>
          ))}
        </div>
      )}
    </AsyncBlock>
  )
}