import { useEffect, useRef, useState, useCallback } from "react"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import StreamMessage from "./StreamMessage"
import StreamBlock from "./StreamBlock"
import { Loader2, GripHorizontal, Minimize2, Maximize2, MessageCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export default function Stream() {
  const { items, isLoading } = useStream()
  const { current } = useAppContext()
  const endRef = useRef<HTMLDivElement>(null)
  const isCanvas = current.type === "page"

  const [collapsed, setCollapsed] = useState(false)
  const [maximized, setMaximized] = useState(false)

  // ─── Truly draggable position ───
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items.length, isLoading])

  // Reset on page switch
  useEffect(() => {
    if (isCanvas) {
      setCollapsed(false)
      setMaximized(false)
      setPos({ x: 0, y: 0 })
    }
  }, [isCanvas, current.pageId])

  // Global drag listeners
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      })
    }
    function onUp() { dragging.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const startDrag = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  // ═══════════════════════════
  //  HOME CONTEXT — full stream
  // ═══════════════════════════
  if (!isCanvas) {
    return (
      <div className="absolute inset-0 z-20 overflow-y-auto px-4 pt-10 pb-24">
        <div className="max-w-[660px] mx-auto flex flex-col gap-5">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
              >
                {item.type === "block" ? (
                  <StreamBlock item={item} />
                ) : item.type === "system" ? (
                  <div className="text-center text-[11px] text-[var(--glass-text-muted)] py-1.5 font-mono">
                    {item.content}
                  </div>
                ) : (
                  <StreamMessage item={item} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && <LoadingDots />}
          <div ref={endRef} />
        </div>
      </div>
    )
  }

  // ═══════════════════════════
  //  PAGE CONTEXT — collapsed bubble
  // ═══════════════════════════
  if (collapsed) {
    return (
      <motion.button
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        onClick={() => setCollapsed(false)}
        className="fixed bottom-20 right-6 z-20 glass rounded-full w-12 h-12 flex items-center justify-center glass-hover"
        style={{ left: pos.x || "auto", top: pos.y || "auto", right: pos.x ? "auto" : 24, bottom: pos.y ? "auto" : 80 }}
      >
        <MessageCircle size={18} className="text-[var(--accent-light)]" />
        {items.length > 1 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--accent)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {items.filter(i => i.type === "assistant").length}
          </span>
        )}
      </motion.button>
    )
  }

  // ═══════════════════════════
  //  PAGE CONTEXT — floating panel
  // ═══════════════════════════
  const panelStyle = maximized
    ? { top: 16, left: 16, right: 16, bottom: 80, width: "auto" as const }
    : { top: pos.y || 16, left: pos.x || "auto", right: pos.x ? "auto" : 16, width: 370, maxHeight: "calc(100vh - 120px)" }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", damping: 24, stiffness: 280 }}
      className="fixed z-20 glass-solid rounded-2xl flex flex-col overflow-hidden"
      style={panelStyle}
    >
      {/* ─── Header / Drag Handle ─── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--glass-border)] draggable shrink-0 relative z-10"
        onMouseDown={maximized ? undefined : startDrag}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={13} className="text-[var(--glass-text-muted)]" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--glass-text-dim)]">
            {current.pageName || "Chat"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMaximized(!maximized)}
            className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[var(--glass-text-muted)] hover:text-[var(--glass-text)] transition-colors"
          >
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[var(--glass-text-muted)] hover:text-[var(--glass-text)] transition-colors"
          >
            <Minimize2 size={12} />
          </button>
        </div>
      </div>

      {/* ─── Messages ─── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id}>
              {item.type === "system" ? (
                <div className="text-[10px] text-[var(--glass-text-muted)] text-center py-1 font-mono">
                  {item.content}
                </div>
              ) : item.type === "block" ? null : (
                <StreamMessage item={item} />
              )}
            </div>
          ))}
          {isLoading && <LoadingDots />}
          <div ref={endRef} />
        </div>
      </div>
    </motion.div>
  )
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Loader2 size={13} className="text-[var(--accent)] animate-spin" />
      <span className="text-[12px] text-[var(--glass-text-dim)]">Thinking…</span>
    </div>
  )
}