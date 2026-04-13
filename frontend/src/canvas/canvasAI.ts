/**
 * Robust Excalidraw element factories.
 * Creates raw element objects with ALL required Excalidraw properties
 * to avoid version-dependent import issues.
 */
import { nanoid } from "../utils"

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
  } = {}
): BaseElement {
  const fontSize = opts.fontSize ?? 16
  const fontFamily = opts.fontFamily ?? 1
  const lines = text.split("\n")
  const lineHeight = fontSize * 1.25
  const width = Math.max(...lines.map((l) => l.length * fontSize * 0.6), 50)
  const height = lines.length * lineHeight

  return {
    ...baseElement({
      id,
      type: "text",
      x,
      y,
      width,
      height,
      strokeColor: opts.color ?? "#1e1e1e",
      opacity: opts.opacity ?? 100,
      groupIds: opts.groupIds ?? [],
      customData: opts.customData,
    }),
    text,
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
  position?: { x: number; y: number }
): BaseElement[] {
  const x = position?.x ?? note.x ?? 100
  const y = position?.y ?? note.y ?? 100
  const W = 360
  const H = 240
  const groupId = nanoid()
  const accentColor = note.color || "#6366f1"

  const elements: BaseElement[] = [
    // White card background
    rectElement(`note-frame-${note.noteId}`, x - 12, y - 12, W, H, {
      strokeColor: "#e5e7eb",
      backgroundColor: "#ffffff",
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
      color: "#111827",
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-title", title: note.title },
    }),

    // Summary
    textElement(
      `note-summary-${note.noteId}`,
      x,
      y + 32,
      truncateAndWrap(note.summary || "", 55, 6),
      {
        fontSize: 13,
        fontFamily: 1,
        color: "#6b7280",
        groupIds: [groupId],
        customData: { noteId: note.noteId, type: "note-summary" },
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
  color = "#fef08a"
): BaseElement[] {
  const groupId = nanoid()

  return [
    rectElement(nanoid(), x, y, 180, 160, {
      backgroundColor: color,
      strokeColor: "transparent",
      roundness: { type: 3, value: 4 },
      groupIds: [groupId],
      customData: { type: "sticky-bg" },
    }),
    textElement(nanoid(), x + 12, y + 12, truncateAndWrap(text, 22, 6), {
      fontSize: 16,
      fontFamily: 4,
      color: "#78350f",
      groupIds: [groupId],
      customData: { type: "sticky-text" },
    }),
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

export function truncateAndWrap(
  text: string,
  charsPerLine: number,
  maxLines: number
): string {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    if (lines.length >= maxLines) break
    if ((line + " " + word).trim().length > charsPerLine) {
      if (line.trim()) lines.push(line.trim())
      line = word
    } else {
      line += ` ${word}`
    }
  }

  if (line.trim() && lines.length < maxLines) lines.push(line.trim())
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`
  }

  return lines.join("\n") || text.slice(0, charsPerLine)
}