import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useStream } from "../hooks/useStream"
import type { TagWithCount } from "../types"
import { Loader2 } from "lucide-react"

export default function TagCloudBlock() {
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const { addUserMessage, addBlock } = useStream()

  useEffect(() => {
    api.getTags()
      .then((res) => setTags(res.tags || res || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-[var(--glass-text-muted)]" size={20} />
      </div>
    )
  }

  if (tags.length === 0) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[13px] text-[var(--glass-text-dim)]">
        No tags found yet. Capture some notes to see tags appear.
      </div>
    )
  }

  function handleTagClick(tagName: string) {
    addUserMessage(`/notes #${tagName}`)
    addBlock("note-grid", undefined, { tag: tagName })
  }

  return (
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
  )
}