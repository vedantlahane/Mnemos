import { forwardRef, useState, useCallback } from "react"
import { Send } from "lucide-react"

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
}

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(
  ({ onSend, disabled }, ref) => {
    const [value, setValue] = useState("")

    const handleSend = useCallback(() => {
      const trimmed = value.trim()
      if (!trimmed || disabled) return
      onSend(trimmed)
      setValue("")
    }, [value, disabled, onSend])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSend()
        }
      },
      [handleSend],
    )

    return (
      <div className="p-3 border-t border-[var(--glass-border)] flex-shrink-0">
        <div className="flex items-end gap-2 rounded-xl px-4 py-2 bg-[var(--glass-bg-thick)] border border-[var(--glass-border)] focus-within:border-[var(--accent)] transition-colors">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (⌘K to focus)"
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none outline-none max-h-32 text-sm leading-relaxed bg-transparent text-[var(--glass-text)] placeholder-[var(--glass-text-muted)]"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    )
  },
)
ChatInput.displayName = "ChatInput"