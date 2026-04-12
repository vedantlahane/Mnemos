import { useEffect } from "react"
import { useContext } from "./useContext"

export function useKeyboard(inputRef: React.RefObject<HTMLInputElement | null>) {
  const { goBack, current } = useContext()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K to focus search/command bar
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      
      // Escape to close contexts or clear focus
      if (e.key === 'Escape') {
        if (document.activeElement === inputRef.current) {
           inputRef.current?.blur()
        } else if (current.type !== 'home') {
           goBack()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [inputRef, goBack, current])
}
