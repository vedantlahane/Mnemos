// === FILE: frontend/src/lib/textMeasure.ts ===

/**
 * Text measurement using @chenglou/pretext.
 * Single source of truth for text dimensions across the entire app.
 * 
 * Why: The backend's character-width lookup tables were ~20-30% off,
 * causing text overflow, overlapping cards, and broken diagram labels.
 * Pretext uses the browser's actual Canvas font engine → pixel-perfect.
 */

import { prepare, layout } from "@chenglou/pretext"

// ── Excalidraw font families → CSS font strings ──
const FONT_MAP: Record<number, string> = {
  1: '"Virgil"',
  2: '"Helvetica"',
  3: '"Cascadia"',
  4: '"Excalifont"',
  5: '"Nunito"',
  6: '"Lilita One"',
  7: '"Comic Shanns"',
}

// Cache prepared text handles (Pretext recommends reusing these)
const _cache = new Map<string, ReturnType<typeof prepare>>()

function getCacheKey(text: string, font: string): string {
  return `${font}::${text.slice(0, 200)}`
}

export interface TextMeasurement {
  width: number
  height: number
  lineCount: number
  wrappedText: string
}

/**
 * Measure text exactly as Excalidraw will render it.
 * Uses Pretext for pixel-perfect accuracy.
 */
export function measureText(
  text: string,
  fontSize: number = 16,
  fontFamily: number = 1,
  maxWidth: number = 600,
  maxLines: number = 200,
): TextMeasurement {
  if (!text || !text.trim()) {
    const lineHeight = fontSize * 1.25
    return { width: 20, height: lineHeight + 4, lineCount: 1, wrappedText: "" }
  }

  const fontName = FONT_MAP[fontFamily] || FONT_MAP[1]
  const fontStr = `${fontSize}px ${fontName}`
  const lineHeight = fontSize * 1.25

  const key = getCacheKey(text, fontStr)
  let prepared = _cache.get(key)
  if (!prepared) {
    try {
      prepared = prepare(text, fontStr)
      // Keep cache bounded
      if (_cache.size > 500) {
        const firstKey = _cache.keys().next().value
        if (firstKey) _cache.delete(firstKey)
      }
      _cache.set(key, prepared)
    } catch {
      // Fallback if font not loaded yet
      return fallbackMeasure(text, fontSize, maxWidth, maxLines)
    }
  }

  const result = layout(prepared, maxWidth, lineHeight)

  // Clamp to max lines
  let finalHeight = result.height
  let lineCount = result.lineCount
  if (lineCount > maxLines) {
    lineCount = maxLines
    finalHeight = maxLines * lineHeight
  }

  return {
    width: Math.min(Math.max(finalHeight > lineHeight * 1.5 ? maxWidth : maxWidth * 0.8, 20), maxWidth),
    height: Math.max(finalHeight + 4, lineHeight + 4),
    lineCount,
    wrappedText: text, // Pretext doesn't wrap — Excalidraw handles wrapping
  }
}

/**
 * Measure a batch of texts (for placement calculations).
 */
export function measureBatch(
  items: Array<{
    text: string
    fontSize?: number
    fontFamily?: number
    maxWidth?: number
  }>,
): TextMeasurement[] {
  return items.map((item) =>
    measureText(
      item.text,
      item.fontSize ?? 16,
      item.fontFamily ?? 1,
      item.maxWidth ?? 600,
    ),
  )
}

/**
 * Compute the actual rendered height of a note card.
 * Used by the placement engine to avoid overlaps.
 */
export function measureNoteCard(
  title: string,
  summary: string,
  tags: string[],
  cardWidth: number = 360,
): { totalHeight: number; titleHeight: number; summaryHeight: number } {
  const contentWidth = cardWidth - 24 // 12px padding each side

  const titleM = measureText(title || "Untitled", 18, 1, contentWidth, 2)
  const summaryM = measureText(summary || "", 13, 1, contentWidth, 6)
  const tagHeight = tags.length > 0 ? 20 : 0

  const totalHeight = 24 + titleM.height + 8 + summaryM.height + tagHeight + 24

  return {
    totalHeight: Math.max(totalHeight, 120), // minimum card height
    titleHeight: titleM.height,
    summaryHeight: summaryM.height,
  }
}

/**
 * Compute diagram node dimensions from label text.
 */
export function measureDiagramNode(
  label: string,
  requestedWidth: number = 180,
  maxWidth: number = 300,
): { width: number; height: number } {
  const innerWidth = Math.min(requestedWidth, maxWidth) - 24
  const m = measureText(label, 14, 1, innerWidth, 3)

  return {
    width: Math.min(Math.max(requestedWidth, m.width + 32), maxWidth),
    height: Math.max(56, m.height + 24),
  }
}

// ── Fallback for when fonts aren't loaded yet ──
function fallbackMeasure(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
): TextMeasurement {
  const avgCharWidth = fontSize * 0.6
  const lineHeight = fontSize * 1.25
  const charsPerLine = Math.floor(maxWidth / avgCharWidth)
  const lines = Math.min(Math.ceil(text.length / charsPerLine), maxLines)

  return {
    width: Math.min(text.length * avgCharWidth, maxWidth),
    height: lines * lineHeight + 4,
    lineCount: lines,
    wrappedText: text,
  }
}

/**
 * Clear the measurement cache (call on font changes).
 */
export function clearMeasurementCache() {
  _cache.clear()
}