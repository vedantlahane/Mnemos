import { convertToExcalidrawElements } from "@excalidraw/excalidraw"
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { nanoid } from "../utils"

export interface NoteBlock {
  noteId: string
  title: string
  summary: string
  tags: string[]
  x?: number
  y?: number
}

export function createNoteCard(
  note: NoteBlock,
  position?: { x: number; y: number }
): ExcalidrawElement[] {
  const x = position?.x ?? note.x ?? 100
  const y = position?.y ?? note.y ?? 100
  const groupId = nanoid()

  const skeleton: ExcalidrawElementSkeleton[] = [
    {
      id: `note-frame-${note.noteId}`,
      type: "rectangle",
      x: x - 12,
      y: y - 12,
      width: 360,
      height: 240,
      strokeColor: "#e5e7eb",
      strokeWidth: 1,
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      opacity: 100,
      roundness: { type: 3, value: 10 },
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-frame" },
    } as ExcalidrawElementSkeleton,
    {
      id: `note-title-${note.noteId}`,
      type: "text",
      x,
      y,
      text: note.title || "Untitled",
      fontSize: 18,
      fontFamily: 1,
      strokeColor: "#111827",
      textAlign: "left",
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-title", title: note.title },
    } as ExcalidrawElementSkeleton,
    {
      id: `note-summary-${note.noteId}`,
      type: "text",
      x,
      y: y + 32,
      text: truncateAndWrap(note.summary || "", 55, 6),
      fontSize: 13,
      fontFamily: 1,
      strokeColor: "#6b7280",
      textAlign: "left",
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-summary" },
    } as ExcalidrawElementSkeleton,
    {
      id: `note-accent-${note.noteId}`,
      type: "line",
      x: x - 12,
      y: y - 12,
      points: [
        [0, 0],
        [0, 240],
      ],
      strokeColor: "#6366f1",
      strokeWidth: 3,
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-accent" },
    } as ExcalidrawElementSkeleton,
  ]

  if (note.tags.length > 0) {
    skeleton.push({
      id: `note-tags-${note.noteId}`,
      type: "text",
      x,
      y: y + 182,
      text: note.tags.map((tag) => `#${tag}`).join("  "),
      fontSize: 11,
      fontFamily: 3,
      strokeColor: "#6366f1",
      textAlign: "left",
      groupIds: [groupId],
      customData: { noteId: note.noteId, type: "note-tags", tags: note.tags },
    } as ExcalidrawElementSkeleton)
  }

  return convertToExcalidrawElements(skeleton, {
    regenerateIds: false,
  }) as ExcalidrawElement[]
}

export function createSticky(
  text: string,
  x: number,
  y: number,
  color = "#fef08a"
): ExcalidrawElement[] {
  const groupId = nanoid()

  const skeleton: ExcalidrawElementSkeleton[] = [
    {
      id: nanoid(),
      type: "rectangle",
      x,
      y,
      width: 180,
      height: 160,
      backgroundColor: color,
      fillStyle: "solid",
      strokeColor: "transparent",
      roundness: { type: 3, value: 4 },
      groupIds: [groupId],
      customData: { type: "sticky-bg" },
    } as ExcalidrawElementSkeleton,
    {
      id: nanoid(),
      type: "text",
      x: x + 12,
      y: y + 12,
      text: truncateAndWrap(text, 22, 6),
      fontSize: 16,
      fontFamily: 4,
      strokeColor: "#78350f",
      textAlign: "left",
      groupIds: [groupId],
      customData: { type: "sticky-text" },
    } as ExcalidrawElementSkeleton,
  ]

  return convertToExcalidrawElements(skeleton, {
    regenerateIds: false,
  }) as ExcalidrawElement[]
}

export function createArrow(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  label?: string
): ExcalidrawElement {
  return convertToExcalidrawElements(
    [
      {
        id: nanoid(),
        type: "arrow",
        x: startX,
        y: startY,
        points: [
          [0, 0],
          [endX - startX, endY - startY],
        ],
        strokeColor: "#94a3b8",
        strokeWidth: 2,
        endArrowhead: "arrow",
        customData: { type: "connection", label },
      } as ExcalidrawElementSkeleton,
    ],
    { regenerateIds: false }
  )[0] as ExcalidrawElement
}

export function createClusterFrame(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color = "#6366f1"
): ExcalidrawElement[] {
  const groupId = nanoid()

  const skeleton: ExcalidrawElementSkeleton[] = [
    {
      id: nanoid(),
      type: "rectangle",
      x,
      y,
      width,
      height,
      strokeColor: color,
      strokeWidth: 1,
      strokeStyle: "dashed",
      backgroundColor: `${color}08`,
      fillStyle: "solid",
      opacity: 40,
      roundness: { type: 3, value: 16 },
      groupIds: [groupId],
      customData: { type: "cluster-frame", label },
    } as ExcalidrawElementSkeleton,
    {
      id: nanoid(),
      type: "text",
      x: x + 12,
      y: y - 24,
      text: label,
      fontSize: 14,
      fontFamily: 1,
      strokeColor: color,
      opacity: 60,
      groupIds: [groupId],
      customData: { type: "cluster-label" },
    } as ExcalidrawElementSkeleton,
  ]

  return convertToExcalidrawElements(skeleton, {
    regenerateIds: false,
  }) as ExcalidrawElement[]
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
  if (
    lines.length === maxLines &&
    words.length > lines.join(" ").split(/\s+/).length
  ) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`
  }

  return lines.join("\n")
}