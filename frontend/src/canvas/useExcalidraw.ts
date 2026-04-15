import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../api/client"

type ExcalidrawElement = Record<string, unknown> & {
  id: string
  text?: string
  isDeleted?: boolean
  customData?: Record<string, unknown>
}

type ExcalidrawAPI = {
  updateScene: (scene: Record<string, unknown>) => void
  getSceneElements: () => ExcalidrawElement[]
  getAppState: () => Record<string, unknown>
  getFiles: () => Record<string, unknown>
  scrollToContent: (element: unknown, options?: Record<string, unknown>) => void
}

export interface CanvasScene {
  elements: ExcalidrawElement[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

const DARK_BG = "#0e0e1a"

const EMPTY_SCENE: CanvasScene = {
  elements: [],
  appState: {
    viewBackgroundColor: DARK_BG,
    theme: "dark",
  },
  files: {},
}

function normalizeTheme(theme: unknown, background: string): "light" | "dark" {
  if (theme === "light" || theme === "dark") {
    return theme
  }

  const raw = background.replace("#", "")
  if (raw.length < 6) {
    return "dark"
  }

  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance < 0.4 ? "dark" : "light"
}

function normalizeElement(raw: unknown): ExcalidrawElement | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const rec = raw as Record<string, unknown>
  const id = typeof rec.id === "string" ? rec.id : ""
  if (!id) {
    return null
  }

  const normalized: ExcalidrawElement = {
    ...rec,
    id,
  }

  if (!Array.isArray(normalized.groupIds)) {
    normalized.groupIds = []
  }
  if (normalized.frameId === undefined) {
    normalized.frameId = null
  }
  if (!normalized.customData || typeof normalized.customData !== "object") {
    normalized.customData = {}
  }

  return normalized
}

function normalizeScene(raw: unknown): CanvasScene {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_SCENE, elements: [] }
  }

  const rec = raw as Record<string, unknown>
  const appStateRaw = rec.appState && typeof rec.appState === "object"
    ? (rec.appState as Record<string, unknown>)
    : {}
  const background = typeof appStateRaw.viewBackgroundColor === "string"
    ? appStateRaw.viewBackgroundColor
    : DARK_BG

  const theme = normalizeTheme(appStateRaw.theme, background)

  return {
    elements: Array.isArray(rec.elements)
      ? rec.elements
          .map((el) => normalizeElement(el))
          .filter((el): el is ExcalidrawElement => !!el)
      : [],
    appState: {
      ...EMPTY_SCENE.appState,
      ...appStateRaw,
      viewBackgroundColor: background,
      theme,
    },
    files: rec.files && typeof rec.files === "object"
      ? (rec.files as Record<string, unknown>)
      : {},
  }
}

function toRounded(value: unknown, digits = 2): number {
  const n = typeof value === "number" ? value : Number(value || 0)
  if (!Number.isFinite(n)) {
    return 0
  }
  const factor = 10 ** digits
  return Math.round(n * factor) / factor
}

