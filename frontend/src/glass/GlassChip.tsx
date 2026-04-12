import type { ReactNode } from "react"

interface GlassChipProps {
  children: ReactNode
  onRemove?: () => void
  onClick?: () => void
  className?: string
}

export function GlassChip({ children, onRemove, onClick, className = "" }: GlassChipProps) {
  return (
    <div
      className={`glass-surface-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-[var(--color-primary)] ${onClick ? "cursor-pointer glass-hover" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
      {onRemove && (
        <button
          className="text-[var(--color-tertiary)] hover:text-white transition-colors ml-0.5"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          ✕
        </button>
      )}
    </div>
  )
}