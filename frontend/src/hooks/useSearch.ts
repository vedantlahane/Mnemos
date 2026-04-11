import { useState, useCallback } from "react"
import { api } from "../api/client"
import type { Note } from "../types"

export function useSearch() {
  const [results, setResults] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setQuery(q)
    setLoading(true)
    setError(null)
    try {
      const data = await api.search(q)
      setResults(data.results)
    } catch (err) {
      setError("Search failed. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }, [])

  return { results, loading, error, query, search }
}
