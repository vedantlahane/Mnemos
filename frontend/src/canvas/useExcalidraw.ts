import { useState, useCallback, useRef, useEffect } from "react"
import type { ExcalidrawImperativeAPI, AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { api } from "../api/client"
import { createNoteCard, createSticky } from "./canvasAI"

export interface CanvasScene {
  elements: ExcalidrawElement[]
  appState: Partial<AppState> & Record<string, unknown>
  files: BinaryFiles
}

const EMPTY_SCENE: CanvasScene = {
  elements: [],
  appState: {
    viewBackgroundColor: "#0e0e1a",
    theme: "dark",
  },
  files: {},
}

export function useExcalidraw(pageId: string | undefined) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialScene, setInitialScene] = useState<CanvasScene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadScene = useCallback(async () => {
    if (!pageId) return

    setLoading(true)
    setError(null)

    try {
      const pageData = await api.getPageCanvas(pageId)
      const storedScene = pageData.page?.canvas_data || pageData.canvas_data
      const scene = normalizeScene(storedScene)

      const existingNoteIds = new Set(
        scene.elements
          .map((el) => readCustomData(el).noteId)
          .filter((noteId): noteId is string => Boolean(noteId))
      )

      const notes = Array.isArray(pageData.notes) ? pageData.notes : []
      const newElements: ExcalidrawElement[] = []

      notes.forEach((note: NoteLike, index: number) => {
        if (!existingNoteIds.has(note.id)) {
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
              getGridPosition(index, note)
            )
          )
        }
      })

      const legacyElements = Array.isArray(pageData.elements) ? pageData.elements : []
      legacyElements.forEach((element: LegacyElement, index: number) => {
        if (scene.elements.some((el) => readCustomData(el).legacyElementId === element.id)) return
        if (element.element_type === "sticky" && element.content) {
          const sticky = createSticky(
            element.content,
            element.position_x ?? 120 + index * 40,
            element.position_y ?? 120 + index * 40
          ).map((el) => ({
            ...el,
            customData: { ...readCustomData(el), legacyElementId: element.id },
          }))
          newElements.push(...sticky)
        }
      })

      if (newElements.length > 0) {
        scene.elements = [...scene.elements, ...newElements]
      }

      setInitialScene(scene)
      excalidrawRef.current?.updateScene({
        elements: scene.elements,
      })
    } catch (err) {
      console.error("Canvas load error:", err)
      setError("Failed to load canvas")
      setInitialScene(EMPTY_SCENE)
    } finally {
      setLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    loadScene()

    const onRefresh = () => loadScene()
    window.addEventListener("canvas:refresh", onRefresh)
    return () => window.removeEventListener("canvas:refresh", onRefresh)
  }, [loadScene])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const saveScene = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (!pageId) return

      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        try {
          await api.updatePage(pageId, {
            canvas_data: {
              elements: elements.map((element) => ({ ...element })),
              appState: {
                viewBackgroundColor: appState.viewBackgroundColor,
                theme: appState.theme,
                zoom: appState.zoom,
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
                gridSize: appState.gridSize,
              },
              files: files || {},
            },
          })
        } catch (err) {
          console.error("Canvas save failed:", err)
        }
      }, 1500)
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

    const target = drawingApi.getSceneElements().find((el) => el.id === elementId)
    if (target) {
      drawingApi.scrollToContent(target, { fitToContent: true, animate: true })
    }
  }, [])

  const searchElements = useCallback((query: string): ExcalidrawElement[] => {
    const drawingApi = excalidrawRef.current
    if (!drawingApi) return []

    const lower = query.toLowerCase()

    return drawingApi.getSceneElements().filter((element) => {
      const customData = readCustomData(element)
      if (element.type === "text" && element.text?.toLowerCase().includes(lower)) return true
      if (customData.title?.toLowerCase().includes(lower)) return true
      if (customData.tags?.some((tag) => tag.toLowerCase().includes(lower))) return true
      return false
    })
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
    reload: loadScene,
  }
}

function normalizeScene(value: unknown): CanvasScene {
  if (!value || typeof value !== "object") return { ...EMPTY_SCENE }

  const scene = value as Partial<CanvasScene>
  return {
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: sanitizeAppState({
      ...EMPTY_SCENE.appState,
      ...(scene.appState || {}),
      viewBackgroundColor: "#0e0e1a",
      theme: "dark",
    }),
    files: scene.files || {},
  }
}

function sanitizeAppState(appState: CanvasScene["appState"]): CanvasScene["appState"] {
  const next = { ...appState }
  if (next.gridSize === null) {
    delete next.gridSize
  }
  return next
}

function getGridPosition(index: number, note: NoteLike): { x: number; y: number } {
  if (typeof note.canvas_x === "number" && typeof note.canvas_y === "number") {
    return { x: note.canvas_x, y: note.canvas_y }
  }

  const col = index % 3
  const row = Math.floor(index / 3)
  return {
    x: 100 + col * 420,
    y: 100 + row * 350,
  }
}

function readCustomData(element: ExcalidrawElement): CustomData {
  return ((element as ExcalidrawElement & { customData?: CustomData }).customData || {}) as CustomData
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
