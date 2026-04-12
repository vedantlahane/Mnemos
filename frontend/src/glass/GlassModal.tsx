export function GlassModal({ isOpen, onClose, title, children }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-elevated w-full max-w-lg rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-white transition-colors">✕</button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
