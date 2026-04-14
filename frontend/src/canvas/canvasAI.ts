import { nanoid } from "../utils"
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext"
import { contrastTextColor, luminance } from "./canvasContext"

// ─── Types ────────────────────────────────────────
export interface NoteBlock {
  noteId: string
  title: string
  summary: string
  tags: string[]
  x?: number
  y?: number
  color?: string
}

// Index signature allows assignment to Record<string, unknown>
interface BaseElement {
  [key: string]: unknown
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  strokeColor: string
  backgroundColor: string
  fillStyle: string
  strokeWidth: number
  strokeStyle: string
  roughness: number
  opacity: number
  groupIds: string[]
  frameId: null
  roundness: { type: number; value?: number } | null
  seed: number
  version: number
  versionNonce: number
  isDeleted: boolean
  boundElements: null
  updated: number
  link: null
  locked: boolean
  customData?: Record<string, unknown>
}

function seed(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

function baseElement(
  overrides: Partial<BaseElement> & { id: string; type: string; x: number; y: number }
): BaseElement {
  return {
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
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
    ...overrides,
  }
}

function getFontString(fontSize: number, fontFamily: number) {
  let family = "Virgil"
  if (fontFamily === 2) family = "Helvetica"
  if (fontFamily === 3) family = "Cascadia"
  if (fontFamily === 4) family = "Assistant"
  return `${fontSize}px "${family}"`
}

export function layoutText(text: string, fontSize: number, fontFamily: number, maxWidth: number, maxLines: number) {
  const fontStr = getFontString(fontSize, fontFamily)
  const lineHeight = fontSize * 1.25
  const prepared = prepareWithSegments(text || "", fontStr)
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  
  let lines = result.lines.slice(0, maxLines)
  let outText = lines.map(l => l.text).join('\n')
  
  if (result.lines.length > maxLines) {
      let newLastLine = lines[lines.length - 1].text;
      if (newLastLine.length > 3) newLastLine = newLastLine.slice(0, -3) + "...";
      else newLastLine += "...";
      const parts = outText.split('\n')
      parts[parts.length - 1] = newLastLine
      outText = parts.join('\n')
  }
  return {
      text: outText,
      width: Math.ceil(Math.max(...lines.map(l => l.width), 30)),
      height: Math.ceil(Math.max(fontSize * 1.5, lines.length * lineHeight))
  }
}

function textElement(
  id: string,
  x: number,
  y: number,
  text: string,
  opts: {
    fontSize?: number
    fontFamily?: number
    color?: string
    groupIds?: string[]
    opacity?: number
    customData?: Record<string, unknown>
    maxWidth?: number
    maxLines?: number
  } = {}
): BaseElement {
  const fontSize = opts.fontSize ?? 16
  const fontFamily = opts.fontFamily ?? 1
  const maxWidth = opts.maxWidth ?? 500
  const maxLines = opts.maxLines ?? 100
  const layout = layoutText(text, fontSize, fontFamily, maxWidth, maxLines)

  return {
    ...baseElement({
      id,
      type: "text",
      x,
      y,
      width: layout.width,
      height: layout.height,
      strokeColor: opts.color ?? "#1e1e1e",
      opacity: opts.opacity ?? 100,
      groupIds: opts.groupIds ?? [],
      customData: opts.customData,
    }),
    text: layout.text,
    fontSize,
    fontFamily,
    textAlign: "left" as const,
    verticalAlign: "top" as const,
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    autoResize: true,
  }
}

function rectElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: {
    strokeColor?: string
    backgroundColor?: string
    fillStyle?: string
    strokeWidth?: number
    strokeStyle?: string
    opacity?: number
    roundness?: { type: number; value?: number } | null
    groupIds?: string[]
    customData?: Record<string, unknown>
  } = {}
): BaseElement {
  return baseElement({
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor: opts.strokeColor ?? "#e5e7eb",
    backgroundColor: opts.backgroundColor ?? "transparent",
    fillStyle: opts.fillStyle ?? "solid",
    strokeWidth: opts.strokeWidth ?? 1,
    strokeStyle: opts.strokeStyle ?? "solid",
    opacity: opts.opacity ?? 100,
    roundness: opts.roundness ?? { type: 3, value: 10 },
    groupIds: opts.groupIds ?? [],
    customData: opts.customData,
  })
}

// ─── Public factories ─────────────────────────────

