/**
 * useNotebookMode — constrains Excalidraw into a vertical-scroll notebook.
 *
 * When active:
 *  1. Elements are grouped and stacked vertically in a centered column
 *  2. Horizontal scroll is locked
 *  3. Text elements are reflowed to fit column width via pretext
 *  4. New content is placed at the bottom of the column
 *  5. Window resize triggers re-layout
 */

import { useCallback, useEffect, useRef } from "react"
import { layoutText } from "../canvas/canvasAI"

// ── Types ─────────────────────────────────────────

type ExcalidrawAPI = {
  updateScene: (scene: Record<string, unknown>) => void
  getSceneElements: () => readonly ExcalidrawEl[]
  getAppState: () => Record<string, unknown>
  scrollToContent: (el: unknown, opts?: Record<string, unknown>) => void
}

type ExcalidrawEl = Record<string, unknown> & {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  groupIds?: string[]
  customData?: Record<string, unknown>
  text?: string
  originalText?: string
  fontSize?: number
  fontFamily?: number
  containerId?: string | null
}

export interface ColumnBounds {
  centerX: number
  left: number
  maxTextWidth: number
  width: number
}

interface LayoutBlock {
  elements: ExcalidrawEl[]
  bbox: { x: number; y: number; w: number; h: number }
  groupId: string | null
  anchorId: string
  /** Whether this block contains reflowable text */
  hasText: boolean
}

// ── Constants ─────────────────────────────────────

const COLUMN_PAD_LEFT = 48
const COLUMN_PAD_RIGHT = 48
const BLOCK_GAP = 24
const COLUMN_TOP = 80

// ── Helpers ───────────────────────────────────────

function getCustom(el: ExcalidrawEl): Record<string, unknown> {
  return (el.customData && typeof el.customData === "object" ? el.customData : {}) as Record<string, unknown>
}

function isPlaceholder(el: ExcalidrawEl): boolean {
  return String(getCustom(el).type || "").startsWith("__placeholder")
}

function isReflowable(el: ExcalidrawEl): boolean {
  if (el.type !== "text") return false
  if (el.isDeleted) return false
  // Skip text that's bound inside a container (e.g. rectangles with bound text)
  if (el.containerId) return false
  return true
}

function getGroupId(el: ExcalidrawEl): string | null {
  const ids = el.groupIds
  if (Array.isArray(ids) && ids.length > 0) return ids[0]
  return null
}

function elementBBox(el: ExcalidrawEl): { x: number; y: number; w: number; h: number } {
  return {
    x: el.x || 0,
    y: el.y || 0,
    w: Math.max(1, el.width || 0),
    h: Math.max(1, el.height || 0),
  }
}

