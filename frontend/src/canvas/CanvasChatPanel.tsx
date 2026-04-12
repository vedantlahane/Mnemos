export default function CanvasChatPanel() {
  return (
    <div className="absolute right-6 top-6 w-80 h-[500px] glass-elevated border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col overflow-hidden shadow-2xl z-10 hidden">
      <div className="p-4 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
        <div className="text-[12px] font-bold uppercase tracking-widest text-[var(--color-primary)]">Canvas Chat</div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="text-[12px] text-[var(--color-secondary)]">Ask about the nodes on this canvas...</div>
      </div>
    </div>
  )
}
