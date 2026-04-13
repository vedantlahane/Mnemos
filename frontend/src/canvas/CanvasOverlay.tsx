import { useAppContext } from "../hooks/useAppContext"
import ExcalidrawCanvas from "./ExcalidrawCanvas"
import { motion, AnimatePresence } from "framer-motion"

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
          <ExcalidrawCanvas pageId={current.pageId} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
