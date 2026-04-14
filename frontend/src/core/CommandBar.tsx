import { useRef } from "react"
import { Search, ArrowUp, Command } from "lucide-react"
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
    handleSuggestionClick,
    suggestions,
    selectedIndex,
    setSelectedIndex,
    handleSubmit,
  } = useCommands()
  const { current } = useAppContext()

  const placeholder =
    current.type === "page"
      ? `Ask about ${current.pageName || "this page"}, /command…`
      : current.type === "settings"
        ? "Adjust a setting…"
        : "Ask anything or type / for commands…"

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[560px] max-w-[calc(100vw-40px)]">
      {/* Autocomplete dropdown */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="glass-solid rounded-2xl mb-2 overflow-hidden relative"
          >
            <div className="max-h-[280px] overflow-y-auto overscroll-contain py-1">
              {suggestions.map((cmd, i) => (
                <div
                  key={cmd.name}
                  onClick={() => {
                    void handleSuggestionClick(cmd)
                    inputRef.current?.focus()
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`px-4 py-2 mx-1 rounded-lg flex items-center justify-between cursor-pointer transition-colors relative z-10 ${
                    i === selectedIndex
                      ? "bg-[var(--accent-subtle)]"
                      : "hover:bg-[rgba(255,255,255,0.04)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[13px] font-mono font-semibold text-[var(--accent-light)] shrink-0">
                      {cmd.name}
                    </span>
                    {cmd.args && (
                      <span className="text-[11px] text-[var(--glass-text-muted)] italic truncate">
                        {cmd.args}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--glass-text-dim)] shrink-0 ml-4 text-right">
                    {cmd.description}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input pill */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <div className="glass cmd-glow rounded-2xl flex items-center px-4 py-3 gap-3 relative transition-all focus-within:border-[rgba(99,102,241,0.25)]">
          <Search
            size={15}
            className="text-[var(--glass-text-muted)] shrink-0 relative z-10"
          />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={(e) => {
              if (suggestions.length > 0) {
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setSelectedIndex((s: number) => Math.max(0, s - 1))
                } else if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setSelectedIndex((s: number) =>
                    Math.min(suggestions.length - 1, s + 1)
                  )
                } else if (e.key === "Tab") {
                  e.preventDefault()
                  handleInput(suggestions[selectedIndex].name + " ")
                }
              }
            }}
            placeholder={placeholder}
            className="bg-transparent border-none outline-none text-[14px] text-[var(--glass-text)] placeholder-[var(--glass-text-muted)] flex-1 min-w-0 relative z-10"
            autoComplete="off"
            spellCheck={false}
          />
          {inputValue.trim() ? (
            <button
              type="submit"
              className="w-8 h-8 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] flex items-center justify-center transition-colors shrink-0 relative z-10"
            >
              <ArrowUp size={14} className="text-white" />
            </button>
          ) : (
            <kbd className="text-[10px] font-mono text-[var(--glass-text-muted)] bg-[rgba(255,255,255,0.05)] px-2 py-1 rounded-md flex items-center gap-1 shrink-0 relative z-10">
              <Command size={10} /> K
            </kbd>
          )}
        </div>
      </form>
    </div>
  )
}