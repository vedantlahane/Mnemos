import type { ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface GlassModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function GlassModal({ isOpen, onClose, title, children }: GlassModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass-surface-2 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-[var(--glass-border)]">
              <h3 className="font-semibold text-white text-[15px]">{title}</h3>
              <button
                onClick={onClose}
                className="text-[var(--glass-text-muted)] hover:text-white transition-colors w-7 h-7 rounded-lg hover:bg-[rgba(255,255,255,0.05)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}