import type { ReactNode } from "react"

interface GlassCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function GlassCard({ children, className = "", onClick }: GlassCardProps) {
  return (
    <div
      className={`glass-surface-2 p-6 rounded-2xl ${onClick ? "cursor-pointer glass-hover" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}