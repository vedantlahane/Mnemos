/**
 * Applies CanvasOp updates to Excalidraw.
 * Includes explicit handlers for all Mnemos v2.0 op types.
 */

import type { CanvasOp } from "../types"

type ExcalidrawLikeApi = {
  updateScene: (scene: Record<string, unknown>) => void
  getSceneElements: () => ReadonlyArray<Record<string, unknown>>
  getAppState: () => Record<string, unknown>
  scrollToContent: (target?: any, options?: any) => void
}

const streamBuffers = new Map<string, { text: string; x: number; y: number }>()

export class CanvasApplier {
  private api: ExcalidrawLikeApi

  constructor(api: ExcalidrawLikeApi) {
    this.api = api
    this.ensureSceneElementShape()
  }

  apply(op: CanvasOp): void {
    try {
      this.ensureSceneElementShape()

      switch (op.op) {
        case "create_note":
          this.handleCreateNote(op)
          break
        case "create_text":
          this.handleCreateText(op)
          break
        case "create_diagram":
          this.handleCreateDiagram(op)
          break
        case "create_sticky":
          this.handleCreateSticky(op)
          break
        case "update_element":
          this.handleUpdateElement(op)
          break
        case "move_element":
          this.handleMoveElement(op)
          break
        case "delete_element":
          this.handleDeleteElement(op)
          break
        case "group_elements":
          this.handleGroupElements(op)
          break
        case "create_edge_line":
          this.handleCreateEdgeLine(op)
          break
        case "set_background":
          this.handleSetBackground(op)
          break
        case "set_theme":
          this.handleSetTheme(op)
          break
        case "pan_to":
          this.handlePanTo(op)
          break
        case "zoom_to":
          this.handleZoomTo(op)
          break
        case "stream_start":
          this.handleStreamStart(op)
          break
        case "stream_chunk":
          this.handleStreamChunk(op)
          break
        case "stream_end":
          this.handleStreamEnd(op)
          break
        case "arrange_cluster":
          this.handleArrangeCluster(op)
          break
        case "batch":
          this.handleBatch(op)
          break
        case "info":
          this.handleInfo(op)
          break
        case "error":
          this.handleError(op)
          break
        case "done":
          this.handleDone(op)
          break
        default:
          // No-op for unknown extension ops.
          break
      }
    } catch (error) {
      console.error("Canvas op apply failed", op, error)
    }
  }

  private handleCreateNote(op: CanvasOp): void {
    // Note cards are generated server-side with full customData conventions.
    // Refresh scene instead of re-building cards client-side.
    this.refreshScene()

    if (op.x !== undefined && op.y !== undefined) {
      this.focusRegionAfterRefresh(op.x, op.y, op.width || 420, op.height || 280)
    }
  }

  private handleCreateText(op: CanvasOp): void {
    // Backend persists measured text before emitting final op.
    this.refreshScene()
    if (op.x !== undefined && op.y !== undefined) {
      this.focusRegionAfterRefresh(op.x, op.y, op.width || 600, op.height || 240)
    }
  }

  private handleCreateDiagram(op: CanvasOp): void {
    // Diagram nodes/arrows are persisted by backend scene manager.
    this.refreshScene()
    this.focusRegionAfterRefresh(op.x || 100, op.y || 100, op.width || 700, op.height || 420)
  }

  private handleCreateSticky(_op: CanvasOp): void {
    // Sticky payloads are also authoritative server-side.
    this.refreshScene()
  }

  private handleUpdateElement(_op: CanvasOp): void {
    // Server may update style/content; safest option is to refresh authoritative scene.
    this.refreshScene()
  }

  private handleMoveElement(op: CanvasOp): void {
    if (op.x == null || op.y == null) {
      return
    }

    const current = this.api.getSceneElements()
    const frame = current.find((el) => {
      if (op.element_id && el.id === op.element_id) {
        return true
      }
      const customData = el.customData as Record<string, unknown> | undefined
      return op.note_id && customData?.noteId === op.note_id && customData?.type === "note-frame"
    })

    if (!frame) {
      // If we cannot map locally, fall back to server refresh.
      this.refreshScene()
      return
    }

    const sourceX = typeof frame.x === "number" ? frame.x : 0
    const sourceY = typeof frame.y === "number" ? frame.y : 0
    const dx = op.x - sourceX
    const dy = op.y - sourceY

    const updated = current.map((el) => {
      if (op.element_id && el.id === op.element_id) {
        return { ...el, x: (typeof el.x === "number" ? el.x : 0) + dx, y: (typeof el.y === "number" ? el.y : 0) + dy }
      }

      const customData = el.customData as Record<string, unknown> | undefined
      if (op.note_id && customData?.noteId === op.note_id) {
        return { ...el, x: (typeof el.x === "number" ? el.x : 0) + dx, y: (typeof el.y === "number" ? el.y : 0) + dy }
      }

      return el
    })

    this.api.updateScene({ elements: updated })
  }

  private handleDeleteElement(op: CanvasOp): void {
    const updated = this.api.getSceneElements().map((el) => {
      if (op.element_id && el.id === op.element_id) {
        return { ...el, isDeleted: true }
      }

      const customData = el.customData as Record<string, unknown> | undefined
      if (op.note_id && customData?.noteId === op.note_id) {
        return { ...el, isDeleted: true }
      }

      return el
    })

    this.api.updateScene({ elements: updated })
  }

  private handleGroupElements(_op: CanvasOp): void {
    // Grouping is computed/persisted on backend for note-card conventions.
    this.refreshScene()
  }

