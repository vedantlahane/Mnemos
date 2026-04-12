import type { StreamItem } from "../types"

export default function NoteDetailBlock({ item }: { item: StreamItem }) {
  return (
    <div className="glass-primary p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Note Details</div>
      <div className="text-[13px] text-[var(--color-secondary)]">
        Details for note: {item.metadata?.noteIds?.[0] || "Unknown"}
      </div>
    </div>
  )
}
