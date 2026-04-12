import type { StreamItem } from "../types"

export default function ReadingPathBlock({ item }: { item: StreamItem }) {
  return (
    <div className="glass-primary p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Reading Path</div>
      <div className="text-[13px] text-[var(--color-secondary)]">
         Computed reading path for {item.metadata?.topic || "current context"}:
         <div className="mt-4 border-l-2 border-[var(--color-accent-blue)] pl-4 ml-2">
            <div className="py-2">1. Foundations of {item.metadata?.topic || "this topic"}</div>
            <div className="py-2">2. Advanced Implementations</div>
            <div className="py-2">3. Reference Materials</div>
         </div>
      </div>
    </div>
  )
}
