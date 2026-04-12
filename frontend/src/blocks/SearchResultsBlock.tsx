import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Note, StreamItem } from "../types"
import { Search, Loader2 } from "lucide-react"

export default function SearchResultsBlock({ item }: { item: StreamItem }) {
  const [results, setResults] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function search() {
      try {
        const q = item.metadata?.query || ""
        if (!q) return
        const resp = await api.search(q, 10, item.metadata?.pageId)
        setResults(resp.results || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    search()
  }, [item])

  if (loading) {
     return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-[var(--color-muted)]" /></div>
  }

  if (results.length === 0) {
     return <div className="text-[12px] text-[var(--color-secondary)] p-4">No search results found.</div>
  }

  return (
    <div className="flex flex-col gap-3">
       <div className="flex items-center gap-2 text-[var(--color-secondary)] mb-2">
         <Search size={14} /> 
         <span className="text-[12px] font-semibold uppercase tracking-widest">Search Results</span>
       </div>
       {results.map(r => (
         <div key={r.id} className="glass-interactive p-4 rounded-xl border border-[rgba(255,255,255,0.06)]">
            <div className="flex justify-between items-start mb-2">
               <div className="font-semibold text-white text-[14px]">{r.title || "Untitled"}</div>
               <div className="text-[10px] bg-[rgba(16,185,129,0.1)] text-[var(--color-success)] px-2 py-0.5 rounded font-bold">
                  {Math.round((r.similarity || 0) * 100)}%
               </div>
            </div>
            <div className="text-[12px] text-[var(--color-secondary)] line-clamp-2">
               {r.summary || r.raw_text}
            </div>
         </div>
       ))}
    </div>
  )
}
