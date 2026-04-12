import { useEffect } from "react"
import { useAppContext } from "./useAppContext"

export function useKeyboard(inputRef: React.RefObject<HTMLInputElement | null>) {
  const { goBack, current } = useAppContext()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K to focus command bar
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }

      // Ctrl+F in page context → focus canvas search instead of browser search
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && current.type === "page") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("canvas:focus-search"))
      }

      // Escape — layered behavior
      if (e.key === "Escape") {
        // If input is focused, blur it first
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur()
          return
        }
        // If in a non-home context, go back
        if (current.type !== "home") {
          goBack()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [inputRef, goBack, current])
}