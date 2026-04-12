import type { InputHTMLAttributes } from "react"

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function GlassInput({ className = "", ...props }: GlassInputProps) {
  return (
    <input
      className={`glass-surface-3 bg-transparent px-4 py-2 rounded-xl text-[14px] text-[var(--color-primary)] placeholder-[var(--color-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-dim)] transition-shadow ${className}`}
      {...props}
    />
  )
}