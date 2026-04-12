import { useState, useRef, useEffect } from "react"

interface Option {
  value: string
  label: string
}

interface GlassDropdownProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function GlassDropdown({ options, value, onChange, className = "" }: GlassDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick)
      return () => document.removeEventListener("mousedown", handleClick)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        className="glass-surface-3 px-3 py-1.5 rounded-lg text-[12px] cursor-pointer flex justify-between items-center min-w-[130px] text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[var(--color-primary)]">{selected?.label || "Select..."}</span>
        <span className="text-[10px] text-[var(--color-tertiary)] ml-2">▼</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 glass-surface-2 rounded-xl overflow-hidden shadow-xl z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${
                opt.value === value
                  ? "text-[var(--color-accent)] bg-[rgba(99,102,241,0.08)]"
                  : "text-[var(--color-secondary)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
              }`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}