export function createNoteCard(
  note: NoteBlock,
  position?: { x: number; y: number },
  canvasBg?: string
): BaseElement[] {
  const x = position?.x ?? note.x ?? 100
  const y = position?.y ?? note.y ?? 100
  const W = 360
  const H = 240
  const groupId = nanoid()

  // Context-aware colors
  const dark = canvasBg ? luminance(canvasBg) < 0.4 : true
  const accentColor = note.color || (dark ? "#818cf8" : "#6366f1")
  const cardBg = dark ? "#1e1e2e" : "#ffffff"
  const cardBorder = dark ? "#374151" : "#e5e7eb"
  const titleColor = dark ? "#f3f4f6" : "#111827"
  const summaryColor = dark ? "#9ca3af" : "#6b7280"

  const elements: BaseElement[] = [
    // Card background
    rectElement(`note-frame-${note.noteId}`, x - 12, y - 12, W, H, {
      strokeColor: cardBorder,
      backgroundColor: cardBg,
      roundness: { type: 3, value: 10 },
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-frame" },
    }),

    // Accent left bar
    {
      ...baseElement({
        id: `note-accent-${note.noteId}`,
        type: "line",
        x: x - 12,
        y: y - 12,
      }),
      width: 0,
      height: H,
      points: [[0, 0], [0, H]] as [number, number][],
      strokeColor: accentColor,
      strokeWidth: 3,
      groupIds: [groupId],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      customData: { noteId: note.noteId, type: "note-accent" },
    },

    // Title
    textElement(`note-title-${note.noteId}`, x, y, note.title || "Untitled", {
      fontSize: 18,
      fontFamily: 1,
      color: titleColor,
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-title", title: note.title },
    }),

    // Summary
    textElement(
      `note-summary-${note.noteId}`,
      x,
      y + 32,
      note.summary || "",
      {
        fontSize: 13,
        fontFamily: 1,
        color: summaryColor,
        groupIds: [groupId],
        customData: { noteId: note.noteId, type: "note-summary" },
        maxWidth: 336,
        maxLines: 6,
      }
    ),
  ]

  // Tags
  if (note.tags.length > 0) {
    elements.push(
      textElement(
        `note-tags-${note.noteId}`,
        x,
        y + 182,
        note.tags.map((t) => `#${t}`).join("  "),
        {
          fontSize: 11,
          fontFamily: 3,
          color: accentColor,
          groupIds: [groupId],
          customData: { noteId: note.noteId, type: "note-tags", tags: note.tags },
        }
      )
    )
  }

  return elements
}

export function createSticky(
  text: string,
  x: number,
  y: number,
  color?: string,
  canvasBg?: string
): BaseElement[] {
  const groupId = nanoid()
  const dark = canvasBg ? luminance(canvasBg) < 0.4 : false
  // On dark backgrounds, use a warmer sticky; on light, classic yellow
  const stickyColor = color ?? (dark ? "#fbbf24" : "#fef08a")
  const textColor = "#78350f" // Brown text always readable on yellow stickies

  return [
    rectElement(nanoid(), x, y, 180, 160, {
      backgroundColor: stickyColor,
      strokeColor: "transparent",
      roundness: { type: 3, value: 4 },
      groupIds: [groupId],
      customData: { type: "sticky-bg" },
    }),
    textElement(nanoid(), x + 12, y + 12, text, {
      fontSize: 16,
      fontFamily: 4,
      color: textColor,
      groupIds: [groupId],
      customData: { type: "sticky-text" },
      maxWidth: 156,
      maxLines: 6,
    }),
  ]
}

export function createTextBare(
  text: string,
  x: number,
  y: number,
  canvasBg?: string,
  opts?: {
    fontSize?: number
    fontFamily?: number
    maxWidth?: number
    maxLines?: number
    customDataType?: string
  }
): BaseElement[] {
  // Auto-pick text color based on background
  const textColor = canvasBg ? contrastTextColor(canvasBg) : "#ffffff"
  const fontSize = opts?.fontSize ?? 20
  const fontFamily = opts?.fontFamily ?? 1
  const maxWidth = opts?.maxWidth ?? 800
  const maxLines = opts?.maxLines ?? 100
  const customDataType = opts?.customDataType ?? "raw-text"

  return [
    textElement(nanoid(), x, y, text, {
      fontSize,
      fontFamily,
      color: textColor,
      maxWidth,
      maxLines,
      customData: { type: customDataType }
    })
  ]
}

export function createEdgeArrow(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  edgeType: string,
  label?: string,
  edgeId?: string
): BaseElement {
  const dx = targetX - sourceX
  const dy = targetY - sourceY

  const strokeColorMap: Record<string, string> = {
    related: "#94a3b8",
    depends_on: "#f59e0b",
    extends: "#22c55e",
    contradicts: "#ef4444",
    summarizes: "#6366f1",
    example_of: "#06b6d4",
  }

  const strokeStyleMap: Record<string, string> = {
    related: "solid",
    depends_on: "solid",
    extends: "dashed",
    contradicts: "dotted",
    summarizes: "dashed",
    example_of: "dashed",
  }

  return {
    ...baseElement({
      id: edgeId ? `edge-${edgeId}` : nanoid(),
      type: "arrow",
      x: sourceX,
      y: sourceY,
    }),
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [[0, 0], [dx, dy]] as [number, number][],
    strokeColor: strokeColorMap[edgeType] || "#94a3b8",
    strokeWidth: 2,
    strokeStyle: strokeStyleMap[edgeType] || "solid",
    opacity: 60,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    customData: { type: "edge-arrow", edgeType, label, edgeId },
  }
}

export function createClusterFrame(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color = "#6366f1",
  clusterId?: string
): BaseElement[] {
  const groupId = nanoid()
  const PADDING = 30

  return [
    rectElement(
      clusterId ? `cluster-frame-${clusterId}` : nanoid(),
      x - PADDING,
      y - PADDING - 28,
      width + PADDING * 2,
      height + PADDING * 2 + 28,
      {
        strokeColor: color,
        strokeWidth: 1,
        strokeStyle: "dashed",
        backgroundColor: `${color}08`,
        opacity: 40,
        roundness: { type: 3, value: 16 },
        groupIds: [groupId],
        customData: { type: "cluster-frame", label, clusterId },
      }
    ),
    textElement(
      clusterId ? `cluster-label-${clusterId}` : nanoid(),
      x - PADDING + 12,
      y - PADDING - 24,
      label,
      {
        fontSize: 14,
        fontFamily: 1,
        color,
        opacity: 60,
        groupIds: [groupId],
        customData: { type: "cluster-label", clusterId },
      }
    ),
  ]
}