function fingerprint(
  elements: readonly Record<string, unknown>[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>,
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
      ? (appState.zoom as { value?: number }).value || 1
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

function isNotebookProjection(customData: Record<string, unknown> | undefined): boolean {
  if (!customData) {
    return false
  }
  if (customData.notebookProjection === true) {
    return true
  }
  return String(customData.type || "").startsWith("notebook-projection")
}

export function useExcalidraw(
  pageId: string | undefined,
  _storageMode: "canvas" | "notebook" = "canvas",
) {
  const excalidrawRef = useRef<ExcalidrawAPI | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialScene, setInitialScene] = useState<CanvasScene | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const pendingSave = useRef(false)
  const currentSceneKey = useRef<string | undefined>(undefined)
  const pendingPayload = useRef<{
    elements: readonly Record<string, unknown>[]
    appState: Record<string, unknown>
    files: Record<string, unknown>
    key: string
    sessionId: number
  } | null>(null)
  const saveSessionRef = useRef(0)
  const lastQueuedKey = useRef("")
  const lastSavedKey = useRef("")

  const loadScene = useCallback(async () => {
    if (!pageId) {
      currentSceneKey.current = undefined
      setLoading(false)
      return
    }

    const sceneKey = pageId
    saveSessionRef.current += 1

    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }

    pendingSave.current = false
    pendingPayload.current = null
    lastQueuedKey.current = ""

    setLoading(true)
    setError(null)
    currentSceneKey.current = sceneKey

    try {
      const response = await api.getPageCanvas(pageId, _storageMode)
      if (currentSceneKey.current !== sceneKey) {
        return
      }

      const scene = normalizeScene(response.scene_data || response.canvas_data)
      const viewport = response.viewport || { scroll_x: 0, scroll_y: 0, zoom: 1 }

      scene.appState.scrollX = viewport.scroll_x
      scene.appState.scrollY = viewport.scroll_y
      scene.appState.zoom = { value: viewport.zoom || 1 }

      const loadedKey = fingerprint(
        scene.elements as readonly Record<string, unknown>[],
        scene.appState,
        scene.files,
      )
      lastSavedKey.current = loadedKey
      lastQueuedKey.current = loadedKey

      setInitialScene(scene)
    } catch (err) {
      console.error("Canvas load error", err)
      if (currentSceneKey.current === sceneKey) {
        setError("Failed to load canvas scene")
        setInitialScene({ ...EMPTY_SCENE, elements: [] })
      }
    } finally {
      if (currentSceneKey.current === sceneKey) {
        setLoading(false)
      }
    }
  }, [pageId])

  useEffect(() => {
    setInitialScene(null)
    excalidrawRef.current = null
    pendingSave.current = false
    pendingPayload.current = null
    lastQueuedKey.current = ""
    lastSavedKey.current = ""

    void loadScene()

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }
    }
  }, [loadScene])

  const saveScene = useCallback(
    (
      elements: readonly Record<string, unknown>[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      if (!pageId) {
        return
      }

      const persistentElements = elements.filter((el) => {
        const customData = el.customData && typeof el.customData === "object"
          ? (el.customData as Record<string, unknown>)
          : undefined
        return !isNotebookProjection(customData)
      })

      const key = fingerprint(persistentElements, appState, files)
      if (key === lastSavedKey.current || key === lastQueuedKey.current) {
        return
      }

      pendingPayload.current = {
        elements: persistentElements,
        appState,
        files,
        key,
        sessionId: saveSessionRef.current,
      }
      lastQueuedKey.current = key

      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
      }

      saveTimer.current = setTimeout(async () => {
        const flush = async (): Promise<void> => {
          const payload = pendingPayload.current
          if (!payload) {
            return
          }

          if (payload.sessionId !== saveSessionRef.current) {
            return
          }

          if (payload.key === lastSavedKey.current) {
            return
          }

          if (isSaving.current) {
            pendingSave.current = true
            return
          }

          isSaving.current = true
          pendingSave.current = false

          try {
            const zoomValue =
              payload.appState.zoom && typeof payload.appState.zoom === "object"
                ? (payload.appState.zoom as { value?: number }).value || 1
                : (payload.appState.zoom as number) || 1

            const persistedAppState = {
              viewBackgroundColor:
                typeof payload.appState.viewBackgroundColor === "string"
                  ? payload.appState.viewBackgroundColor
                  : DARK_BG,
              theme: normalizeTheme(payload.appState.theme, String(payload.appState.viewBackgroundColor || DARK_BG)),
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

            await api.savePageCanvas(pageId, { mode: _storageMode,
              canvas_data: {
                elements: payload.elements as ExcalidrawElement[],
                appState: persistedAppState,
                files: payload.files,
              },
              viewport: {
                x: (payload.appState.scrollX as number) || 0,
                y: (payload.appState.scrollY as number) || 0,
                zoom: zoomValue,
              },
            })

            lastSavedKey.current = payload.key
          } catch (err) {
            lastQueuedKey.current = ""
            console.error("Canvas save failed", err)
          } finally {
            isSaving.current = false
            if (pendingSave.current) {
              pendingSave.current = false
              await flush()
            }
          }
        }

        await flush()
      }, 2500)
    },
    [pageId],
  )

  const addElements = useCallback((newElements: Record<string, unknown>[]) => {
    const drawApi = excalidrawRef.current
    if (!drawApi) {
      return
    }
    const current = drawApi.getSceneElements()
    drawApi.updateScene({ elements: [...current, ...newElements] })
  }, [])

  const scrollToElement = useCallback((elementId: string) => {
    const drawApi = excalidrawRef.current
    if (!drawApi) {
      return
    }
    const target = drawApi.getSceneElements().find((el) => el.id === elementId)
    if (target) {
      drawApi.scrollToContent(target, { fitToContent: true, animate: true })
    }
  }, [])

  const searchElements = useCallback((query: string): ExcalidrawElement[] => {
    const drawApi = excalidrawRef.current
    if (!drawApi) {
      return []
    }
    const needle = query.toLowerCase()

    return drawApi.getSceneElements().filter((el) => {
      if (el.isDeleted) {
        return false
      }
      if (typeof el.text === "string" && el.text.toLowerCase().includes(needle)) {
        return true
      }
      const customData = (el.customData || {}) as Record<string, unknown>
      const title = typeof customData.title === "string" ? customData.title.toLowerCase() : ""
      if (title.includes(needle)) {
        return true
      }
      const label = typeof customData.label === "string" ? customData.label.toLowerCase() : ""
      return label.includes(needle)
    })
  }, [])

  const searchCanvasBackend = useCallback(
    async (query: string) => {
      if (!pageId) {
        return [] as Array<{ id: string; type: string }>
      }
      try {
        const result = await api.searchCanvas(pageId, query)
        return result.results
      } catch {
        return [] as Array<{ id: string; type: string }>
      }
    },
    [pageId],
  )

  const removeNoteElements = useCallback((noteId: string) => {
    const drawApi = excalidrawRef.current
    if (!drawApi) {
      return
    }

    const updated = drawApi.getSceneElements().map((el) => {
      const customData = (el.customData || {}) as Record<string, unknown>
      if (customData.noteId === noteId) {
        return { ...el, isDeleted: true }
      }
      return el
    })

    drawApi.updateScene({ elements: updated })
  }, [])

  const removeEdgeElements = useCallback((edgeId: string) => {
    const drawApi = excalidrawRef.current
    if (!drawApi) {
      return
    }

    const updated = drawApi.getSceneElements().map((el) => {
      const customData = (el.customData || {}) as Record<string, unknown>
      if (customData.edgeId === edgeId) {
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
