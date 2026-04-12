import { useState } from "react"
export function useCanvasSearch() {
  const [query, setQuery] = useState("")
  return { query, setQuery }
}
