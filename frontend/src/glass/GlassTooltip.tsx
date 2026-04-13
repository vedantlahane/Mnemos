import { useState, useRef, useCallback, type ReactNode } from "react"

interface GlassTooltipProps {
  content: string
  children: ReactNode
  delay?: number
}

export function GlassTooltip({
  content,
  children,
  delay = 400,
}: GlassTooltipProps) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const handleEnter = useCallback(() => {
    timeoutRef.current = setTimeout(() => setShow(true), delay)
  }, [delay])

  const handleLeave = useCallback(() => {
    clearTimeout(timeoutRef.current)
    setShow(false)
  }, [])

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 glass-surface-2 rounded-md text-[10px] text-white whitespace-nowrap shadow-xl z-50 pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[rgba(255,255,255,0.06)]" />
        </div>
      )}
    </div>
  )
}