// === FILE: frontend/src/lib/sanitizeScene.ts ===

/**
 * Excalidraw 0.18 crashes on null/undefined for many element properties.
 * Most critically: elements MUST have an 'index' property for fractional indexing.
 * Without it, isPointOnShape() crashes when accessing element.roundness.type.
 * 
 * The backend (Python) serializes None → JSON null, and Excalidraw does:
 *   - element.backgroundColor.length  → crash if null
 *   - element.roundness.type          → crash if undefined  
 *   - element.index                   → REQUIRED (fractional indexing)
 *   - element.strokeColor.length      → crash if null
 *
 * This sanitizer ensures every element has safe values before Excalidraw touches it.
 */

import type { ExcalidrawScene, ExcalidrawElement } from "@/api/types"

// Simple fractional index generator for sanitization
let _sanitizeIdx = 0
function nextIndex(): string {
  _sanitizeIdx++
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let n = _sanitizeIdx
  const result: string[] = []
  while (n > 0 || result.length === 0) {
    result.push(chars[n % chars.length])
    n = Math.floor(n / chars.length)
  }
  return "a" + result.reverse().join("")
}

// Fields that MUST be strings (Excalidraw calls .length on them)
const STRING_DEFAULTS: Record<string, string> = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeStyle: "solid",
  text: "",
  originalText: "",
  fontFamily: "",  // handled separately as number
}

// Fields that MUST be arrays
const ARRAY_FIELDS = ["groupIds", "boundElements", "points", "pressures"] as const

function sanitizeElement(el: ExcalidrawElement): ExcalidrawElement {
  if (!el || typeof el !== "object") return el

  let patched: Record<string, unknown> | null = null

  const ensure = (field: string, value: unknown) => {
    if (!patched) patched = { ...el }
    patched[field] = value
  }

  // ── CRITICAL: Excalidraw 0.18 requires "index" for fractional indexing ──
  // Without index, internal shape cache doesn't build, causing isPointOnShape to crash
  if (!(el as any).index) {
    ensure("index", nextIndex())
  }

  // ── String fields: must not be null/undefined ──
  for (const [field, fallback] of Object.entries(STRING_DEFAULTS)) {
    const val = (el as any)[field]
    if (val === null || val === undefined) {
      // Only patch fields that exist on this element type or are in base
      if (field in el || ["strokeColor", "backgroundColor", "fillStyle", "strokeStyle"].includes(field)) {
        ensure(field, fallback)
      }
    }
  }

  // ── roundness: must be object-with-type OR null — never undefined ──
  // Excalidraw does `element.roundness.type` without null-guard
  const roundness = (el as any).roundness
  if (roundness === undefined) {
    ensure("roundness", null)
  } else if (roundness !== null && typeof roundness === "object" && !("type" in roundness)) {
    // Has roundness object but missing .type
    ensure("roundness", { ...roundness, type: 3 })
  }

  // ── Array fields: must not be null/undefined ──
  for (const field of ARRAY_FIELDS) {
    if (field in el && ((el as any)[field] === null || (el as any)[field] === undefined)) {
      ensure(field, [])
    }
  }

  // ── customData: must be object or undefined, never null ──
  if ((el as any).customData === null) {
    ensure("customData", {})
  }

  // ── link: Excalidraw checks link !== null in some paths ──
  // Actually link CAN be null — that's fine. But undefined would be bad.
  // Leave as-is.

  // ── Numeric fields that must exist on their types ──
  if (el.type === "text") {
    if ((el as any).fontSize == null) ensure("fontSize", 16)
    if ((el as any).fontFamily == null) ensure("fontFamily", 1)
    if ((el as any).lineHeight == null) ensure("lineHeight", 1.25)
    if ((el as any).textAlign == null) ensure("textAlign", "left")
    if ((el as any).verticalAlign == null) ensure("verticalAlign", "top")
    // text and originalText must be strings
    if (typeof (el as any).text !== "string") ensure("text", "")
    if (typeof (el as any).originalText !== "string") ensure("originalText", (el as any).text ?? "")
  }

  if (el.type === "arrow" || el.type === "line") {
    // points must be an array with at least 2 entries
    const pts = (patched ?? el as any).points
    if (!Array.isArray(pts) || pts.length < 2) {
      ensure("points", [[0, 0], [1, 0]])
    }
    // startBinding/endBinding can be null (that's fine)
    // but startArrowhead/endArrowhead must be string or null
  }

  if (el.type === "freedraw") {
    if ((el as any).simulatePressure == null) ensure("simulatePressure", true)
    if (!Array.isArray((el as any).pressures)) ensure("pressures", [])
  }

  // ── width/height must be numbers ──
  if (typeof el.width !== "number" || isNaN(el.width)) ensure("width", 1)
  if (typeof el.height !== "number" || isNaN(el.height)) ensure("height", 1)

  // ── seed/version must be positive integers ──
  if (typeof (el as any).seed !== "number") ensure("seed", Math.floor(Math.random() * 2_147_483_647))
  if (typeof (el as any).version !== "number") ensure("version", 1)
  if (typeof (el as any).versionNonce !== "number") ensure("versionNonce", Math.floor(Math.random() * 2_147_483_647))

  // ── opacity must be a number ──
  if (typeof (el as any).opacity !== "number") ensure("opacity", 100)

  return patched ? (patched as ExcalidrawElement) : el
}

export function sanitizeScene(scene: ExcalidrawScene): ExcalidrawScene {
  if (!scene) return scene
  if (!scene.elements || !Array.isArray(scene.elements)) {
    return { ...scene, elements: [] }
  }

  // Reset index counter for each scene sanitization pass
  _sanitizeIdx = 0
  const sanitized = scene.elements.map(sanitizeElement)
  return { ...scene, elements: sanitized }
}

export function sanitizeElements(
  elements: ExcalidrawElement[],
): ExcalidrawElement[] {
  if (!elements) return []
  _sanitizeIdx = 0
  return elements.map(sanitizeElement)
}

