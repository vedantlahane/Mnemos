import type { ReactNode, ButtonHTMLAttributes } from "react"

type Variant = "primary" | "ghost" | "danger"

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: Variant
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[rgba(99,102,241,0.1)] text-[var(--color-accent)] border-[rgba(99,102,241,0.2)] hover:bg-[rgba(99,102,241,0.2)]",
  ghost: "bg-transparent text-[var(--color-secondary)] border-transparent hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
  danger: "bg-[rgba(239,68,68,0.1)] text-[var(--color-error)] border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.2)]",
}

export function GlassButton({ children, variant = "primary", className = "", ...props }: GlassButtonProps) {
  return (
    <button
      className={`px-4 py-2 rounded-xl transition-all font-semibold text-[13px] border ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}