import { useState } from "react"
export function GlassDropdown({ options, value, onChange, className = "" }: any) {
  const [open, setOpen] = useState(false)
  
  return (
    <div className={`relative ${className}`}>
      <div 
        className="glass-interactive px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.06)] text-[12px] cursor-pointer flex justify-between items-center min-w-[120px]"
        onClick={() => setOpen(!open)}
      >
         <span>{options.find((o:any) => o.value === value)?.label || "Select..."}</span>
         <span className="text-[10px] text-[var(--color-muted)]">▼</span>
      </div>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 glass-elevated border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden shadow-xl z-50">
           {options.map((opt:any) => (
             <div 
                key={opt.value} 
                className="px-3 py-2 text-[12px] text-[var(--color-secondary)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] cursor-pointer"
                onClick={() => { onChange(opt.value); setOpen(false) }}
             >
                {opt.label}
             </div>
           ))}
        </div>
      )}
    </div>
  )
}
