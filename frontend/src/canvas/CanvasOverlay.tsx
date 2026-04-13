import { lazy, Suspense } from "react"
import { useAppContext } from "../hooks/useAppContext"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2 } from "lucide-react"

// Lazy-load Excalidraw — it's ~1MB, only needed on page context
const ExcalidrawCanvas = lazy(() => import("./ExcalidrawCanvas"))

function CanvasFallback() {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "#0e0e1a" }}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-[var(--accent)]" size={24} />
        <span className="text-[13px] text-[var(--glass-text-dim)]">
          Loading canvas…
        </span>
      </div>
    </div>
  )
}

export default function CanvasOverlay() {
  const { current } = useAppContext()

  return (
    <AnimatePresence>
      {current.type === "page" && current.pageId && (
        <motion.div
          key={current.pageId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 z-10"
        >
          <ErrorBoundary>
            <Suspense fallback={<CanvasFallback />}>
              <ExcalidrawCanvas pageId={current.pageId} />
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      )}
    </AnimatePresence>
  )
}