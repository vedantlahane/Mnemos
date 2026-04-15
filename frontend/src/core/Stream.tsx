import { useEffect, useRef, useState } from "react"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import StreamMessage from "./StreamMessage"
import StreamBlock from "./StreamBlock"
import LibraryPanel from "../components/LibraryPanel"
import { ErrorBoundary } from "../components/ErrorBoundary"
import {
  Loader2, Minimize2, Maximize2, MessageCircle, BookOpen, X, Search
} from "lucide-react"
import { motion, AnimatePresence, useDragControls } from "framer-motion"
import { useCanvasEvents } from "../hooks/useCanvasEvents"

export default function Stream() {
  const { items, isLoading, canvasIntent } = useStream()
  const { current } = useAppContext()
  const canvasDispatch = useCanvasEvents((s) => s.dispatch)
  const endRef = useRef<HTMLDivElement>(null)
  const isCanvas = current.type === "page"
  const pageItems = isCanvas
    ? items.filter(
        (item) => !(item.type === "block" && item.blockType === "welcome")
      )
    : items

  const [collapsed, setCollapsed] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [view, setView] = useState<"chat" | "library">("chat")
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  const dragControls = useDragControls()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items.length, isLoading])

  useEffect(() => {
    setCollapsed(false)
    setMaximized(false)
    setView("chat")
  }, [current.type, current.pageId])

  // Library is now rendered inline in the chat overlay via <LibraryPanel />,
  // so we no longer need to toggle Excalidraw's native sidebar.

  // ═══ HOME / SETTINGS / HISTORY — full-page stream ═══
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
                <ErrorBoundary>
                  <StreamItemRenderer item={item} />
                </ErrorBoundary>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && <LoadingDots />}
          <div ref={endRef} />
        </div>
      </div>
    )
  }

  // ═══ PAGE — collapsed FAB ═══
  if (collapsed) {
    const unreadCount = items.filter(
      (i) => i.type === "assistant" || i.type === "system"
    ).length
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed z-[60] flex items-center justify-center w-14 h-14 rounded-full shadow-2xl glass-solid"
        style={{
          bottom: 80,
          right: 20,
          boxShadow: "0 4px 24px rgba(99,102,241,0.4), 0 0 0 2px rgba(99,102,241,0.2)",
        }}
      >
        <MessageCircle size={20} className="text-[var(--accent-light)]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--accent)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>
    )
  }

  // ═══ PAGE — floating chat panel ═══
  const panelStyle = maximized
    ? { top: 12, left: 12, right: 12, bottom: 76 }
    : { top: 12, right: 12, width: 380, maxHeight: "calc(100vh - 100px)" }

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 35 }}>
      <motion.div
        drag={!maximized}
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className="pointer-events-auto glass-solid rounded-2xl flex flex-col overflow-hidden absolute"
        style={panelStyle}
      >
        {/* Header */}
        <div 
          onPointerDown={(e) => !maximized && dragControls.start(e)}
          className={`flex items-center justify-between px-3 py-2 border-b border-[var(--glass-border)] shrink-0 ${!maximized ? "cursor-grab active:cursor-grabbing select-none" : ""}`}
        >
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--glass-text-dim)] pointer-events-none">
            {view === "library" ? "📚 Excalidraw Library" : `💬 ${current.pageName || "Chat"}`}
          </span>
          <div className="flex items-center gap-1">
            {view === "library" ? (
              <button
                onClick={() => setView("chat")}
                className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[var(--glass-text-muted)] hover:text-[var(--accent-light)] transition-colors"
                title="Back to Chat"
              >
                <MessageCircle size={13} />
              </button>
            ) : (
              <button
                onClick={() => setView("library")}
                className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[var(--glass-text-muted)] hover:text-[var(--accent-light)] transition-colors"
                title="Open Excalidraw Library"
              >
                <BookOpen size={13} />
              </button>
            )}
            <button
              onClick={() => {
                setShowSearch(!showSearch);
                if (!showSearch) setSearchQuery("");
              }}
              className={`p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] transition-colors ${showSearch ? 'text-[var(--accent-light)]' : 'text-[var(--glass-text-muted)] hover:text-white'}`}
              title="Search Canvas"
            >
              <Search size={13} />
            </button>
            <button
              onClick={() => setMaximized(!maximized)}
              className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[var(--glass-text-muted)] hover:text-white transition-colors"
              title={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[var(--glass-text-muted)] hover:text-white transition-colors"
              title="Minimize"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Header Search Input */}
        <AnimatePresence>
          {showSearch && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-[var(--glass-border)] shrink-0"
            >
              <div className="px-3 py-2 flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Find on canvas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      canvasDispatch({ type: "search", query: searchQuery })
                    } else if (e.key === "Escape") {
                      setShowSearch(false)
                    }
                  }}
                  className="w-full bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-md px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[var(--accent)] transition-colors placeholder-[var(--glass-text-dim)]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages or Library Panel Hint */}
        <div 
          className="flex-1 overflow-y-auto px-3 py-3 min-h-0 relative"
        >
          {view === "chat" ? (
            <div className="flex flex-col gap-3">
              {canvasIntent && (
                <div className="text-[11px] uppercase tracking-wider text-[var(--accent-light)] bg-[var(--accent-subtle)] border border-[rgba(99,102,241,0.25)] rounded-full px-3 py-1 w-fit">
                  {canvasIntent === "compose" && "Writing..."}
                  {canvasIntent === "command" && "Executing..."}
                  {canvasIntent === "diagram" && "Drawing..."}
                  {canvasIntent === "arrange" && "Arranging..."}
                  {canvasIntent === "search" && "Searching..."}
                  {canvasIntent === "query" && "Thinking..."}
                  {!(["compose", "command", "diagram", "arrange", "search", "query"] as string[]).includes(canvasIntent) && canvasIntent}
                </div>
              )}

              {pageItems.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-[13px] font-semibold text-white mb-1.5">
                    {current.pageName || "Page"} Chat
                  </div>
                  <div className="text-[11px] text-[var(--glass-text-muted)] leading-relaxed mb-4">
                    Ask questions about notes on this page,<br />
                    or use commands to interact with the canvas.
                  </div>
                  <div className="flex flex-col gap-1.5 items-start mx-auto w-fit text-left">
                    {[
                      { cmd: "/find", desc: "search canvas" },
                      { cmd: "/add", desc: "add content" },
                      { cmd: "/layout", desc: "AI reorganize" },
                      { cmd: "/summarize", desc: "page summary" },
                    ].map((h) => (
                      <div key={h.cmd} className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-[var(--accent-light)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded">
                          {h.cmd}
                        </code>
                        <span className="text-[10px] text-[var(--glass-text-muted)]">{h.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pageItems.map((item) => (
                <ErrorBoundary key={item.id}>
                  <StreamItemRenderer item={item} />
                </ErrorBoundary>
              ))}
              {isLoading && <LoadingDots />}
              <div ref={endRef} />
            </div>
          ) : (
            <ErrorBoundary>
              <LibraryPanel />
            </ErrorBoundary>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function StreamItemRenderer({ item }: { item: import("../types").StreamItem }) {
  switch (item.type) {
    case "system":
      return (
        <div className="text-center text-[11px] text-[var(--glass-text-muted)] py-1.5 font-mono">
          {item.content}
        </div>
      )
    case "block":
      return <StreamBlock item={item} />
    case "user":
    case "assistant":
      return <StreamMessage item={item} />
    default:
      return null
  }
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Loader2 size={13} className="text-[var(--accent)] animate-spin" />
      <span className="text-[12px] text-[var(--glass-text-dim)]">Thinking…</span>
    </div>
  )
}