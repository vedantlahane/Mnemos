export function GlassInput({ className = "", ...props }: any) {
  return (
    <input 
      className={`glass-interactive bg-transparent border border-[rgba(255,255,255,0.06)] px-4 py-2 rounded-xl text-[14px] text-[var(--color-primary)] placeholder-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-blue)] ${className}`}
      {...props}
    />
  )
}
