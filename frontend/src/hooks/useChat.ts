import { useState, useCallback } from "react"
import { api } from "../api/client"
import type { ChatMessage } from "../types"

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (question: string) => {
      // Add user message
      const userMessage: ChatMessage = { role: "user", content: question }
      setMessages((prev) => [...prev, userMessage])
      setLoading(true)
      setError(null)

      try {
        // Build history from existing messages
        const history = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const data = await api.chat(question, history)

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        setError("Failed to get response. Is the backend running?")
      } finally {
        setLoading(false)
      }
    },
    [messages]
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, loading, error, sendMessage, clearChat }
}
