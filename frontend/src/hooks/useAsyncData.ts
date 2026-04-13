import { useState, useEffect, useCallback, useRef } from "react"

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Universal async data hook. Replaces every manual useState+useEffect+loading pattern.
 * Handles:
 *  - Cancellation on unmount
 *  - StrictMode double-mount
 *  - Error states
 *  - Refetch
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: { immediate?: boolean } = { immediate: true }
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(options.immediate !== false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const fetchIdRef = useRef(0)

  const execute = useCallback(async () => {
    const fetchId = ++fetchIdRef.current
    setLoading(true)
    setError(null)

    try {
      const result = await fetcher()
      if (mountedRef.current && fetchId === fetchIdRef.current) {
        setData(result)
      }
    } catch (err) {
      if (mountedRef.current && fetchId === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : "Unknown error")
      }
    } finally {
      if (mountedRef.current && fetchId === fetchIdRef.current) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mountedRef.current = true
    if (options.immediate !== false) {
      execute()
    }
    return () => {
      mountedRef.current = false
    }
  }, [execute, options.immediate])

  return { data, loading, error, refetch: execute }
}