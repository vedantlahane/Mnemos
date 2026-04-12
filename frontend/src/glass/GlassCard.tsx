export function GlassCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`glass-elevated p-6 rounded-2xl border border-[rgba(255,255,255,0.06)] ${className}`}>
      {children}
    </div>
  )
}
