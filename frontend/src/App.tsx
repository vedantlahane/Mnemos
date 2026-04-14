import { ContextProvider } from "./core/ContextProvider"
import Stream from "./core/Stream"
import CommandBar from "./core/CommandBar"
import CanvasOverlay from "./canvas/CanvasOverlay"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { AuthGate } from "./components/AuthGate"

/**
 * Z-index layers:
 *  z-10:  Canvas (Excalidraw)
 *  z-15:  Excalidraw  toolbar Islands
 *  z-20:  Stream (full page in home context)
 *  z-35:  Stream floating panel wrapper
 *  z-40:  CommandBar
 *  z-45:  Excalidraw text editor
 *  z-50:  Excalidraw dialogs/library
 *  z-55:  Excalidraw toasts
 *  z-70:  Modals
 *  z-100: Context menus, popovers
 */
export default function App() {
  return (
    <AuthGate>
      <ContextProvider>
        <ErrorBoundary>
          <div className="w-full h-full relative overflow-hidden bg-[var(--color-void)]">
            <ErrorBoundary>
              <CanvasOverlay />
            </ErrorBoundary>
            <ErrorBoundary>
              <Stream />
            </ErrorBoundary>
            <CommandBar />
          </div>
        </ErrorBoundary>
      </ContextProvider>
    </AuthGate>
  )
}