import { useEffect, type RefObject } from "react"

/**
 * Cmd/Ctrl+K → focus chat input
 */
export function useKeyboard(
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [inputRef])
}