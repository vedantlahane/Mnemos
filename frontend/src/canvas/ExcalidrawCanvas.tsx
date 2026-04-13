import { useCallback, useEffect } from "react"
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { Loader2 } from "lucide-react"
import { useExcalidraw } from "./useExcalidraw"
import { useStream } from "../hooks/useStream"
import { useAppContext } from "../hooks/useAppContext"
import { createNoteCard, createSticky } from "./canvasAI"
import "@excalidraw/excalidraw/index.css"

interface Props {
  pageId: string
}

interface CanvasAddDetail {
  type: "sticky" | "note"
  content: string
  x?: number
  y?: number
}

export default function ExcalidrawCanvas({ pageId }: Props) {
  const {
    excalidrawRef,
    loading,
    initialScene,
    error,
    saveScene,
    addElements,
    searchElements,
    scrollToElement,
    reload,
  } = useExcalidraw(pageId)

  const { addSystemMessage } = useStream()
  const { current } = useAppContext()

  useEffect(() => {
    function onCanvasSearch(e: Event) {
      const query = (e as CustomEvent<string>).detail
      if (!query) return

      const matches = searchElements(query)
      if (matches.length > 0) {
        scrollToElement(matches[0].id)
        addSystemMessage(
          `Found ${matches.length} match${matches.length > 1 ? "es" : ""} on canvas.`
        )
      } else {
        addSystemMessage(`No matches for "${query}" on canvas.`)
      }
    }

    function onCanvasAdd(e: Event) {
      const detail = (e as CustomEvent<CanvasAddDetail>).detail
      if (!detail?.content) return

      const drawingApi = excalidrawRef.current
      if (!drawingApi) return

      const appState = drawingApi.getAppState()
      const zoomValue =
        appState.zoom && typeof appState.zoom === "object" && "value" in appState.zoom
          ? (appState.zoom as any).value
          : (appState.zoom as number) || 1
      const centerX =
        detail.x ?? (-appState.scrollX + window.innerWidth / 2) / zoomValue
      const centerY =
        detail.y ?? (-appState.scrollY + window.innerHeight / 2) / zoomValue

      if (detail.type === "sticky") {
        addElements(createSticky(detail.content, centerX, centerY))
        addSystemMessage("Sticky note added to canvas.")
        return
      }

      addElements(
        createNoteCard(
          {
            noteId: `manual-${Date.now()}`,
            title: detail.content.slice(0, 50),
            summary: detail.content,
            tags: [],
          },
          { x: centerX, y: centerY }
        )
      )
      addSystemMessage("Note card added to canvas.")
    }

    window.addEventListener("canvas:search", onCanvasSearch)
    window.addEventListener("canvas:add", onCanvasAdd)

    return () => {
      window.removeEventListener("canvas:search", onCanvasSearch)
      window.removeEventListener("canvas:add", onCanvasAdd)
    }
  }, [addElements, addSystemMessage, excalidrawRef, scrollToElement, searchElements])

  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      saveScene(elements, appState, files)
    },
    [saveScene]
  )

  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = api
    },
    [excalidrawRef]
  )

  if (loading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: "#0e0e1a" }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-[var(--accent)]" size={24} />
          <span className="text-[13px] text-[var(--glass-text-dim)]">
            Loading canvas...
          </span>
        </div>
      </div>
    )
  }

  if (error && !initialScene) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: "#0e0e1a" }}
      >
        <div className="text-center">
          <p className="text-[var(--red)] mb-2">{error}</p>
          <button
            onClick={reload}
            className="text-[var(--accent)] underline text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full excalidraw-wrapper">
      <style>{`
        .excalidraw-wrapper {
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        .excalidraw-wrapper .excalidraw {
          --color-primary: #6366f1;
          --color-primary-light: #818cf8;
          --color-brand: #6366f1;
          --color-brand-light: #818cf8;
        }
        .excalidraw-wrapper .excalidraw canvas {
          background: #0e0e1a !important;
        }
      `}</style>

      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={
          initialScene
            ? {
                elements: initialScene.elements,
                appState: {
                  ...initialScene.appState,
                  viewBackgroundColor: "#0e0e1a",
                  theme: "dark" as const,
                },
                files: initialScene.files,
              }
            : {
                elements: [],
                appState: {
                  viewBackgroundColor: "#0e0e1a",
                  theme: "dark" as const,
                },
              }
        }
        onChange={handleChange}
        theme="dark"
        langCode="en"
        gridModeEnabled={false}
        viewModeEnabled={false}
        zenModeEnabled={false}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  )
}