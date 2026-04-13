import { type ReactNode } from "react"
import { Loader2, AlertCircle, Inbox } from "lucide-react"

interface AsyncBlockProps<T> {
  data: T | null
  loading: boolean
  error: string | null
  empty?: boolean
  emptyMessage?: string
  loadingMessage?: string
  children: (data: T) => ReactNode
}

/**
 * Unified loading/error/empty wrapper for all block components.
 */
export function AsyncBlock<T>({
  data,
  loading,
  error,
  empty = false,
  emptyMessage = "Nothing found.",
  loadingMessage = "Loading…",
  children,
}: AsyncBlockProps<T>) {
  if (loading) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl flex items-center gap-3">
        <Loader2 className="animate-spin text-[var(--accent)]" size={18} />
        <span className="text-[13px] text-[var(--glass-text-dim)]">
          {loadingMessage}
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl flex items-center gap-3">
        <AlertCircle className="text-[var(--red)]" size={18} />
        <span className="text-[13px] text-[var(--red)]">{error}</span>
      </div>
    )
  }

  if (!data || empty) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl flex items-center gap-3 text-[var(--glass-text-dim)]">
        <Inbox size={18} />
        <span className="text-[13px]">{emptyMessage}</span>
      </div>
    )
  }

  return <>{children(data)}</>
}