function groupBBox(elements: ExcalidrawEl[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of elements) {
    if (el.isDeleted) continue
    const b = elementBBox(el)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Cluster elements into layout blocks. Elements sharing a groupId form
 * one block; ungrouped elements are individual blocks.
 */
function clusterIntoBlocks(elements: ExcalidrawEl[]): LayoutBlock[] {
  const live = elements.filter((el) => !el.isDeleted && !isPlaceholder(el))
  const grouped = new Map<string, ExcalidrawEl[]>()
  const ungrouped: ExcalidrawEl[] = []

  for (const el of live) {
    const gid = getGroupId(el)
    if (gid) {
      const list = grouped.get(gid) || []
      list.push(el)
      grouped.set(gid, list)
    } else {
      ungrouped.push(el)
    }
  }

  const blocks: LayoutBlock[] = []

  // Grouped blocks
  for (const [gid, els] of grouped) {
    const bbox = groupBBox(els)
    const hasText = els.some(isReflowable)
    // Use the topmost element id as anchor
    const sorted = [...els].sort((a, b) => (a.y || 0) - (b.y || 0))
    blocks.push({
      elements: els,
      bbox,
      groupId: gid,
      anchorId: sorted[0].id,
      hasText,
    })
  }

  // Ungrouped elements as individual blocks
  for (const el of ungrouped) {
    const bbox = elementBBox(el)
    blocks.push({
      elements: [el],
      bbox,
      groupId: null,
      anchorId: el.id,
      hasText: isReflowable(el),
    })
  }

  // Sort blocks by their current y position (preserve authoring order)
  blocks.sort((a, b) => a.bbox.y - b.bbox.y)

  return blocks
}

// ── Reflow ────────────────────────────────────────

function reflowTextElement(
  el: ExcalidrawEl,
  maxWidth: number
): ExcalidrawEl | null {
  if (!isReflowable(el)) return null

  const text = String(el.originalText || el.text || "")
  if (!text.trim()) return null

  const fontSize = typeof el.fontSize === "number" ? el.fontSize : 20
  const fontFamily = typeof el.fontFamily === "number" ? el.fontFamily : 1

  const laid = layoutText(text, fontSize, fontFamily, maxWidth, 2000)

  // Skip if nothing changed
  const curW = Math.round(el.width || 0)
  const curH = Math.round(el.height || 0)
  if (
    laid.text === (el.text || "") &&
    Math.abs(curW - laid.width) < 1 &&
    Math.abs(curH - laid.height) < 1
  ) {
    return null
  }

  return {
    ...el,
    text: laid.text,
    width: laid.width,
    height: laid.height,
    version: ((el.version as number) || 1) + 1,
    versionNonce: Math.floor(Math.random() * 2e9),
    updated: Date.now(),
  }
}

// ── Vertical Stack Layout ─────────────────────────

function stackBlocks(
  blocks: LayoutBlock[],
  column: ColumnBounds
): Map<string, { dx: number; dy: number }> {
  const moves = new Map<string, { dx: number; dy: number }>()
  let cursorY = COLUMN_TOP

  for (const block of blocks) {
    // Target X: center the block in the column
    const targetX = column.left + (column.width - block.bbox.w) / 2
    // For wide blocks, align to column left
    const effectiveX = block.bbox.w >= column.width * 0.9
      ? column.left
      : Math.max(column.left, targetX)

    const dx = effectiveX - block.bbox.x
    const dy = cursorY - block.bbox.y

    // Only record if there's actual movement
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      for (const el of block.elements) {
        moves.set(el.id, { dx, dy })
      }
    }

    cursorY += block.bbox.h + BLOCK_GAP
  }

  return moves
}

// ── Main Hook ─────────────────────────────────────

export function useNotebookMode(
  excalidrawRef: React.MutableRefObject<ExcalidrawAPI | null>,
  enabled: boolean,
  pageId: string
) {
  const isLayouting = useRef(false)
  const lastColumnHash = useRef("")
  const lastElementHash = useRef("")
  const rafId = useRef<number | null>(null)

  /**
   * Compute column bounds from current viewport.
   */
  const getColumn = useCallback((): ColumnBounds => {
    const api = excalidrawRef.current
    if (!api) {
      const fallbackW = Math.min(720, window.innerWidth - 80)
      return {
        centerX: 0,
        left: -fallbackW / 2,
        maxTextWidth: fallbackW - COLUMN_PAD_LEFT - COLUMN_PAD_RIGHT,
        width: fallbackW,
      }
    }

    const appState = api.getAppState()
    const zoom = (appState.zoom as { value: number })?.value
      ?? (appState.zoom as number)
      ?? 1
    const scrollX = (appState.scrollX as number) || 0
    const vw = (appState.width as number) || window.innerWidth

    // Viewport center in scene coords
    const centerX = (-scrollX + vw / 2) / zoom

    // Column width: up to 720 scene units, or 90% of viewport
    const maxColumnScene = Math.min(720, (vw / zoom) * 0.9)
    const left = centerX - maxColumnScene / 2

    return {
      centerX,
      left,
      maxTextWidth: maxColumnScene - COLUMN_PAD_LEFT - COLUMN_PAD_RIGHT,
      width: maxColumnScene,
    }
  }, [excalidrawRef])

  /**
   * Full notebook relayout:
   *  1. Reflow all text to column width
   *  2. Re-cluster into blocks
   *  3. Stack blocks vertically
   *  4. Lock horizontal scroll
   */
  const relayout = useCallback(
    (force = false) => {
      const api = excalidrawRef.current
      if (!api || !enabled || isLayouting.current) return

      const column = getColumn()
      const elements = api.getSceneElements() as ExcalidrawEl[]

      // Quick hash to avoid redundant work
      const columnHash = `${Math.round(column.left)}:${Math.round(column.width)}`
      const elHash = elements
        .filter((e) => !e.isDeleted)
        .map((e) => `${e.id}:${e.version || 0}`)
        .join("|")

      if (
        !force &&
        columnHash === lastColumnHash.current &&
        elHash === lastElementHash.current
      ) {
        return
      }

      isLayouting.current = true
      lastColumnHash.current = columnHash
      lastElementHash.current = elHash

      try {
        let changed = false
        let reflowed = [...elements] as ExcalidrawEl[]

        // Step 1: Reflow text elements
        reflowed = reflowed.map((el) => {
          const updated = reflowTextElement(el, column.maxTextWidth)
          if (updated) {
            changed = true
            return updated
          }
          return el
        })

        // Step 2: Cluster into blocks
        const blocks = clusterIntoBlocks(reflowed)

        // Step 3: Stack vertically
        const moves = stackBlocks(blocks, column)

        if (moves.size > 0) {
          changed = true
          reflowed = reflowed.map((el) => {
            const move = moves.get(el.id)
            if (!move) return el
            return {
              ...el,
              x: (el.x || 0) + move.dx,
              y: (el.y || 0) + move.dy,
              version: ((el.version as number) || 1) + 1,
              versionNonce: Math.floor(Math.random() * 2e9),
              updated: Date.now(),
            }
          })
        }

        if (changed) {
          api.updateScene({ elements: reflowed as unknown[] })

          // Update hash after our own changes
          lastElementHash.current = reflowed
            .filter((e) => !e.isDeleted)
            .map((e) => `${e.id}:${e.version || 0}`)
            .join("|")
        }

        // Step 4: Lock horizontal scroll — clamp to column center
        const appState = api.getAppState()
        const zoom = (appState.zoom as { value: number })?.value
          ?? (appState.zoom as number)
          ?? 1
        const vw = (appState.width as number) || window.innerWidth
        const desiredScrollX = vw / 2 - column.centerX * zoom

        const currentScrollX = (appState.scrollX as number) || 0
        if (Math.abs(currentScrollX - desiredScrollX) > 1) {
          api.updateScene({
            appState: {
              scrollX: desiredScrollX,
            } as unknown as Record<string, unknown>,
          })
        }
      } finally {
        isLayouting.current = false
      }
    },
    [enabled, excalidrawRef, getColumn]
  )

  /**
   * Called on every Excalidraw onChange — throttled via rAF.
   */
  const onNotebookChange = useCallback(() => {
    if (!enabled) return

    if (rafId.current != null) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      relayout(false)
    })
  }, [enabled, relayout])

  /**
   * Check if an element is currently being edited.
   * We skip relayout during active text editing to avoid cursor jumps.
   */
  const isEditing = useCallback((): boolean => {
    const api = excalidrawRef.current
    if (!api) return false
    const appState = api.getAppState()
    return Boolean(
      appState.editingTextElement ||
      appState.editingLinearElement ||
      appState.editingGroupId
    )
  }, [excalidrawRef])

  /**
   * Safe relayout that skips if user is editing.
   */
  const safeRelayout = useCallback(
    (force = false) => {
      if (isEditing()) return
      relayout(force)
    },
    [relayout, isEditing]
  )

  // Relayout on window resize
  useEffect(() => {
    if (!enabled) return

    const handleResize = () => {
      lastColumnHash.current = "" // Force recalculation
      safeRelayout(true)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [enabled, safeRelayout])

  // Initial layout when mode becomes active
  useEffect(() => {
    if (!enabled) {
      lastColumnHash.current = ""
      lastElementHash.current = ""
      return
    }

    // Delay to let Excalidraw settle
    const timer = setTimeout(() => safeRelayout(true), 200)
    return () => clearTimeout(timer)
  }, [enabled, pageId, safeRelayout])

  /**
   * Find the Y position for appending new content at the bottom.
   */
  const getBottomY = useCallback((): number => {
    const api = excalidrawRef.current
    if (!api) return COLUMN_TOP

    const elements = api.getSceneElements() as ExcalidrawEl[]
    let maxY = COLUMN_TOP

    for (const el of elements) {
      if (el.isDeleted || isPlaceholder(el)) continue
      const bottom = (el.y || 0) + (el.height || 0)
      maxY = Math.max(maxY, bottom)
    }

    return maxY + BLOCK_GAP
  }, [excalidrawRef])

  /**
   * Get current column for callers who need to know
   * placement coordinates.
   */
  const getColumnBounds = useCallback((): ColumnBounds => {
    return getColumn()
  }, [getColumn])

  return {
    onNotebookChange,
    relayout: safeRelayout,
    getBottomY,
    getColumn: getColumnBounds,
    isLayouting: () => isLayouting.current,
  }
}