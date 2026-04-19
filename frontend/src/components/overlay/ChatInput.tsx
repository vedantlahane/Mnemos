import { forwardRef, useState, useCallback } from "react"
import { Sparkles, ArrowRight } from "lucide-react"

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
  minimal?: boolean
}

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(
  ({ onSend, disabled, minimal }, ref) => {
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
      <div className={`p-3 flex-shrink-0 ${minimal ? "" : "border-t border-white/10"}`}> 
        <div className={`relative flex items-end gap-3 rounded-[24px] px-5 py-3.5 transition-all duration-300 shadow-2xl ${
          minimal 
            ? "bg-white/5 backdrop-blur-3xl border border-white/20 focus-within:border-white/40 focus-within:bg-white/10 hover:bg-white/10" 
            : "bg-black/20 backdrop-blur-xl border border-white/10 focus-within:border-white/20 focus-within:bg-black/30"
        }`}>
          {minimal && (
            <div className="absolute inset-0 rounded-[24px] pointer-events-none" style={{
              boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 32px rgba(0, 0, 0, 0.4)"
            }} />
          )}
          <div className="flex-shrink-0 self-center pb-0.5">
            <Sparkles size={20} className={minimal ? "text-white/40" : "text-white/30"} strokeWidth={1.5} />
          </div>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything... (?K)"
            disabled={disabled}
            rows={1}
            className={`flex-1 resize-none outline-none max-h-32 text-base leading-relaxed bg-transparent z-10 ${
              minimal ? "text-white placeholder-white/30 font-light" : "text-white/90 placeholder-white/40"
            }`}
          />
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className={`p-2.5 rounded-full z-10 transition-all flex-shrink-0 self-end ${
              value.trim() && !disabled 
                ? "bg-white text-black hover:scale-105 shadow-[0_0_15px_rgba(255,255,255,0.3)] active:scale-95" 
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    )
  },
)
ChatInput.displayName = "ChatInput"

