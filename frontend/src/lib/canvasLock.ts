// === FILE: frontend/src/lib/canvasLock.ts ===

/**
 * Canvas lock — prevents onChange → sync feedback loops.
 * Uses a monotonic counter instead of timers for reliability.
 *
 * Flow:
 *   1. Before programmatic updateScene() → lockCanvas()
 *   2. Excalidraw fires onChange → isCanvasLocked() returns true → skip
 *   3. Timer expires → unlocked → user edits flow through
 */

let _lockVersion = 0
let _activeVersion = 0
let _timer: ReturnType<typeof setTimeout> | null = null

export function lockCanvas(ms = 600) {
  _lockVersion++
  _activeVersion = _lockVersion
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(() => {
    // Only unlock if no newer lock was acquired
    if (_activeVersion === _lockVersion) {
      _activeVersion = 0
    }
    _timer = null
  }, ms)
}

export function unlockCanvas() {
  _activeVersion = 0
  _lockVersion++
  if (_timer) {
    clearTimeout(_timer)
    _timer = null
  }
}

export function isCanvasLocked(): boolean {
  return _activeVersion > 0
}