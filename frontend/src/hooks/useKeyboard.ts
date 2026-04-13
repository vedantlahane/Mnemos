import { useEffect } from "react"
import { useAppContext } from "./useAppContext"

export function useKeyboard(
  inputRef: React.RefObject<HTMLInputElement | null>
) {
  const { goBack, current } = useAppContext()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement

      // Inside Excalidraw — only intercept ⌘K
      if (target?.closest(".excalidraw") || target?.closest("[data-excalidraw-host]")) {
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
          e.preventDefault()
          inputRef.current?.focus()
        }
        return
      }

      // ⌘K / Ctrl+K → focus command bar
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }

      // Escape — layered
      if (e.key === "Escape") {
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur()
          return
        }
        if (current.type !== "home") {
          goBack()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [inputRef, goBack, current])
}