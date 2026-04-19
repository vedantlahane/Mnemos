import { useMemo, useState, useEffect, useRef } from "react"
import { Icon } from "@/components/shared/Icon"
import { COMMANDS, CATEGORY_LABELS, type Command } from "@/lib/constants"

interface Props {
  filter: string
  onSelect: (command: Command) => void
  onClose: () => void
  visible: boolean
}

export function CommandPalette({ filter, onSelect, onClose, visible }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter commands
  const filtered = useMemo(() => {
    const q = filter.slice(1).toLowerCase() // remove the "/"
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (cmd) =>
        cmd.slash.toLowerCase().includes(q) ||
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    )
  }, [filter])

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {}
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = []
      groups[cmd.category].push(cmd)
    }
    return groups
  }, [filtered])

  // Flat list for keyboard nav
  const flatList = useMemo(() => filtered, [filtered])

  // Reset index when filter changes
  useEffect(() => {
    setActiveIndex(0)
  }, [filter])

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  // Keyboard handler — attached to window so it works while textarea is focused
  useEffect(() => {
    if (!visible) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, flatList.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && flatList[activeIndex]) {
        e.preventDefault()
        onSelect(flatList[activeIndex])
      } else if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [visible, flatList, activeIndex, onSelect, onClose])

  if (!visible || flatList.length === 0) return null

  let globalIndex = 0

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50 animate-scale-in origin-bottom">
      <div
        ref={listRef}
        className="rounded-2xl overflow-hidden max-h-[320px] overflow-y-auto"
        style={{
          background: "rgba(14, 14, 24, 0.85)",
          backdropFilter: "blur(48px) saturate(1.5)",
          WebkitBackdropFilter: "blur(48px) saturate(1.5)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: `
            0 0 0 0.5px rgba(255,255,255,0.03) inset,
            0 -8px 40px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(124, 58, 237, 0.06)
          `,
        }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/[0.04]">
          <span className="text-[11px] text-white/25 font-medium tracking-wider uppercase">Commands</span>
          <div className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded text-[9px] font-mono bg-white/[0.05] text-white/25 border border-white/[0.06]">↑↓</kbd>
            <span className="text-[9px] text-white/15 mx-0.5">navigate</span>
            <kbd className="px-1 py-0.5 rounded text-[9px] font-mono bg-white/[0.05] text-white/25 border border-white/[0.06]">↵</kbd>
            <span className="text-[9px] text-white/15 mx-0.5">select</span>
          </div>
        </div>

        {/* Command groups */}
        <div className="py-1.5">
          {Object.entries(grouped).map(([category, commands]) => (
            <div key={category}>
              <p className="px-4 pt-2.5 pb-1 text-[10px] text-white/20 font-medium uppercase tracking-wider">
                {CATEGORY_LABELS[category] ?? category}
              </p>
              {commands.map((cmd) => {
                const idx = globalIndex++
                const isActive = idx === activeIndex
                return (
                  <button
                    key={cmd.id}
                    data-index={idx}
                    onClick={() => onSelect(cmd)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75",
                      isActive
                        ? "bg-white/[0.06]"
                        : "hover:bg-white/[0.03]",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150",
                        isActive
                          ? "bg-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]"
                          : "bg-white/[0.04]",
                      )}
                    >
                      <Icon
                        name={cmd.icon}
                        size={14}
                        className={isActive ? "text-white" : "text-white/40"}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[13px] font-medium transition-colors",
                          isActive ? "text-white" : "text-white/60",
                        )}>
                          {cmd.label}
                        </span>
                        <span className="text-[11px] font-mono text-white/15">
                          {cmd.slash}
                        </span>
                      </div>
                      <p className={cn(
                        "text-[11px] transition-colors",
                        isActive ? "text-white/40" : "text-white/20",
                      )}>
                        {cmd.description}
                      </p>
                    </div>
                    {isActive && (
                      <Icon name="arrowRight" size={12} className="text-white/30 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}