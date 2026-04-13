import type { ReactNode } from "react"

type Variant = "info" | "success" | "warning" | "error"

const V: Record<Variant, string> = {
  info: "bg-indigo-50 text-indigo-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  error: "bg-red-50 text-red-600",
}

export function GlassBadge({
  children,
  variant = "info",
  className = "",
}: {
  children: ReactNode
  variant?: Variant
  className?: string
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${V[variant]} ${className}`}
    >
      {children}
    </span>
  )
}