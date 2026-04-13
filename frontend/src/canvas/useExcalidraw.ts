import { useState, useCallback, useRef, useEffect } from "react"
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { api } from "../api/client"
import { createNoteCard, createSticky, createArrow, createClusterFrame } from "./canvasAI"

export interface CanvasScene {
  elements: ExcalidrawElement[]
  appState: Partial<AppState> & Record<string, unknown>
  files: BinaryFiles
}

const EMPTY_SCENE: CanvasScene = {
  elements: [],
  appState: { viewBackgroundColor: "#0e0e1a", theme: "dark" },
  files: {},
}

interface CustomData {
  noteId?: string
  title?: string
  tags?: string[]
  legacyElementId?: string
  [key: string]: unknown
}

interface NoteLike {
  id: string
  title?: string | null
  summary?: string | null
  raw_text?: string | null
  tags?: string[] | null
  canvas_x?: number | null
  canvas_y?: number | null
}

interface LegacyElement {
  id: string
  element_type: string
  content?: string | null
  position_x?: number | null
  position_y?: number | null
}

function readCustomData(element: ExcalidrawElement): CustomData {
  const el = element as ExcalidrawElement & { customData?: CustomData }
  return el.customData || {}
}

function getGridPosition(
  index: number,
  note: NoteLike
): { x: number; y: number } {
  if (
    typeof note.canvas_x === "number" &&
    typeof note.canvas_y === "number"
  ) {
    return { x: note.canvas_x, y: note.canvas_y }
  }
  const col = index % 3
  const row = Math.floor(index / 3)
  return { x: 100 + col * 420, y: 100 + row * 350 }
}

function normalizeScene(value: unknown): CanvasScene {
  if (!value || typeof value !== "object") {
    return { elements: [], appState: { ...EMPTY_SCENE.appState }, files: {} }
  }
  const scene = value as Partial<CanvasScene>
  return {
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: sanitizeAppState({
      ...EMPTY_SCENE.appState,
      ...(scene.appState || {}),
    }),
    files:
      scene.files && typeof scene.files === "object" ? scene.files : {},
  }
}

function sanitizeAppState(
  appState: CanvasScene["appState"]
): CanvasScene["appState"] {
  const next = { ...appState }
  if (next.gridSize === null || next.gridSize === undefined) {
    delete next.gridSize
  }
  next.viewBackgroundColor = next.viewBackgroundColor || "#0e0e1a"
  next.theme = "dark"
  return next
}

