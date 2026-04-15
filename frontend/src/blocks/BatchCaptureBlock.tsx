import { useState } from "react"
import { capture } from "../api/client"
import type { BlockItem } from "../types"
import { Send, CheckCircle2, AlertTriangle, Layers } from "lucide-react"

export default function BatchCaptureBlock(_props: { item: BlockItem }) {
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ count: number; error?: string } | null>(null)

  const handleBatch = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    setResult(null)

    try {
      const lines = text.split("\n").filter((line) => line.trim().length > 0)
      const items = lines.map((line) => ({ text: line.trim() }))
      const res = await capture.batch(items)
      setResult({ count: res.count })
      setText("")
    } catch (e: any) {
      setResult({ count: 0, error: e.message || "Batch capture failed" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="glass rounded-xl overflow-hidden border border-white/5 bg-[rgba(15,15,20,0.8)]">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5 bg-white/5">
        <Layers className="text-[var(--accent)]" size={16} />
        <h3 className="font-semibold text-sm">Batch Capture</h3>
      </div>
      
      <div className="p-4 flex flex-col gap-3">
        <p className="text-xs text-[var(--glass-text-dim)]">
          Enter multiple items, one per line. Each line will be captured as a separate block/note.
        </p>
        
        <textarea
          className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-[var(--glass-text-secondary)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-all font-mono"
          placeholder={"Item 1\nItem 2\nItem 3..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
        />

        <div className="flex justify-between items-center mt-1">
          <div>
            {result?.error && (
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertTriangle size={12} /> {result.error}
              </span>
            )}
            {result && !result.error && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 size={12} /> Captured {result.count} items sequentially.
              </span>
            )}
          </div>
          
          <button
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-subtle)] hover:bg-[var(--accent)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none"
            onClick={handleBatch}
            disabled={submitting || !text.trim()}
          >
            <Send size={14} />
            {submitting ? "Capturing..." : "Batch Capture"}
          </button>
        </div>
      </div>
    </div>
  )
}