import { forwardRef, useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Icon } from "@/components/shared/Icon"
import { CommandPalette } from "./CommandPalette"
import { COMMAND_TO_MESSAGE, type Command } from "@/lib/constants"

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
  minimal?: boolean
}

const PLACEHOLDERS = [
  "Message Mnemos… or type /",
  "Try /boards to see workspaces",
  "Try /search to find anything",
  "Try /remember to save knowledge",
]

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(
  ({ onSend, disabled, minimal }, ref) => {
    const [value, setValue] = useState("")
    const [focused, setFocused] = useState(false)
    const [placeholderIdx, setPlaceholderIdx] = useState(0)
    const [placeholderVisible, setPlaceholderVisible] = useState(true)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)

    // Is the command palette open?
    const showPalette = useMemo(() => {
      return value.startsWith("/") && !value.includes(" ")
    }, [value])

    // Rotate placeholder
    useEffect(() => {
      if (focused || value) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        return
      }
      intervalRef.current = setInterval(() => {
        setPlaceholderVisible(false)
        setTimeout(() => {
          setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length)
          setPlaceholderVisible(true)
        }, 200)
      }, 4000)
      return () => {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }, [focused, value])

    const handleSend = useCallback(() => {
      const trimmed = value.trim()
      if (!trimmed || disabled) return

      // If it's a slash command with no additional text, resolve it
      if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
        const mapped = COMMAND_TO_MESSAGE[trimmed]
        if (mapped) {
          // If the mapped message ends with a space, it needs more input — put it in the input
          if (mapped.endsWith(" ")) {
            setValue(mapped)
            return
          }
          onSend(mapped)
          setValue("")
          return
        }
      }

      onSend(trimmed)
      setValue("")
    }, [value, disabled, onSend])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        // Don't handle Enter/arrows when palette is open — palette handles them
        if (showPalette && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          return // let palette handle
        }
        if (e.key === "Enter" && !e.shiftKey) {
          if (showPalette) return // palette handles enter
          e.preventDefault()
          handleSend()
        }
        if (e.key === "Escape" && showPalette) {
          setValue("")
        }
      },
      [handleSend, showPalette],
    )

    const handleCommandSelect = useCallback(
      (command: Command) => {
        const mapped = COMMAND_TO_MESSAGE[command.slash]
        if (!mapped) return

        // Commands that need more input (end with space)
        if (mapped.endsWith(" ")) {
          setValue(mapped)
          // Focus the textarea
          const textarea = typeof ref === "function" ? null : ref?.current
          textarea?.focus()
          return
        }

        // Complete commands — send immediately
        onSend(mapped)
        setValue("")
      },
      [onSend, ref],
    )

    const handlePaletteClose = useCallback(() => {
      setValue("")
    }, [])

    const hasValue = value.trim().length > 0

    return (
      <div className={`p-3 flex-shrink-0 ${minimal ? "" : ""}`}>
        <div ref={wrapperRef} className="relative">
          {/* Command palette */}
          <CommandPalette
            filter={value}
            onSelect={handleCommandSelect}
            onClose={handlePaletteClose}
            visible={showPalette}
          />

          {/* Input bar */}
          <div
            className={cn(
              "relative flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-300",
              minimal
                ? "bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08]"
                : "bg-white/[0.02] backdrop-blur-2xl border border-white/[0.06]",
              focused && "border-[var(--accent)]/30 shadow-[0_0_20px_var(--accent-glow)]",
              showPalette && "border-[var(--accent)]/40 shadow-[0_0_24px_var(--accent-glow)]",
              !focused && !showPalette && "hover:border-white/[0.10]",
            )}
          >
            {/* Top glow */}
            <div
              className={cn(
                "absolute inset-x-4 top-0 h-px transition-opacity duration-300",
                focused || showPalette ? "opacity-100" : "opacity-0",
              )}
              style={{
                background: "linear-gradient(90deg, transparent, var(--accent-light), transparent)",
              }}
            />

            <div className="flex-shrink-0 self-center">
              <Icon
                name={showPalette ? "chevronRight" : "sparkles"}
                size={17}
                className={cn(
                  "transition-all duration-300",
                  showPalette ? "text-[var(--accent)]" : focused ? "text-[var(--accent-light)]" : "text-white/20",
                )}
                strokeWidth={1.5}
              />
            </div>

            <div className="flex-1 relative min-h-[24px]">
              <textarea
                ref={ref}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                disabled={disabled}
                rows={1}
                className="w-full resize-none outline-none max-h-28 text-[14px] leading-relaxed bg-transparent z-10 text-white/90 font-light relative"
                placeholder=""
              />
              {/* Animated placeholder */}
              {!value && (
                <div
                  className={cn(
                    "absolute inset-0 flex items-center pointer-events-none text-[14px] font-light transition-opacity duration-200",
                    placeholderVisible ? "opacity-100" : "opacity-0",
                    focused ? "text-white/25" : "text-white/15",
                  )}
                >
                  {PLACEHOLDERS[placeholderIdx]}
                </div>
              )}
            </div>

            {/* Slash hint or send button */}
            {hasValue ? (
              <button
                onClick={handleSend}
                disabled={disabled || showPalette}
                className={cn(
                  "p-2 rounded-xl z-10 transition-all duration-300 flex-shrink-0 self-end",
                  !disabled && !showPalette
                    ? "bg-[var(--accent)] text-white shadow-[0_0_16px_var(--accent-glow-strong)] hover:scale-105 active:scale-95"
                    : "bg-white/[0.04] text-white/15 cursor-not-allowed",
                )}
              >
                <Icon name="arrowRight" size={15} strokeWidth={2.5} />
              </button>
            ) : (
              <div className="flex items-center gap-1 self-center flex-shrink-0 opacity-60">
                <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.07] text-[10px] font-mono text-white/25">/</kbd>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
)
ChatInput.displayName = "ChatInput"

function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}