import { useEffect, useState } from "react"
import { api } from "../api/client"
import type { ChatConversation } from "../types"
import { MessageSquare, Loader2, Trash2 } from "lucide-react"

export default function HistoryBlock() {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listHistory(20)
      .then((res) => setConversations(res.conversations || res || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    try {
      await api.deleteHistory(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-[var(--color-tertiary)]" size={20} />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="glass-surface-1 p-6 rounded-2xl text-[13px] text-[var(--color-secondary)]">
        No chat history yet. Start a conversation to see it here.
      </div>
    )
  }

  // Group by date
  const grouped = conversations.reduce<Record<string, ChatConversation[]>>((acc, c) => {
    const date = new Date(c.created_at).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(c)
    return acc
  }, {})

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-tertiary)] mb-4">
        Chat History
      </div>

      {Object.entries(grouped).map(([date, convos]) => (
        <div key={date} className="mb-4">
          <div className="text-[11px] text-[var(--color-tertiary)] font-semibold mb-2">{date}</div>
          {convos.map((c) => (
            <div
              key={c.id}
              className="glass-surface-2 p-3 rounded-xl mb-2 flex items-center justify-between glass-hover"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare size={14} className="text-[var(--color-accent)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] text-white truncate">
                    {c.title || c.messages?.[0]?.content?.slice(0, 50) || "Untitled conversation"}
                  </div>
                  <div className="text-[10px] text-[var(--color-tertiary)]">
                    {c.messages?.length || 0} messages • {c.context_type}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-[var(--color-tertiary)] hover:text-[var(--color-error)] transition-colors p-1"
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