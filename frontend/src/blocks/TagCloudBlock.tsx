import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { TagWithCount } from "../types"

export default function TagCloudBlock() {
  const [tags, setTags] = useState<TagWithCount[]>([])

  useEffect(() => {
    api.getTags().then(res => setTags(res || [])).catch(console.error)
  }, [])

  if (tags.length === 0) return null

  return (
    <div className="glass-primary p-6 rounded-2xl">
       <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Workspace Tags</div>
       <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <div key={t.name} className="glass-interactive px-3 py-1.5 rounded-full flex items-center gap-2 border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer">
               <span className="text-[12px] font-mono text-[var(--color-accent-cyan)]">#{t.name}</span>
               <span className="text-[10px] text-[var(--color-secondary)] bg-[rgba(255,255,255,0.05)] px-1.5 rounded">{t.count}</span>
            </div>
          ))}
       </div>
    </div>
  )
}