export function useExcalidraw(pageId: string | undefined) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialScene, setInitialScene] = useState<CanvasScene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const currentPageId = useRef<string | undefined>(undefined)

  const loadScene = useCallback(async () => {
    if (!pageId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    currentPageId.current = pageId

    try {
      const pageData = await api.getPageCanvas(pageId)
      if (currentPageId.current !== pageId) return

      const storedScene =
        pageData.page?.canvas_data || pageData.canvas_data
      const scene = normalizeScene(storedScene)

      // Track existing note IDs on canvas
      const existingNoteIds = new Set(
        scene.elements
          .map((el) => readCustomData(el).noteId)
          .filter((id): id is string => Boolean(id))
      )

      const notes: NoteLike[] = Array.isArray(pageData.notes)
        ? (pageData.notes as NoteLike[])
        : []
      const newElements: ExcalidrawElement[] = []

      // For new notes, try AI positioning first
      const notesNeedingPosition = notes.filter(
        (n) => !existingNoteIds.has(n.id)
      )

      if (notesNeedingPosition.length > 0) {
        let aiPositions: Map<string, { x: number; y: number }> | null = null

        if (notesNeedingPosition.length >= 3) {
          try {
            const layout = await api.aiLayout(pageId)
            aiPositions = new Map(
              layout.positions.map((p) => [p.note_id, { x: p.x, y: p.y }])
            )

            // Add cluster frames
            for (const cluster of layout.clusters) {
              const clusterNotePositions = layout.positions
                .filter((p) => p.cluster === cluster.label)
                .map((p) => ({ x: p.x, y: p.y }))

              if (clusterNotePositions.length > 0) {
                const minX =
                  Math.min(...clusterNotePositions.map((p) => p.x)) - 40
                const minY =
                  Math.min(...clusterNotePositions.map((p) => p.y)) - 50
                const maxX =
                  Math.max(...clusterNotePositions.map((p) => p.x)) + 400
                const maxY =
                  Math.max(...clusterNotePositions.map((p) => p.y)) + 280

                newElements.push(
                  ...createClusterFrame(
                    cluster.label,
                    minX,
                    minY,
                    maxX - minX,
                    maxY - minY,
                    cluster.color
                  )
                )
              }
            }

            // Add arrows for edges
            for (const edge of layout.edges) {
              const sourcePos = aiPositions.get(edge.source_id)
              const targetPos = aiPositions.get(edge.target_id)
              if (sourcePos && targetPos) {
                newElements.push(
                  createArrow(
                    sourcePos.x + 180,
                    sourcePos.y + 120,
                    targetPos.x + 180,
                    targetPos.y + 120,
                    edge.edge_type
                  )
                )
              }
            }
          } catch {
            aiPositions = null
          }
        }

        // Create note cards with AI or grid positions
        notesNeedingPosition.forEach((note, index) => {
          const aiPos = aiPositions?.get(note.id)
          const position = aiPos || getGridPosition(index, note)

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
              position
            )
          )
        })
      }

      // Legacy elements
      const legacyElements: LegacyElement[] = Array.isArray(pageData.elements)
        ? (pageData.elements as LegacyElement[])
        : []

      legacyElements.forEach((element, index) => {
        if (
          scene.elements.some(
            (el) => readCustomData(el).legacyElementId === element.id
          )
        )
          return
        if (element.element_type === "sticky" && element.content) {
          const sticky = createSticky(
            element.content,
            element.position_x ?? 120 + index * 40,
            element.position_y ?? 120 + index * 40
          ).map((el) => ({
            ...el,
            customData: {
              ...readCustomData(el),
              legacyElementId: element.id,
            },
          }))
          newElements.push(...(sticky as ExcalidrawElement[]))
        }
      })

      if (newElements.length > 0) {
        scene.elements = [...scene.elements, ...newElements]
      }

      setInitialScene(scene)
    } catch (err) {
      console.error("Canvas load error:", err)
      if (currentPageId.current === pageId) {
        setError("Failed to load canvas")
        setInitialScene({ ...EMPTY_SCENE })
      }
    } finally {
      if (currentPageId.current === pageId) {
        setLoading(false)
      }
    }
  }, [pageId])

  useEffect(() => {
    setInitialScene(null)
    excalidrawRef.current = null
    loadScene()

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [loadScene])

  const saveScene = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      _files: BinaryFiles
    ) => {
      if (!pageId || isSaving.current) return

      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        if (isSaving.current) return
        isSaving.current = true
        try {
          const serializedElements = elements.map((el) => {
            try {
              return structuredClone(el)
            } catch {
              const plain: Record<string, unknown> = {}
              for (const key of Object.keys(el)) {
                plain[key] = (el as Record<string, unknown>)[key]
              }
              return plain
            }
          })

          await api.updatePage(pageId, {
            canvas_data: {
              elements: serializedElements,
              appState: {
                viewBackgroundColor: appState.viewBackgroundColor,
                theme: appState.theme,
                zoom: appState.zoom,
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
              },
              files: _files || {},
            },
          })
        } catch (err) {
          console.error("Canvas save failed:", err)
        } finally {
          isSaving.current = false
        }
      }, 2500)
    },
    [pageId]
  )

  const addElements = useCallback((newElements: ExcalidrawElement[]) => {
    const drawingApi = excalidrawRef.current
    if (!drawingApi) return
    const currentElements = drawingApi.getSceneElements()
    drawingApi.updateScene({
      elements: [...currentElements, ...newElements],
    })
  }, [])

  const scrollToElement = useCallback((elementId: string) => {
    const drawingApi = excalidrawRef.current
    if (!drawingApi) return
    const target = drawingApi
      .getSceneElements()
      .find((el) => el.id === elementId)
    if (target) {
      drawingApi.scrollToContent(target, {
        fitToContent: true,
        animate: true,
      })
    }
  }, [])

  const searchElements = useCallback(
    (query: string): ExcalidrawElement[] => {
      const drawingApi = excalidrawRef.current
      if (!drawingApi) return []
      const lower = query.toLowerCase()

      return drawingApi.getSceneElements().filter((element) => {
        const custom = readCustomData(element)
        if (
          element.type === "text" &&
          (element as ExcalidrawElement & { text?: string }).text
            ?.toLowerCase()
            .includes(lower)
        )
          return true
        if (custom.title?.toLowerCase().includes(lower)) return true
        if (
          custom.tags?.some((tag: string) =>
            tag.toLowerCase().includes(lower)
          )
        )
          return true
        return false
      })
    },
    []
  )

  return {
    excalidrawRef,
    loading,
    initialScene,
    error,
    saveScene,
    addElements,
    scrollToElement,
    searchElements,
    reload: loadScene,
  }
}