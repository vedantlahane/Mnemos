import { useRef } from "react"
import { Search, ArrowUp } from "lucide-react"
import { useCommands } from "../hooks/useCommands"
import { useKeyboard } from "../hooks/useKeyboard"
import { useAppContext } from "../hooks/useAppContext"
import { motion, AnimatePresence } from "framer-motion"

export default function CommandBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  useKeyboard(inputRef)

  const {
    inputValue,
    handleInput,
    suggestions,
    selectedIndex,
    setSelectedIndex,
    handleSubmit,
  } = useCommands()

  const { current } = useAppContext()

  function getPlaceholder() {
    switch (current.type) {
      case "page":
        return `Search, add notes, or ask about ${current.pageName || "this page"}...`
      case "settings":
        return "Change a setting or type to adjust..."
      case "history":
        return "Search past conversations..."
      default:
        return "Type a message or /command..."
    }
  }

  return (
    <div className="shrink-0 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(6,6,10,0.85)] backdrop-blur-2xl flex items-center justify-center relative z-30 px-4 py-3">
      <div className="w-[740px] max-w-full relative">
        {/* ─── Autocomplete Dropdown ─── */}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 right-0 mb-2 glass-surface-2 rounded-xl overflow-hidden shadow-2xl"
            >
              {suggestions.map((cmd, i) => (
                <div
                  key={cmd.name}
                  onClick={() => {
                    handleInput(cmd.name + " ")
                    inputRef.current?.focus()
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    i === selectedIndex
                      ? "bg-[rgba(99,102,241,0.08)]"
                      : "hover:bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-mono font-semibold text-[var(--color-accent)]">
                      {cmd.name}
                    </span>
                    {cmd.args && (
                      <span className="text-[11px] text-[var(--color-tertiary)] italic">
                        {cmd.args}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--color-secondary)]">
                    {cmd.description}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Input Bar ─── */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
        >
          <div className="glass-surface-3 flex items-center px-4 py-2.5 rounded-xl command-breathe transition-all focus-within:glass-glow-active">
            <Search size={15} className="text-[var(--color-tertiary)] mr-3 shrink-0" />
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && suggestions.length > 0) {
                  e.preventDefault()
                  setSelectedIndex((s: number) => Math.max(0, s - 1))
                } else if (e.key === "ArrowDown" && suggestions.length > 0) {
                  e.preventDefault()
                  setSelectedIndex((s: number) =>
                    Math.min(suggestions.length - 1, s + 1)
                  )
                } else if (e.key === "Tab" && suggestions.length > 0) {
                  e.preventDefault()
                  handleInput(suggestions[selectedIndex].name + " ")
                }
              }}
              placeholder={getPlaceholder()}
              className="bg-transparent border-none outline-none text-[14px] text-[var(--color-primary)] placeholder-[var(--color-tertiary)] flex-1 min-w-0"
              autoComplete="off"
              spellCheck={false}
            />
            {inputValue.trim() && (
              <button
                type="submit"
                className="w-7 h-7 rounded-lg bg-[var(--color-accent-dim)] hover:bg-[var(--color-accent)] flex items-center justify-center ml-2 transition-colors shrink-0"
              >
                <ArrowUp size={14} className="text-white" />
              </button>
            )}
          </div>
        </form>

        {/* ─── Keyboard hint ─── */}
        <div className="flex justify-center mt-1.5">
          <span className="text-[10px] text-[var(--color-tertiary)]">
            <kbd className="font-mono bg-[rgba(255,255,255,0.05)] px-1 py-0.5 rounded text-[9px]">
              ⌘K
            </kbd>{" "}
            to focus •{" "}
            <kbd className="font-mono bg-[rgba(255,255,255,0.05)] px-1 py-0.5 rounded text-[9px]">
              /
            </kbd>{" "}
            for commands •{" "}
            <kbd className="font-mono bg-[rgba(255,255,255,0.05)] px-1 py-0.5 rounded text-[9px]">
              ESC
            </kbd>{" "}
            to close
          </span>
        </div>
      </div>
    </div>
  )
}