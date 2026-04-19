import { useEffect, type RefObject } from "react"

/**
 * Cmd/Ctrl+K → focus chat input
 * Escape → close panel
 */
export function useKeyboard(
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  onEscape?: () => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape") {
        onEscape?.()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [inputRef, onEscape])
}