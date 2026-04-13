import { useAsyncData } from "../hooks/useAsyncData"
import { api } from "../api/client"
import { AsyncBlock } from "../components/AsyncBlock"
import type { ChatConversation, BlockItem } from "../types"
import { MessageSquare, Trash2 } from "lucide-react"
import { useState } from "react"

export default function HistoryBlock(_props: { item: BlockItem }) {
  const { data, loading, error, refetch } = useAsyncData(
    () => api.listHistory(20).then((r) => r.conversations),
    []
  )

  return (
    <AsyncBlock
      data={data}
      loading={loading}
      error={error}
      empty={data?.length === 0}
      emptyMessage="No chat history yet."
      loadingMessage="Loading history…"
    >
      {(conversations) => (
        <HistoryContent conversations={conversations} onRefetch={refetch} />
      )}
    </AsyncBlock>
  )
}

function HistoryContent({
  conversations,
  onRefetch,
}: {
  conversations: ChatConversation[]
  onRefetch: () => void
}) {
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api.deleteHistory(id)
      onRefetch()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(null)
    }
  }

  // Group by date
  const grouped = conversations.reduce<Record<string, ChatConversation[]>>(
    (acc, c) => {
      const date = new Date(c.created_at).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
      if (!acc[date]) acc[date] = []
      acc[date].push(c)
      return acc
    },
    {}
  )

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-4">
        Chat History
      </div>

      {Object.entries(grouped).map(([date, convos]) => (
        <div key={date} className="mb-4">
          <div className="text-[11px] text-[var(--glass-text-muted)] font-semibold mb-2">
            {date}
          </div>
          {convos.map((c) => (
            <div
              key={c.id}
              className="glass-surface-2 p-3 rounded-xl mb-2 flex items-center justify-between glass-hover"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare
                  size={14}
                  className="text-[var(--accent)] shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[13px] text-white truncate">
                    {c.title ||
                      c.messages?.[0]?.content?.slice(0, 50) ||
                      "Untitled"}
                  </div>
                  <div className="text-[10px] text-[var(--glass-text-muted)]">
                    {c.messages?.length || 0} messages • {c.context_type}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deleting === c.id}
                className="text-[var(--glass-text-muted)] hover:text-[var(--red)] transition-colors p-1 disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}