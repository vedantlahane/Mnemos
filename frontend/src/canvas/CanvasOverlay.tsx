import { useAppContext } from "../hooks/useAppContext"
import CanvasView from "./CanvasView"
import { motion, AnimatePresence } from "framer-motion"

export default function CanvasOverlay() {
  const { current } = useAppContext()
  const isOpen = current.type === "page" && !!current.pageId

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute inset-0 z-0"
        >
          <CanvasView pageId={current.pageId!} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}