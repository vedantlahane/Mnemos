// === FILE: frontend/src/lib/canvasLock.ts ===

/**
 * Shared lock to prevent onChange → sync loops during programmatic scene updates.
 * Both Canvas.tsx and useCanvas.ts import this.
 * Using a module-level flag (not React state) because:
 *   - It must be synchronous (checked inside Excalidraw's onChange hot path)
 *   - It must NOT trigger re-renders
 *   - It must be shared across components
 */

let _locked = false
let _timer: ReturnType<typeof setTimeout> | null = null

/** Lock the canvas — any onChange during this window is ignored */
export function lockCanvas(ms = 600) {
  _locked = true
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(() => {
    _locked = false
    _timer = null
  }, ms)
}

/** Force-unlock (e.g. on workspace change) */
export function unlockCanvas() {
  _locked = false
  if (_timer) {
    clearTimeout(_timer)
    _timer = null
  }
}

/** Check if canvas is currently locked */
export function isCanvasLocked(): boolean {
  return _locked
}