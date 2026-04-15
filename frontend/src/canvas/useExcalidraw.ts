import { useState, useCallback, useRef, useEffect } from "react"
import { api } from "../api/client"
import {
  createNoteCard,
  createSticky,
  createEdgeArrow,
  createClusterFrame,
} from "./canvasAI"
import type { Note, NoteEdge, Cluster } from "../types"

// ─── Use generic types to avoid deep import issues ─────
type ExcalidrawAPI = {
  updateScene: (scene: Record<string, unknown>) => void
  getSceneElements: () => ExcalidrawEl[]
  getAppState: () => Record<string, unknown>
  scrollToContent: (el: unknown, opts?: Record<string, unknown>) => void
  getFiles: () => Record<string, unknown>
}

type ExcalidrawEl = Record<string, unknown> & {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  customData?: Record<string, unknown>
  text?: string
}

export interface CanvasScene {
  elements: ExcalidrawEl[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

const DARK_BG = "#0e0e1a"

const EMPTY_SCENE: CanvasScene = {
  elements: [],
  appState: { viewBackgroundColor: DARK_BG, theme: "dark" },
  files: {},
}

function getSceneBackground(scene: CanvasScene): string {
  const bg = scene.appState?.viewBackgroundColor
  return typeof bg === "string" && bg.length > 0 ? bg : DARK_BG
}

function normalizeTheme(theme: unknown, bg: string): "dark" | "light" {
  if (theme === "dark" || theme === "light") return theme
  const h = bg.replace("#", "")
  if (h.length < 6) return "dark"
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luma < 0.5 ? "dark" : "light"
}

function getCustomData(el: ExcalidrawEl): Record<string, unknown> {
  return (el.customData as Record<string, unknown>) || {}
}

function isNotebookProjectionCustomData(custom: Record<string, unknown> | undefined): boolean {
  if (!custom) return false
  if (custom.notebookProjection === true) return true
  return String(custom.type || "").startsWith("notebook-projection")
}

function getGridPos(index: number, note: Note): { x: number; y: number } {
  if (typeof note.canvas_x === "number" && typeof note.canvas_y === "number") {
    return { x: note.canvas_x, y: note.canvas_y }
  }
  const col = index % 3
  const row = Math.floor(index / 3)
  return { x: 100 + col * 420, y: 100 + row * 350 }
}

function normalizeElementShape(value: unknown): ExcalidrawEl | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>

  const id = typeof raw.id === "string" ? raw.id : ""
  if (!id) return null

  const toFiniteNumber = (input: unknown, fallback = 0): number => {
    const n = typeof input === "number" ? input : Number(input ?? fallback)
    return Number.isFinite(n) ? n : fallback
  }

  const groupIds = Array.isArray(raw.groupIds)
    ? raw.groupIds.filter((g): g is string => typeof g === "string")
    : []

  const customData =
    raw.customData && typeof raw.customData === "object"
      ? (raw.customData as Record<string, unknown>)
      : {}

  return {
    ...raw,
    id,
    type: typeof raw.type === "string" ? raw.type : "rectangle",
    x: toFiniteNumber(raw.x),
    y: toFiniteNumber(raw.y),
    width: toFiniteNumber(raw.width),
    height: toFiniteNumber(raw.height),
    groupIds,
    frameId: raw.frameId ?? null,
    customData,
  } as ExcalidrawEl
}

function normalizeScene(value: unknown): CanvasScene {
  if (!value || typeof value !== "object") return { ...EMPTY_SCENE, elements: [] }
  const s = value as Partial<CanvasScene>
  return {
    elements: Array.isArray(s.elements)
      ? s.elements
          .map((el) => normalizeElementShape(el))
          .filter((el): el is ExcalidrawEl => !!el)
      : [],
    appState: {
      ...EMPTY_SCENE.appState,
      ...(s.appState && typeof s.appState === "object" ? s.appState : {}),
    },
    files: s.files && typeof s.files === "object" ? s.files : {},
  }
}

function toRounded(value: unknown, digits = 2): number {
  const num = typeof value === "number" ? value : Number(value || 0)
  if (!Number.isFinite(num)) return 0
  const factor = 10 ** digits
  return Math.round(num * factor) / factor
}

function buildSaveFingerprint(
  elements: readonly Record<string, unknown>[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>
): string {
  const elementSignature = elements
    .map((el) => {
      const id = String(el.id || "")
      const type = String(el.type || "")
      const version = Number(el.version || 0)
      const deleted = el.isDeleted ? 1 : 0
      const x = toRounded(el.x)
      const y = toRounded(el.y)
      const w = toRounded(el.width)
      const h = toRounded(el.height)
      const textLen = typeof el.text === "string" ? el.text.length : 0
      return `${id}:${type}:${version}:${deleted}:${x}:${y}:${w}:${h}:${textLen}`
    })
    .join("|")

  const zoomValue =
    appState.zoom && typeof appState.zoom === "object"
      ? (appState.zoom as { value: number }).value
      : (appState.zoom as number) || 1

  const appSignature = [
    toRounded(appState.scrollX),
    toRounded(appState.scrollY),
    toRounded(zoomValue, 4),
    String(appState.theme || ""),
    String(appState.viewBackgroundColor || ""),
    String(appState.currentItemStrokeColor || ""),
    String(appState.currentItemBackgroundColor || ""),
    String(appState.currentItemFillStyle || ""),
    String(appState.currentItemStrokeWidth || ""),
    String(appState.currentItemStrokeStyle || ""),
    String(appState.currentItemRoughness || ""),
    String(appState.currentItemOpacity || ""),
    String(appState.currentItemFontFamily || ""),
    String(appState.currentItemFontSize || ""),
    String(appState.currentItemTextAlign || ""),
    String(appState.currentItemStartArrowhead || ""),
    String(appState.currentItemEndArrowhead || ""),
    String(appState.currentItemRoundness || ""),
    String(appState.gridSize || ""),
  ].join(",")

  const fileSignature = Object.keys(files || {}).sort().join(",")

  return `${elements.length}::${elementSignature}::${appSignature}::${fileSignature}`
}

// ─── Note position map for edge rendering ─────────
function buildNotePositionMap(
  elements: ExcalidrawEl[],
  notes: Note[]
): Map<string, { x: number; y: number; w: number; h: number }> {
  const map = new Map<string, { x: number; y: number; w: number; h: number }>()

  // From elements on canvas
  for (const el of elements) {
    const cd = getCustomData(el)
    if (cd.noteId && cd.type === "note-frame") {
      map.set(cd.noteId as string, {
        x: el.x,
        y: el.y,
        w: el.width || 360,
        h: el.height || 240,
      })
    }
  }

  // From note DB positions as fallback
  for (const note of notes) {
    if (!map.has(note.id) && note.canvas_x != null && note.canvas_y != null) {
      map.set(note.id, { x: note.canvas_x, y: note.canvas_y, w: 360, h: 240 })
    }
  }

  return map
}

export function useExcalidraw(
  pageId: string | undefined,
  storageMode: "canvas" | "notebook" = "canvas"
) {
  const excalidrawRef = useRef<ExcalidrawAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialScene, setInitialScene] = useState<CanvasScene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const currentSceneKey = useRef<string | undefined>(undefined)
  const pendingSave = useRef(false)
  const lastQueuedFingerprint = useRef("")
  const lastSavedFingerprint = useRef("")
  const pendingPayload = useRef<{
    elements: readonly Record<string, unknown>[]
    appState: Record<string, unknown>
    files: Record<string, unknown>
    fingerprint: string
    sessionId: number
  } | null>(null)
  const saveSessionRef = useRef(0)

  // ─── Load ──────────────────────────────────────
  const loadScene = useCallback(async () => {
    if (!pageId) {
      currentSceneKey.current = undefined
      setLoading(false)
      return
    }

    const sceneKey = `${pageId}:${storageMode}`

    saveSessionRef.current += 1

    // Cancel any queued local save so stale scene snapshots cannot overwrite
    // freshly loaded backend canvas updates.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingSave.current = false
    pendingPayload.current = null
    lastQueuedFingerprint.current = ""

    setLoading(true)
    setError(null)
    currentSceneKey.current = sceneKey

    try {
      const canvasResp = await api.getPageCanvas(pageId, storageMode)
      if (currentSceneKey.current !== sceneKey) return

      // Parse stored scene
      const storedCanvas = canvasResp.canvas_data || canvasResp.page?.canvas_data || {}
      const scene = normalizeScene(storedCanvas)
      const canvasBg = getSceneBackground(scene)

      // Extract response data
      const notes: Note[] = canvasResp.notes || []
      const edges: NoteEdge[] = canvasResp.edges || []
      const clusters: Cluster[] = canvasResp.clusters || []
      const viewport = canvasResp.viewport || { x: 0, y: 0, zoom: 1 }

      // Apply viewport
      if (viewport) {
        scene.appState.scrollX = viewport.x
        scene.appState.scrollY = viewport.y
        scene.appState.zoom = { value: viewport.zoom || 1 }
      }

      // Track which notes already have elements
      const existingNoteIds = new Set(
        scene.elements
          .map((el) => getCustomData(el).noteId as string | undefined)
          .filter(Boolean)
      )

      // Track existing edge IDs
      const existingEdgeIds = new Set(
        scene.elements
          .map((el) => getCustomData(el).edgeId as string | undefined)
          .filter(Boolean)
      )

      // Track existing cluster IDs
      const existingClusterIds = new Set(
        scene.elements
          .map((el) => getCustomData(el).clusterId as string | undefined)
          .filter(Boolean)
      )

      const newElements: Record<string, unknown>[] = []

      // ── Create note cards for new notes ──
      const notesNeedingCards = notes.filter((n) => !existingNoteIds.has(n.id))

      if (notesNeedingCards.length > 0) {
        let aiPositions: Map<string, { x: number; y: number }> | null = null

        // Try AI layout for ≥3 new notes
        if (notesNeedingCards.length >= 3) {
          try {
            const layout = await api.aiLayout(pageId)
            aiPositions = new Map(
              layout.positions.map((p) => [p.note_id, { x: p.x, y: p.y }])
            )
          } catch {
            aiPositions = null
          }
        } else if (notesNeedingCards.length === 1) {
          // Single note: try AI position
                    try {
            const pos = await api.aiPosition(pageId, notesNeedingCards[0].id)
            aiPositions = new Map([[notesNeedingCards[0].id, { x: pos.x, y: pos.y }]])
          } catch {
            aiPositions = null
          }
        }

        notesNeedingCards.forEach((note, index) => {
          const aiPos = aiPositions?.get(note.id)
          const position = aiPos || getGridPos(index + existingNoteIds.size, note)
          newElements.push(
            ...createNoteCard(
              {
                noteId: note.id,
                title: note.title || "Untitled",
                summary: note.summary || note.raw_text || "",
                tags: note.tags || [],
                x: note.canvas_x ?? undefined,
                y: note.canvas_y ?? undefined,
              },
              position,
              canvasBg
            )
          )
        })
      }

      // ── Cluster frames ──
      for (const cluster of clusters) {
        if (existingClusterIds.has(cluster.id)) continue

        // Find notes in this cluster
        const clusterNotes = notes.filter((n) => n.cluster_id === cluster.id)
        if (clusterNotes.length === 0) continue

        // Build position map including newly created elements
        const allElements = [...scene.elements, ...(newElements as ExcalidrawEl[])]
        const posMap = buildNotePositionMap(allElements, notes)

        const positions = clusterNotes
          .map((n) => posMap.get(n.id))
          .filter((p): p is NonNullable<typeof p> => !!p)

        if (positions.length > 0) {
          const minX = Math.min(...positions.map((p) => p.x))
          const minY = Math.min(...positions.map((p) => p.y))
          const maxX = Math.max(...positions.map((p) => p.x + p.w))
          const maxY = Math.max(...positions.map((p) => p.y + p.h))

          newElements.push(
            ...createClusterFrame(
              cluster.label,
              minX,
              minY,
              maxX - minX,
              maxY - minY,
              cluster.color,
              cluster.id
            )
          )
        }
      }

      // ── Edge arrows ──
      const allElements = [...scene.elements, ...(newElements as ExcalidrawEl[])]
      const posMap = buildNotePositionMap(allElements, notes)

      for (const edge of edges) {
        if (existingEdgeIds.has(edge.id)) continue

        const sourcePos = posMap.get(edge.source_id)
        const targetPos = posMap.get(edge.target_id)
        if (!sourcePos || !targetPos) continue

        // Connect from center-right of source to center-left of target
        const sx = sourcePos.x + sourcePos.w
        const sy = sourcePos.y + sourcePos.h / 2
        const tx = targetPos.x
        const ty = targetPos.y + targetPos.h / 2

        newElements.push(
          createEdgeArrow(sx, sy, tx, ty, edge.edge_type, edge.label || undefined, edge.id)
        )
      }

      // ── Legacy canvas elements (stickies etc.) ──
      const legacyElements = canvasResp.elements || []
      const existingLegacyIds = new Set(
        scene.elements
          .map((el) => getCustomData(el).legacyElementId as string | undefined)
          .filter(Boolean)
      )

      legacyElements.forEach((element, index) => {
        if (existingLegacyIds.has(element.id)) return
        if (element.element_type === "sticky" && element.content) {
          const stickyEls = createSticky(
            element.content,
            element.position_x ?? 120 + index * 40,
            element.position_y ?? 120 + index * 40,
            undefined,
            canvasBg
          ).map((el) => ({
            ...el,
            customData: {
              ...(el.customData || {}),
              legacyElementId: element.id,
            },
          }))
          newElements.push(...stickyEls)
        }
      })

      // ── Merge ──
      if (newElements.length > 0) {
        // Cluster frames should be behind everything
        const frames = newElements.filter(
          (el) => (el.customData as Record<string, unknown>)?.type === "cluster-frame" ||
                  (el.customData as Record<string, unknown>)?.type === "cluster-label"
        )
        const rest = newElements.filter(
          (el) => (el.customData as Record<string, unknown>)?.type !== "cluster-frame" &&
                  (el.customData as Record<string, unknown>)?.type !== "cluster-label"
        )
        scene.elements = [...(frames as ExcalidrawEl[]), ...scene.elements, ...(rest as ExcalidrawEl[])]
      }

      // Baseline autosave fingerprint to loaded backend scene to avoid immediate
      // no-op or stale rewrites right after hydration.
      const loadedFingerprint = buildSaveFingerprint(
        scene.elements as unknown as readonly Record<string, unknown>[],
        scene.appState,
        scene.files,
      )
      lastSavedFingerprint.current = loadedFingerprint
      lastQueuedFingerprint.current = loadedFingerprint

      setInitialScene(scene)
    } catch (err) {
      console.error("Canvas load error:", err)
      if (currentSceneKey.current === sceneKey) {
        setError("Failed to load canvas")
        setInitialScene({ ...EMPTY_SCENE, elements: [] })
      }
    } finally {
      if (currentSceneKey.current === sceneKey) {
        setLoading(false)
      }
    }
  }, [pageId, storageMode])

  // ─── Reset & Load ──────────────────────────────
  useEffect(() => {
    setInitialScene(null)
    excalidrawRef.current = null
    pendingSave.current = false
    pendingPayload.current = null
    lastQueuedFingerprint.current = ""
    lastSavedFingerprint.current = ""
    loadScene()
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [loadScene])

  // ─── Save (debounced, uses dedicated canvas endpoint) ──
  const saveScene = useCallback(
    (
      elements: readonly Record<string, unknown>[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>
    ) => {
      if (!pageId) return

      const persistentElements = elements.filter((el) => {
        const custom =
          el.customData && typeof el.customData === "object"
            ? (el.customData as Record<string, unknown>)
            : undefined
        return !isNotebookProjectionCustomData(custom)
      })

      const fingerprint = buildSaveFingerprint(persistentElements, appState, files)
      if (
        fingerprint === lastSavedFingerprint.current ||
        fingerprint === lastQueuedFingerprint.current
      ) {
        return
      }

      pendingPayload.current = {
        elements: persistentElements,
        appState,
        files,
        fingerprint,
        sessionId: saveSessionRef.current,
      }
      lastQueuedFingerprint.current = fingerprint

      if (saveTimer.current) clearTimeout(saveTimer.current)

      saveTimer.current = setTimeout(async () => {
        const flushPendingSave = async () => {
          const payload = pendingPayload.current
          if (!payload) return

          if (payload.sessionId !== saveSessionRef.current) {
            return
          }

          if (payload.fingerprint === lastSavedFingerprint.current) {
            return
          }

          if (isSaving.current) {
            pendingSave.current = true
            return
          }

          isSaving.current = true
          pendingSave.current = false

          try {
            const clonedElements = payload.elements.map((el) => {
              try {
                return structuredClone(el)
              } catch {
                const plain: Record<string, unknown> = {}
                for (const key of Object.keys(el)) {
                  plain[key] = el[key]
                }
                return plain
              }
            })

            const safeElements = clonedElements
              .map((el) => normalizeElementShape(el))
              .filter((el): el is ExcalidrawEl => !!el)

            const persistedElements = safeElements.filter(
              (el) => !isNotebookProjectionCustomData(getCustomData(el))
            )

            const zoomValue =
              payload.appState.zoom && typeof payload.appState.zoom === "object"
                ? (payload.appState.zoom as { value: number }).value
                : (payload.appState.zoom as number) || 1

            const viewBackgroundColor =
              typeof payload.appState.viewBackgroundColor === "string" &&
              payload.appState.viewBackgroundColor.length > 0
                ? payload.appState.viewBackgroundColor
                : DARK_BG

            const theme = normalizeTheme(payload.appState.theme, viewBackgroundColor)

            const persistentAppState = {
              viewBackgroundColor,
              theme,
              zoom: payload.appState.zoom,
              scrollX: payload.appState.scrollX,
              scrollY: payload.appState.scrollY,
              currentItemStrokeColor: payload.appState.currentItemStrokeColor,
              currentItemBackgroundColor: payload.appState.currentItemBackgroundColor,
              currentItemFillStyle: payload.appState.currentItemFillStyle,
              currentItemStrokeWidth: payload.appState.currentItemStrokeWidth,
              currentItemStrokeStyle: payload.appState.currentItemStrokeStyle,
              currentItemRoughness: payload.appState.currentItemRoughness,
              currentItemOpacity: payload.appState.currentItemOpacity,
              currentItemFontFamily: payload.appState.currentItemFontFamily,
              currentItemFontSize: payload.appState.currentItemFontSize,
              currentItemTextAlign: payload.appState.currentItemTextAlign,
              currentItemStartArrowhead: payload.appState.currentItemStartArrowhead,
              currentItemEndArrowhead: payload.appState.currentItemEndArrowhead,
              currentItemRoundness: payload.appState.currentItemRoundness,
              gridSize: payload.appState.gridSize,
            }

            await api.savePageCanvas(pageId, {
              canvas_data: {
                elements: persistedElements,
                appState: persistentAppState,
                files: payload.files || {},
              },
              viewport: {
                x: (payload.appState.scrollX as number) || 0,
                y: (payload.appState.scrollY as number) || 0,
                zoom: zoomValue,
              },
            }, storageMode)

            lastSavedFingerprint.current = payload.fingerprint
          } catch (err) {
            // Allow retry on the next change when the write fails.
            lastQueuedFingerprint.current = ""
            console.error("Canvas save failed:", err)
          } finally {
            isSaving.current = false
            if (pendingSave.current) {
              pendingSave.current = false
              await flushPendingSave()
            }
          }
        }

        await flushPendingSave()
      }, 2500)
    },
    [pageId, storageMode]
  )

  // ─── Add elements to live scene ────────────────
  const addElements = useCallback((newElements: Record<string, unknown>[]) => {
    const api = excalidrawRef.current
    if (!api) return
    const current = api.getSceneElements()
    api.updateScene({ elements: [...current, ...newElements] })
  }, [])

  // ─── Scroll to element ─────────────────────────
  const scrollToElement = useCallback((elementId: string) => {
    const api = excalidrawRef.current
    if (!api) return
    const target = api.getSceneElements().find((el) => el.id === elementId)
    if (target) {
      api.scrollToContent(target, { fitToContent: true, animate: true })
    }
  }, [])

  // ─── Search elements on canvas ─────────────────
  const searchElements = useCallback((query: string): ExcalidrawEl[] => {
    const api = excalidrawRef.current
    if (!api) return []
    const lower = query.toLowerCase()

    return api.getSceneElements().filter((el) => {
      if (el.isDeleted) return false
      const cd = getCustomData(el)
      if (el.text?.toLowerCase().includes(lower)) return true
      if ((cd.title as string)?.toLowerCase().includes(lower)) return true
      if ((cd.tags as string[])?.some((t) => t.toLowerCase().includes(lower))) return true
      if ((cd.label as string)?.toLowerCase().includes(lower)) return true
      return false
    })
  }, [])

  // ─── Use backend canvas search for better results ──
  const searchCanvasBackend = useCallback(
    async (query: string) => {
      if (!pageId) return []
      try {
        const resp = await api.searchCanvas(pageId, query)
        return resp.results
      } catch {
        return []
      }
    },
    [pageId]
  )

  // ─── Remove note elements ──────────────────────
  const removeNoteElements = useCallback((noteId: string) => {
    const drawApi = excalidrawRef.current
    if (!drawApi) return
    const updated = drawApi.getSceneElements().map((el) => {
      const cd = getCustomData(el)
      if (cd.noteId === noteId) {
        return { ...el, isDeleted: true }
      }
      return el
    })
    drawApi.updateScene({ elements: updated })
  }, [])

  // ─── Remove edge elements ─────────────────────
  const removeEdgeElements = useCallback((edgeId: string) => {
    const drawApi = excalidrawRef.current
    if (!drawApi) return
    const updated = drawApi.getSceneElements().map((el) => {
      const cd = getCustomData(el)
      if (cd.edgeId === edgeId) {
        return { ...el, isDeleted: true }
      }
      return el
    })
    drawApi.updateScene({ elements: updated })
  }, [])

  return {
    excalidrawRef,
    loading,
    initialScene,
    error,
    saveScene,
    addElements,
    scrollToElement,
    searchElements,
    searchCanvasBackend,
    removeNoteElements,
    removeEdgeElements,
    reload: loadScene,
  }
}