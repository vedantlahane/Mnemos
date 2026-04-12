export function GlassButton({ children, onClick, variant = "primary", className = "" }: any) {
  const base = "px-4 py-2 rounded-xl transition-all font-semibold text-[13px] border "
  const variants = {
    primary: "bg-[rgba(37,99,235,0.1)] text-[var(--color-accent-blue)] border-[rgba(37,99,235,0.2)] hover:bg-[rgba(37,99,235,0.2)]",
    ghost: "bg-transparent text-[var(--color-secondary)] border-transparent hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
    danger: "bg-[rgba(239,68,68,0.1)] text-[var(--color-error)] border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.2)]"
  }
  return (
    <button className={`${base} ${variants[variant as keyof typeof variants]} ${className}`} onClick={onClick}>
      {children}
    </button>
  )
}
