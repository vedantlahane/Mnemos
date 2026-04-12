import { useEffect, useRef } from "react"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import StreamMessage from "./StreamMessage"
import StreamBlock from "./StreamBlock"
import { Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export default function Stream() {
  const { items, isLoading } = useStream()
  const { current } = useAppContext()
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new items
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items.length, isLoading])

  // In page context, stream is narrower (canvas takes space)
  const isPageContext = current.type === "page"

  return (
    <div
      className={`flex-1 overflow-y-auto px-4 pt-8 pb-4 ${
        isPageContext ? "absolute right-0 top-0 bottom-16 w-[380px] z-10 bg-[rgba(6,6,10,0.85)] backdrop-blur-xl border-l border-[rgba(255,255,255,0.06)]" : ""
      }`}
    >
      <div className={`${isPageContext ? "px-2" : "max-w-[740px] mx-auto"} flex flex-col gap-6`}>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
            >
              {item.type === "block" ? (
                <StreamBlock item={item} />
              ) : item.type === "system" ? (
                <div className="text-center text-[11px] text-[var(--color-tertiary)] py-2 font-mono">
                  {item.content}
                </div>
              ) : (
                <StreamMessage item={item} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 py-2"
          >
            <div className="w-6 h-6 rounded-full glass-surface-2 flex items-center justify-center">
              <Loader2 size={12} className="text-[var(--color-accent)] animate-spin" />
            </div>
            <span className="text-[13px] text-[var(--color-secondary)]">Thinking...</span>
          </motion.div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}