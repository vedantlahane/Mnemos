import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { Page } from "../types"
import { useContext } from "../hooks/useContext"

export default function PageListBlock() {
  const [pages, setPages] = useState<Page[]>([])
  const { switchTo } = useContext()

  useEffect(() => {
    api.listPages().then(res => setPages(res.pages || [])).catch(console.error)
  }, [])

  return (
    <div className="flex flex-col gap-3">
       <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">All Pages</div>
       <div className="grid grid-cols-2 gap-4">
          {pages.map(page => (
            <div 
               key={page.id} 
               onClick={() => switchTo("page", page.id, page.name)}
               className="glass-interactive p-4 rounded-xl border border-[rgba(255,255,255,0.06)] flex items-center justify-between"
            >
               <div className="flex items-center gap-3">
                  <div className="text-xl">{page.icon || "📄"}</div>
                  <div>
                    <div className="text-[13px] font-semibold text-white">{page.name}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">{page.note_count} notes</div>
                  </div>
               </div>
            </div>
          ))}
       </div>
    </div>
  )
}
