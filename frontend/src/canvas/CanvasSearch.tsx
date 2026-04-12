export default function CanvasSearch() {
  return (
    <div className="absolute left-6 top-6 glass-elevated border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden shadow-xl z-10 w-64">
      <input 
        type="text" 
        placeholder="Search canvas nodes..." 
        className="w-full bg-transparent px-4 py-2 text-[13px] text-white outline-none placeholder-[var(--color-muted)]"
      />
    </div>
  )
}
