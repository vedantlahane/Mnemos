/**
 * Diagram Renderer — converts a structured topology from the LLM
 * into Excalidraw elements (boxes, text, arrows).
 *
 * Topology shape:
 * {
 *   title: string,
 *   layout_type: "flow" | "mindmap" | "list" | "comparison" | "timeline" | "freeform",
 *   elements: [{ id, type, label, style, width?, height? }],
 *   connections: [{ from, to, label?, style? }]
 * }
 */

import { nanoid } from "../utils"
import { contrastTextColor, contrastAccentColor, contrastMutedColor, luminance } from "./canvasContext"
import type { CanvasContext } from "./canvasContext"
import { layoutText } from "./canvasAI"

interface TopologyElement {
  id: string
  type: "box" | "text" | "arrow"
  label: string
  style?: "default" | "accent" | "muted" | "warning" | "success"
  width?: number
  height?: number
}

interface TopologyConnection {
  from: string
  to: string
  label?: string
  style?: "solid" | "dashed" | "dotted"
}

interface Topology {
  title: string
  layout_type: "flow" | "mindmap" | "list" | "comparison" | "timeline" | "freeform"
  elements: TopologyElement[]
  connections: TopologyConnection[]
}

// ── Style palette based on canvas theme ──

function getStyleColors(
  style: string,
  isDark: boolean
): { bg: string; border: string; text: string } {
  if (isDark) {
    switch (style) {
      case "accent":
        return { bg: "#312e81", border: "#818cf8", text: "#e0e7ff" }
      case "muted":
        return { bg: "#1f2937", border: "#4b5563", text: "#9ca3af" }
      case "warning":
        return { bg: "#451a03", border: "#f59e0b", text: "#fef3c7" }
      case "success":
        return { bg: "#052e16", border: "#22c55e", text: "#dcfce7" }
      default:
        return { bg: "#1e1e2e", border: "#374151", text: "#f3f4f6" }
    }
  } else {
    switch (style) {
      case "accent":
        return { bg: "#eef2ff", border: "#6366f1", text: "#312e81" }
      case "muted":
        return { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280" }
      case "warning":
        return { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" }
      case "success":
        return { bg: "#f0fdf4", border: "#22c55e", text: "#14532d" }
      default:
        return { bg: "#ffffff", border: "#e5e7eb", text: "#111827" }
    }
  }
}

// ── Layout algorithms ──

function layoutFlow(
  elements: TopologyElement[],
  startX: number,
  startY: number,
  gap = 30
): Map<string, { x: number; y: number; w: number; h: number }> {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
  let y = startY

  for (const el of elements) {
    const w = el.width || 220
    const h = el.height || 60
    positions.set(el.id, { x: startX, y, w, h })
    y += h + gap
  }

  return positions
}

function layoutMindmap(
  elements: TopologyElement[],
  centerX: number,
  centerY: number,
  radius = 250
): Map<string, { x: number; y: number; w: number; h: number }> {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()

  if (elements.length === 0) return positions

  // Center element
  const center = elements[0]
  const cw = center.width || 200
  const ch = center.height || 60
  positions.set(center.id, { x: centerX - cw / 2, y: centerY - ch / 2, w: cw, h: ch })

  // Radial children
  const children = elements.slice(1)
  const angleStep = (2 * Math.PI) / Math.max(children.length, 1)

  children.forEach((el, i) => {
    const angle = -Math.PI / 2 + i * angleStep
    const w = el.width || 180
    const h = el.height || 50
    const x = centerX + radius * Math.cos(angle) - w / 2
    const y = centerY + radius * Math.sin(angle) - h / 2
    positions.set(el.id, { x, y, w, h })
  })

  return positions
}

function layoutList(
  elements: TopologyElement[],
  startX: number,
  startY: number,
  gap = 12
): Map<string, { x: number; y: number; w: number; h: number }> {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
  let y = startY

  for (const el of elements) {
    const w = el.width || 400
    const h = el.height || 40
    positions.set(el.id, { x: startX, y, w, h })
    y += h + gap
  }

  return positions
}

function layoutComparison(
  elements: TopologyElement[],
  startX: number,
  startY: number,
  gap = 30,
  colGap = 60
): Map<string, { x: number; y: number; w: number; h: number }> {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
  const mid = Math.ceil(elements.length / 2)
  const leftCol = elements.slice(0, mid)
  const rightCol = elements.slice(mid)

  let yL = startY
  for (const el of leftCol) {
    const w = el.width || 200
    const h = el.height || 60
    positions.set(el.id, { x: startX, y: yL, w, h })
    yL += h + gap
  }

  let yR = startY
  for (const el of rightCol) {
    const w = el.width || 200
    const h = el.height || 60
    positions.set(el.id, { x: startX + 200 + colGap, y: yR, w, h })
    yR += h + gap
  }

  return positions
}

function layoutTimeline(
  elements: TopologyElement[],
  startX: number,
  startY: number,
  gap = 40
): Map<string, { x: number; y: number; w: number; h: number }> {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
  let x = startX

  for (const el of elements) {
    const w = el.width || 160
    const h = el.height || 80
    positions.set(el.id, { x, y: startY, w, h })
    x += w + gap
  }

  return positions
}

// ── Base element helpers ──

function seed(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

// ── Main render function ──

export function renderTopology(
  topology: Topology,
  ctx: CanvasContext
): Record<string, unknown>[] {
  const isDark = ctx.isDark
  const bg = ctx.backgroundColor

  // Compute positions based on layout type
  const boxElements = topology.elements.filter((e) => e.type !== "arrow")
  const origin = ctx.viewportCenter

  let positions: Map<string, { x: number; y: number; w: number; h: number }>

  switch (topology.layout_type) {
    case "mindmap":
      positions = layoutMindmap(boxElements, origin.x, origin.y)
      break
    case "list":
      positions = layoutList(boxElements, origin.x - 200, origin.y - 200)
      break
    case "comparison":
      positions = layoutComparison(boxElements, origin.x - 230, origin.y - 200)
      break
    case "timeline":
      positions = layoutTimeline(boxElements, origin.x - 400, origin.y - 40)
      break
    case "flow":
    default:
      positions = layoutFlow(boxElements, origin.x - 110, origin.y - 200)
  }

  const excalidrawElements: Record<string, unknown>[] = []
  const groupId = nanoid()

  // ── Title ──
  if (topology.title) {
    const titleColor = isDark ? "#a5b4fc" : "#4f46e5"
    excalidrawElements.push({
      id: nanoid(),
      type: "text",
      x: origin.x - 200,
      y: (positions.values().next().value?.y ?? origin.y) - 50,
      width: 400,
      height: 30,
      text: topology.title,
      originalText: topology.title,
      fontSize: 22,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      lineHeight: 1.25,
      autoResize: true,
      angle: 0,
      strokeColor: titleColor,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [groupId],
      frameId: null,
      roundness: null,
      seed: seed(),
      version: 1,
      versionNonce: seed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      customData: { type: "diagram-title" },
    })
  }

  // ── Box elements ──
  for (const el of boxElements) {
    const pos = positions.get(el.id)
    if (!pos) continue

    const style = el.style || "default"
    const colors = getStyleColors(style, isDark)

    // Background rectangle
    excalidrawElements.push({
      id: `diag-bg-${el.id}`,
      type: "rectangle",
      x: pos.x,
      y: pos.y,
      width: pos.w,
      height: pos.h,
      angle: 0,
      strokeColor: colors.border,
      backgroundColor: colors.bg,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [groupId],
      frameId: null,
      roundness: { type: 3, value: 8 },
      seed: seed(),
      version: 1,
      versionNonce: seed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      customData: { type: "diagram-box", elementId: el.id },
    })

    // Text label
    const textLayout = layoutText(el.label, 14, 1, pos.w - 16, 4)
    excalidrawElements.push({
      id: `diag-text-${el.id}`,
      type: "text",
      x: pos.x + 8,
      y: pos.y + (pos.h - textLayout.height) / 2,
      width: textLayout.width,
      height: textLayout.height,
      text: textLayout.text,
      originalText: el.label,
      fontSize: 14,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      lineHeight: 1.25,
      autoResize: true,
      angle: 0,
      strokeColor: colors.text,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [groupId],
      frameId: null,
      roundness: null,
      seed: seed(),
      version: 1,
      versionNonce: seed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      customData: { type: "diagram-label", elementId: el.id },
    })
  }

  // ── Connections (arrows) ──
  for (const conn of topology.connections) {
    const fromPos = positions.get(conn.from)
    const toPos = positions.get(conn.to)
    if (!fromPos || !toPos) continue

    const fromCenterX = fromPos.x + fromPos.w / 2
    const fromCenterY = fromPos.y + fromPos.h / 2
    const toCenterX = toPos.x + toPos.w / 2
    const toCenterY = toPos.y + toPos.h / 2

    // Connect from edge to edge (not center-to-center)
    let startX: number, startY: number, endX: number, endY: number

    // Simple: connect bottom of source to top of target (for vertical flows)
    if (topology.layout_type === "flow" || topology.layout_type === "list") {
      startX = fromPos.x + fromPos.w / 2
      startY = fromPos.y + fromPos.h
      endX = toPos.x + toPos.w / 2
      endY = toPos.y
    } else if (topology.layout_type === "timeline") {
      startX = fromPos.x + fromPos.w
      startY = fromPos.y + fromPos.h / 2
      endX = toPos.x
      endY = toPos.y + toPos.h / 2
    } else {
      // Generic: center to center
      startX = fromCenterX
      startY = fromCenterY
      endX = toCenterX
      endY = toCenterY
    }

    const dx = endX - startX
    const dy = endY - startY
    const arrowColor = isDark ? "#6b7280" : "#9ca3af"
    const strokeStyle = conn.style || "solid"

    excalidrawElements.push({
      id: `diag-arrow-${nanoid()}`,
      type: "arrow",
      x: startX,
      y: startY,
      width: Math.abs(dx),
      height: Math.abs(dy),
      angle: 0,
      strokeColor: arrowColor,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1.5,
      strokeStyle,
      roughness: 0,
      opacity: 70,
      groupIds: [groupId],
      frameId: null,
      roundness: { type: 2 },
      seed: seed(),
      version: 1,
      versionNonce: seed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
      customData: { type: "diagram-arrow", from: conn.from, to: conn.to },
    })
  }

  return excalidrawElements
}
