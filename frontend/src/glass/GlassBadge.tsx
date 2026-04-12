import type { ReactNode } from "react"

type Variant = "info" | "success" | "warning" | "error"

interface GlassBadgeProps {
  children: ReactNode
  variant?: Variant
  className?: string
}

const VARIANTS: Record<Variant, string> = {
  info: "bg-[rgba(99,102,241,0.1)] text-[var(--color-accent)]",
  success: "bg-[rgba(34,197,94,0.1)] text-[var(--color-success)]",
  warning: "bg-[rgba(245,158,11,0.1)] text-[var(--color-warning)]",
  error: "bg-[rgba(239,68,68,0.1)] text-[var(--color-error)]",
}

export function GlassBadge({ children, variant = "info", className = "" }: GlassBadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  )
}