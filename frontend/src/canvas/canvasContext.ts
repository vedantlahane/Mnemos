import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"

export function readCanvasContext(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements() as readonly Record<string, unknown>[]
  const appState = api.getAppState()

  const scrollX = Number(appState.scrollX || 0)
  const scrollY = Number(appState.scrollY || 0)
  const zoom = typeof appState.zoom === "object" && appState.zoom !== null
    ? Number((appState.zoom as any).value || 1)
    : Number(appState.zoom || 1)

  const width = Number(appState.width || window.innerWidth)
  const height = Number(appState.height || window.innerHeight)

  const viewportCenter = {
    x: -scrollX + width / (2 * zoom),
    y: -scrollY + height / (2 * zoom),
  }

  const viewportBounds = {
    minX: -scrollX,
    minY: -scrollY,
    maxX: -scrollX + width / zoom,
    maxY: -scrollY + height / zoom,
  }

  const occupiedRects = elements
    .filter((el) => !el.isDeleted)
    .map((el) => ({
      x: Number(el.x),
      y: Number(el.y),
      w: Number(el.width),
      h: Number(el.height),
    }))

  const backgroundColor = typeof appState.viewBackgroundColor === "string" 
    ? appState.viewBackgroundColor 
    : "#0e0e1a"

  return {
    elements,
    viewportCenter,
    viewportBounds,
    occupiedRects,
    zoom,
    backgroundColor,
  }
}

export function collides(
  x: number,
  y: number,
  w: number,
  h: number,
  occupied: Array<{ x: number; y: number; w: number; h: number }>,
  padding = 40
) {
  for (const rect of occupied) {
    if (
      x < rect.x + rect.w + padding &&
      x + w + padding > rect.x &&
      y < rect.y + rect.h + padding &&
      y + h + padding > rect.y
    ) {
      return true
    }
  }
  return false
}

export function findOpenPosition(
  ctx: ReturnType<typeof readCanvasContext>,
  width: number,
  height: number,
  padding = 40
) {
  let r = 0
  let angle = 0
  const cx = ctx.viewportCenter.x - width / 2
  const cy = ctx.viewportCenter.y - height / 2

  while (r < 5000) {
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (!collides(x, y, width, height, ctx.occupiedRects, padding)) {
      return { x, y }
    }
    angle += Math.PI / 4
    if (angle >= Math.PI * 2) {
      angle = 0
      r += 100
    }
  }
  return { x: cx, y: cy }
}

export function findStackPosition(
  ctx: ReturnType<typeof readCanvasContext>,
  items: Array<{ width: number; height: number }>,
  gap = 30
): Array<{ x: number; y: number }> {
  if (items.length === 0) return []
  
  const totalHeight = items.reduce((sum, item) => sum + item.height + gap, 0) - gap
  const maxWidth = Math.max(...items.map((i) => i.width))
  
  const startPos = findOpenPosition(ctx, maxWidth, totalHeight)
  const positions: Array<{ x: number; y: number }> = []
  
  let currentY = startPos.y
  for (const item of items) {
    positions.push({ x: startPos.x, y: currentY })
    currentY += item.height + gap
  }
  
  return positions
}

export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 }
}

export function luminance(hex: string) {
  const rgb = hexToRgb(hex)
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722
}

export function contrastTextColor(hex: string) {
  return luminance(hex) > 0.4 ? "#111827" : "#f3f4f6"
}