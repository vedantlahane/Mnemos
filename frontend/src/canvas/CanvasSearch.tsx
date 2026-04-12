import { useRef, useEffect } from "react"
import { Search, X } from "lucide-react"

interface Props {
  isOpen: boolean
  query: string
  onSearch: (q: string) => void
  onClose: () => void
  matchCount: number
}

export default function CanvasSearch({ isOpen, query, onSearch, onClose, matchCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="absolute left-4 top-4 glass-surface-2 rounded-xl overflow-hidden shadow-xl z-10 w-72 flex items-center">
      <Search size={14} className="text-[var(--color-tertiary)] ml-3 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
        placeholder="Search canvas..."
        className="flex-1 bg-transparent px-3 py-2.5 text-[13px] text-white outline-none placeholder-[var(--color-tertiary)]"
      />
      {query && (
        <span className="text-[10px] text-[var(--color-secondary)] mr-2 shrink-0">
          {matchCount} found
        </span>
      )}
      <button
        onClick={onClose}
        className="p-2 text-[var(--color-tertiary)] hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}