import { useEffect, useState, useRef } from "react"
import { api } from "../api/client"
import type { Note, StreamItem } from "../types"
import { Search, Loader2 } from "lucide-react"

export default function SearchResultsBlock({ item }: { item: StreamItem }) {
  const [results, setResults] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const query = item.metadata?.query || ""
  const pageId = item.metadata?.pageId

  useEffect(() => {
    if (fetchedRef.current || !query) {
      setLoading(false)
      return
    }
    fetchedRef.current = true

    api.search(query, 10, pageId)
      .then((resp) => setResults(resp.results || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [query, pageId])

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-[var(--glass-text-dim)]" />
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-[12px] text-[var(--glass-text-dim)] p-4">
        No search results found for "{query}".
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[var(--glass-text-dim)] mb-2">
        <Search size={14} />
        <span className="text-[12px] font-semibold uppercase tracking-widest">
          Search Results for "{query}"
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
            <div className="text-[10px] bg-[rgba(34,197,94,0.1)] text-[var(--green)] px-2 py-0.5 rounded font-bold">
              {Math.round((r.similarity || 0) * 100)}%
            </div>
          </div>
          <div className="text-[12px] text-[var(--glass-text-dim)] line-clamp-2">
            {r.summary || r.raw_text}
          </div>
        </div>
      ))}
    </div>
  )
}