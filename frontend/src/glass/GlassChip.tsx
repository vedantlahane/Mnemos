export function GlassChip({ children, onRemove, className = "" }: any) {
  return (
    <div className={`glass-elevated inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium text-[var(--color-primary)] border border-[rgba(255,255,255,0.06)] ${className}`}>
      {children}
      {onRemove && (
        <button className="text-[var(--color-muted)] hover:text-white transition-colors ml-1" onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  )
}
