import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { useChat } from "../hooks/useChat"
import type { ChatMessage } from "../types"
import EmptyState from "../components/EmptyState"

export default function Chat() {
  const { messages, loading, error, sendMessage, clearChat } = useChat()
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    sendMessage(input.trim())
    setInput("")
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-100">Chat with Notes</h1>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.length === 0 && !loading && (
          <EmptyState
            icon="💬"
            title="Ask anything about your saved knowledge"
            description="Your questions will be answered using your captured notes, with sources cited."
          />
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm pl-4">
            <div className="animate-pulse">●</div>
            <div className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</div>
            <div className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</div>
            <span className="ml-1">Thinking...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800/30 text-red-400 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your notes..."
          disabled={loading}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-slate-800 border border-slate-700 text-slate-200"
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-700/50">
            <p className="text-[11px] text-slate-400 mb-1.5">Sources:</p>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source) => (
                <Link
                  key={source.id}
                  to={`/note/${source.id}`}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-700/50 text-indigo-300 hover:bg-slate-700 transition-colors"
                >
                  {source.title || "Untitled"}{" "}
                  <span className="text-slate-500">
                    ({Math.round(source.similarity * 100)}%)
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
