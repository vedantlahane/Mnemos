import { useState, useEffect, useCallback } from "react"
import type { Node } from "@xyflow/react"

export function useCanvasSearch(
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
) {
  const [query, setQuery] = useState("")
  const [matchIds, setMatchIds] = useState<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)

  // Listen for canvas:search events from command system
  useEffect(() => {
    function onSearch(e: Event) {
      const detail = (e as CustomEvent).detail as string
      setQuery(detail)
      setIsOpen(true)
    }

    function onFocusSearch() {
      setIsOpen(true)
    }

    window.addEventListener("canvas:search", onSearch)
    window.addEventListener("canvas:focus-search", onFocusSearch)
    return () => {
      window.removeEventListener("canvas:search", onSearch)
      window.removeEventListener("canvas:focus-search", onFocusSearch)
    }
  }, [])

  // Search logic
  const search = useCallback(
    (q: string) => {
      setQuery(q)

      if (!q.trim()) {
        setMatchIds(new Set())
        // Remove highlights
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, highlighted: false },
          }))
        )
        return
      }

      const lower = q.toLowerCase()
      const matches = new Set<string>()

      nodes.forEach((node) => {
        const note = node.data?.note as any
        const content = node.data?.content as string
        const searchable = [
          note?.title,
          note?.summary,
          note?.raw_text,
          ...(note?.tags || []),
          content,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        if (searchable.includes(lower)) {
          matches.add(node.id)
        }
      })

      setMatchIds(matches)

      // Apply highlight data to matching nodes
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, highlighted: matches.has(n.id) },
        }))
      )
    },
    [nodes, setNodes]
  )

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery("")
    setMatchIds(new Set())
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, highlighted: false },
      }))
    )
  }, [setNodes])

  return {
    query,
    search,
    matchIds,
    matchCount: matchIds.size,
    isOpen,
    open: () => setIsOpen(true),
    close,
  }
}