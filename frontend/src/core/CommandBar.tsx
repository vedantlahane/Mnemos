import { useRef } from "react"
import { Search } from "lucide-react"
import { useCommands } from "../hooks/useCommands"
import { useKeyboard } from "../hooks/useKeyboard"
import { useContext } from "../hooks/useContext"

export default function CommandBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  useKeyboard(inputRef)
  
  const { 
     inputValue, 
     handleInput, 
     suggestions, 
     selectedIndex, 
     setSelectedIndex, 
     handleSubmit 
  } = useCommands()

  const { current } = useContext()

  function getPlaceholder() {
     switch (current.type) {
        case "page": return `Search, add notes, or ask about ${current.pageName}...`
        case "settings": return "Change a setting or type to adjust..."
        case "history": return "Search past conversations..."
        default: return "Type a message or /command..."
     }
  }

  return (
    <div className="shrink-0 h-16 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(6,6,9,0.8)] backdrop-blur-md flex items-center justify-center relative z-30">
      <div className="w-[740px] max-w-full px-4 relative">
        {/* Autocomplete Dropdown */}
        {suggestions.length > 0 && (
           <div className="absolute bottom-full left-4 right-4 mb-2 bg-[rgba(20,20,30,0.85)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden shadow-2xl">
               {suggestions.map((cmd, i) => (
                  <div 
                     key={cmd.name}
                     onClick={() => {
                        handleInput(cmd.name + " ");
                        inputRef.current?.focus()
                     }}
                     className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${i === selectedIndex ? "bg-[rgba(255,255,255,0.06)]" : "hover:bg-[rgba(255,255,255,0.03)]"}`}
                     onMouseEnter={() => setSelectedIndex(i)}
                  >
                     <div className="flex items-center gap-3">
                        <span className="text-[14px] font-mono font-bold text-[var(--color-accent-blue)]">{cmd.name}</span>
                        {cmd.args && <span className="text-[12px] opacity-40 italic">{cmd.args}</span>}
                     </div>
                     <span className="text-[12px] text-[var(--color-secondary)]">{cmd.description}</span>
                  </div>
               ))}
           </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
          <div className="glass-interactive flex items-center px-4 py-2 rounded-xl transition-all focus-within:ring-1 focus-within:ring-[var(--color-accent-blue)]">
            <Search size={16} className="text-[var(--color-muted)] mr-3" />
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => {
                 if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex(s => Math.max(0, s - 1))
                 } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex(s => Math.min(suggestions.length - 1, s + 1))
                 } else if (e.key === "Tab" && suggestions.length > 0) {
                    e.preventDefault();
                    handleInput(suggestions[selectedIndex].name + " ")
                 }
              }}
              placeholder={getPlaceholder()}
              className="bg-transparent border-none outline-none text-[14px] text-[var(--color-primary)] placeholder-[var(--color-muted)] flex-1"
            />
            {inputValue && (
                <button type="submit" className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-accent-blue)] hover:text-[#60a5fa] ml-2">
                    Send
                </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
