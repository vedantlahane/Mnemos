export function GlassBadge({ children, variant = "info", className = "" }: any) {
  const variants = {
    info: "bg-[rgba(37,99,235,0.1)] text-[var(--color-accent-blue)]",
    success: "bg-[rgba(16,185,129,0.1)] text-[var(--color-success)]",
    warning: "bg-[rgba(245,158,11,0.1)] text-[var(--color-warning)]",
    error: "bg-[rgba(239,68,68,0.1)] text-[var(--color-error)]"
  }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${variants[variant as keyof typeof variants]} ${className}`}>
      {children}
    </span>
  )
}
