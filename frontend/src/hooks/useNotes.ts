import { useEffect, useState, useCallback } from "react"
import { api } from "../api/client"
import type { Note } from "../types"

export function useNotes(tag: string | null = null) {
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listNotes(page, 20, tag || undefined)
      setNotes(data.notes)
      setTotal(data.total)
    } catch (err) {
      setError("Can't connect to Mnemos. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }, [page, tag])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  // Reset page when tag changes
  useEffect(() => {
    setPage(1)
  }, [tag])

  return { notes, total, page, setPage, loading, error, refetch: fetchNotes }
}
