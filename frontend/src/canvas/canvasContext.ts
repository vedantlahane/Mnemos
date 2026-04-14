/**
 * Canvas Context — reads the current Excalidraw visual state
 * and provides intelligent defaults for new elements.
 *
 * This is the brain behind "make text white on dark backgrounds"
 * and "place things where there's room".
 */

export interface CanvasContext {
  /** Current background color of the canvas */
  backgroundColor: string
  /** Whether the canvas is in dark mode */
  isDark: boolean
  /** Current viewport: center in scene coords */
  viewportCenter: { x: number; y: number }
  /** Zoom level */
  zoom: number
  /** Visible viewport bounds in scene coords */
  viewportBounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** Bounding boxes of all existing non-deleted elements */
  occupiedRects: Array<{ x: number; y: number; w: number; h: number }>
  /** Raw appState for anything else */
  appState: Record<string, unknown>
}

/**
 * Compute luminance of a hex or CSS color (0..1)
 * @returns 0 for black, 1 for white
 */
export function luminance(color: string): number {
  // Handle common named colors
  const named: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    transparent: "#000000",
  }
  const hex = named[color.toLowerCase()] ?? color

  // Parse hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
  let r = 0, g = 0, b = 0
  const h = hex.replace("#", "")

  if (h.length >= 6) {
    r = parseInt(h.slice(0, 2), 16) / 255
    g = parseInt(h.slice(2, 4), 16) / 255
    b = parseInt(h.slice(4, 6), 16) / 255
  } else if (h.length >= 3) {
    r = parseInt(h[0] + h[0], 16) / 255
    g = parseInt(h[1] + h[1], 16) / 255
    b = parseInt(h[2] + h[2], 16) / 255
  } else {
    // Try rgba() format
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (m) {
      r = parseInt(m[1]) / 255
      g = parseInt(m[2]) / 255
      b = parseInt(m[3]) / 255
    }
  }

  // Relative luminance (ITU-R BT.709)
  const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}

/**
 * Pick the best text color for a given background
 */
export function contrastTextColor(background: string): string {
  const L = luminance(background)
  // Dark background → white text; Light background → dark text
  return L < 0.4 ? "#ffffff" : "#1e1e1e"
}

/**
 * Pick a contrasting accent color for the current theme
 */
export function contrastAccentColor(background: string): string {
  const L = luminance(background)
  // Dark bg → indigo-300 ; Light bg → indigo-600
  return L < 0.4 ? "#a5b4fc" : "#4f46e5"
}

/**
 * Pick a subtle/muted text color for the current theme
 */
export function contrastMutedColor(background: string): string {
  const L = luminance(background)
  return L < 0.4 ? "#9ca3af" : "#6b7280"
}

/**
 * Read the full canvas context from the Excalidraw API
 */
export function readCanvasContext(excalidrawAPI: any): CanvasContext {
  const appState = excalidrawAPI.getAppState()
  const elements = excalidrawAPI.getSceneElements() as any[]

  const bg = (appState.viewBackgroundColor as string) || "#0e0e1a"
  const isDark = luminance(bg) < 0.4

  // Viewport center in scene coordinates
  const zoom = (appState.zoom?.value as number) ?? 1
  const scrollX = (appState.scrollX as number) ?? 0
  const scrollY = (appState.scrollY as number) ?? 0
  const vw = window.innerWidth
  const vh = window.innerHeight

  const centerX = (-scrollX + vw / 2) / zoom
  const centerY = (-scrollY + vh / 2) / zoom

  const viewportBounds = {
    minX: -scrollX / zoom,
    minY: -scrollY / zoom,
    maxX: (-scrollX + vw) / zoom,
    maxY: (-scrollY + vh) / zoom,
  }

  // Collect bounding boxes of non-deleted elements
  const occupiedRects = elements
    .filter((el: any) => !el.isDeleted && el.width > 0 && el.height > 0)
    .map((el: any) => ({
      x: el.x as number,
      y: el.y as number,
      w: el.width as number,
      h: el.height as number,
    }))

  return {
    backgroundColor: bg,
    isDark,
    viewportCenter: { x: centerX, y: centerY },
    zoom,
    viewportBounds,
    occupiedRects,
    appState: appState as Record<string, unknown>,
  }
}

/**
 * Find an unoccupied position near the viewport center.
 * Uses a spiral scan to find the first non-colliding location.
 */
export function findOpenPosition(
  ctx: CanvasContext,
  width: number,
  height: number,
  padding = 30
): { x: number; y: number } {
  const { viewportCenter, occupiedRects } = ctx

  function collides(x: number, y: number): boolean {
    for (const r of occupiedRects) {
      if (
        x < r.x + r.w + padding &&
        x + width + padding > r.x &&
        y < r.y + r.h + padding &&
        y + height + padding > r.y
      ) {
        return true
      }
    }
    return false
  }

  // Try center first
  const cx = viewportCenter.x - width / 2
  const cy = viewportCenter.y - height / 2
  if (!collides(cx, cy)) return { x: cx, y: cy }

  // Spiral outward from center
  const stepX = width + padding
  const stepY = height + padding

  for (let ring = 1; ring <= 8; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue // Only check perimeter of ring
        const testX = cx + dx * stepX
        const testY = cy + dy * stepY
        if (!collides(testX, testY)) return { x: testX, y: testY }
      }
    }
  }

  // Fallback: place below all existing elements
  let maxY = viewportCenter.y
  for (const r of occupiedRects) {
    maxY = Math.max(maxY, r.y + r.h)
  }
  return { x: cx, y: maxY + padding }
}

/**
 * Find a position for stacking multiple items vertically
 * (e.g. when adding a multi-block AI response)
 */
export function findStackPosition(
  ctx: CanvasContext,
  items: Array<{ width: number; height: number }>,
  gap = 20
): Array<{ x: number; y: number }> {
  // Total height needed
  const totalHeight = items.reduce((sum, item) => sum + item.height + gap, -gap)
  const maxWidth = Math.max(...items.map((i) => i.width))

  // Find open area for the stack
  const origin = findOpenPosition(ctx, maxWidth, totalHeight, 40)

  let currentY = origin.y
  return items.map((item) => {
    const pos = { x: origin.x, y: currentY }
    currentY += item.height + gap
    return pos
  })
}