  private handleCreateEdgeLine(_op: CanvasOp): void {
    // Edge visualization is server-managed; reload for consistency.
    this.refreshScene()
  }

  private handleSetBackground(op: CanvasOp): void {
    if (!op.color) {
      return
    }
    this.api.updateScene({ appState: { viewBackgroundColor: op.color } })
  }

  private handleSetTheme(op: CanvasOp): void {
    if (op.theme !== "light" && op.theme !== "dark") {
      return
    }
    this.api.updateScene({ appState: { theme: op.theme } })
  }

  private handlePanTo(op: CanvasOp): void {
    if (op.x == null || op.y == null || this.isEditingActive()) {
      return
    }

    const nearby = this.api.getSceneElements().filter((el) => {
      const ex = typeof el.x === "number" ? el.x : 0
      const ey = typeof el.y === "number" ? el.y : 0
      return Math.abs(ex - op.x!) < 320 && Math.abs(ey - op.y!) < 320
    })

    if (nearby.length === 0) {
      return
    }

    this.api.scrollToContent(nearby, { fitToContent: true, animate: true, duration: 420 })
  }

  private handleZoomTo(op: CanvasOp): void {
    if (op.zoom == null) {
      return
    }
    this.api.updateScene({ appState: { zoom: { value: op.zoom } } })
  }

  private handleStreamStart(op: CanvasOp): void {
    if (!op.element_id) {
      return
    }
    streamBuffers.set(op.element_id, {
      text: "",
      x: op.x ?? 100,
      y: op.y ?? 100,
    })
  }

  private handleStreamChunk(op: CanvasOp): void {
    if (!op.element_id) {
      return
    }
    const existing = streamBuffers.get(op.element_id)
    if (!existing) {
      return
    }
    existing.text += op.text || ""
  }

  private handleStreamEnd(op: CanvasOp): void {
    if (!op.element_id) {
      return
    }

    const existing = streamBuffers.get(op.element_id)
    streamBuffers.delete(op.element_id)

    this.refreshScene()
    this.focusRegionAfterRefresh(
      existing?.x ?? op.x ?? 100,
      existing?.y ?? op.y ?? 100,
      op.width || 640,
      op.height || 260,
    )
  }

  private handleArrangeCluster(_op: CanvasOp): void {
    // All coordinates changed server-side.
    this.refreshScene()
  }

  private handleBatch(op: CanvasOp): void {
    if (!Array.isArray(op.operations)) {
      return
    }
    for (const nested of op.operations) {
      this.apply(nested)
    }
  }

  private handleInfo(op: CanvasOp): void {
    const metadata = (op.metadata || {}) as Record<string, unknown>

    if (typeof metadata.navigate_to_page === "string") {
      window.dispatchEvent(
        new CustomEvent("mnemos:navigate", {
          detail: { pageId: metadata.navigate_to_page },
        }),
      )
      return
    }

    if (typeof op.message === "string" && op.message.startsWith("navigate_to_page:")) {
      const pageId = op.message.slice("navigate_to_page:".length).trim()
      if (pageId) {
        window.dispatchEvent(new CustomEvent("mnemos:navigate", { detail: { pageId } }))
      }
    }
  }

  private handleError(op: CanvasOp): void {
    if (op.message) {
      console.error("Canvas stream op error:", op.message)
    }
  }

  private handleDone(_op: CanvasOp): void {
    // Explicit no-op: stream completion is handled by caller state.
  }

  private refreshScene(): void {
    window.dispatchEvent(new CustomEvent("mnemos:refresh-canvas"))
  }

  private focusRegionAfterRefresh(x: number, y: number, width: number, height: number): void {
    let attempts = 0
    const maxAttempts = 10

    const run = (): void => {
      if (this.isEditingActive()) {
        attempts += 1
        if (attempts < maxAttempts) {
          setTimeout(run, 140)
        }
        return
      }

      const padding = 100
      const left = x - padding
      const top = y - padding
      const right = x + width + padding
      const bottom = y + height + padding

      const withinRegion = this.api.getSceneElements().filter((el) => {
        if (el.isDeleted) {
          return false
        }
        const ex = typeof el.x === "number" ? el.x : 0
        const ey = typeof el.y === "number" ? el.y : 0
        const ew = typeof el.width === "number" ? el.width : 0
        const eh = typeof el.height === "number" ? el.height : 0
        return ex <= right && ex + ew >= left && ey <= bottom && ey + eh >= top
      })

      if (withinRegion.length > 0) {
        this.api.scrollToContent(withinRegion, {
          fitToContent: true,
          animate: true,
          duration: 380,
        })
        return
      }

      attempts += 1
      if (attempts < maxAttempts) {
        setTimeout(run, 140)
      }
    }

    setTimeout(run, 140)
  }

  private isEditingActive(): boolean {
    const appState = this.api.getAppState()
    return Boolean(
      appState.editingTextElement ||
      appState.editingLinearElement ||
      appState.editingGroupId ||
      appState.editingFrame,
    )
  }

  private ensureSceneElementShape(): void {
    const current = this.api.getSceneElements()
    if (!Array.isArray(current) || current.length === 0) {
      return
    }

    let changed = false
    const normalized = current.map((el) => {
      const next = { ...el }

      if (!Array.isArray(next.groupIds)) {
        next.groupIds = []
        changed = true
      }

      if (next.frameId === undefined) {
        next.frameId = null
        changed = true
      }

      if (!next.customData || typeof next.customData !== "object") {
        next.customData = {}
        changed = true
      }

      return next
    })

    if (changed) {
      this.api.updateScene({ elements: normalized })
    }
  }
}
