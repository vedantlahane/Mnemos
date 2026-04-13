import { useCallback, useEffect, useRef } from "react"
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
import { useCanvasEvents, type CanvasCommand } from "../hooks/useCanvasEvents"
import { createNoteCard, createSticky } from "./canvasAI"

interface Props {
  pageId: string
}

function getZoomValue(appState: AppState): number {
  if (
    appState.zoom &&
    typeof appState.zoom === "object" &&
    "value" in appState.zoom
  ) {
    return (appState.zoom as { value: number }).value
  }
  return (appState.zoom as unknown as number) || 1
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
  const canvasSeq = useCanvasEvents((s) => s.seq)
  const canvasConsume = useCanvasEvents((s) => s.consume)

  const userHasInteracted = useRef(false)
  const sceneApplied = useRef(false)

  // Apply initial scene after API is ready
  useEffect(() => {
    if (!initialScene || !excalidrawRef.current || sceneApplied.current) return

    const timer = setTimeout(() => {
      const excApi = excalidrawRef.current
      if (!excApi) return

      excApi.updateScene({ elements: initialScene.elements })

      if (initialScene.appState) {
        const restore: Record<string, unknown> = {}
        if (initialScene.appState.scrollX !== undefined)
          restore.scrollX = initialScene.appState.scrollX
        if (initialScene.appState.scrollY !== undefined)
          restore.scrollY = initialScene.appState.scrollY
        if (initialScene.appState.zoom !== undefined)
          restore.zoom = initialScene.appState.zoom
        if (initialScene.appState.viewBackgroundColor)
          restore.viewBackgroundColor =
            initialScene.appState.viewBackgroundColor

        if (Object.keys(restore).length > 0) {
          excApi.updateScene({
            appState: restore as unknown as Pick<AppState, keyof AppState>,
          })
        }
      }

      sceneApplied.current = true
      setTimeout(() => {
        userHasInteracted.current = true
      }, 2000)
    }, 300)

    return () => clearTimeout(timer)
  }, [initialScene, excalidrawRef])

  // Reset on page change
  useEffect(() => {
    sceneApplied.current = false
    userHasInteracted.current = false
  }, [pageId])

  // Process canvas commands from Zustand store
  useEffect(() => {
    const cmd = canvasConsume()
    if (!cmd) return
    handleCanvasCommand(cmd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSeq])

  function handleCanvasCommand(cmd: CanvasCommand) {
    const drawingApi = excalidrawRef.current

    switch (cmd.type) {
      case "search": {
        const matches = searchElements(cmd.query)
        if (matches.length > 0) {
          scrollToElement(matches[0].id)
          addSystemMessage(
            `Found ${matches.length} match${matches.length > 1 ? "es" : ""} on canvas.`
          )
        } else {
          addSystemMessage(`No matches for "${cmd.query}" on canvas.`)
        }
        break
      }

      case "add": {
        if (!drawingApi) return
        const appState = drawingApi.getAppState()
        const zoomValue = getZoomValue(appState)
        const centerX =
          cmd.x ?? (-appState.scrollX + window.innerWidth / 2) / zoomValue
        const centerY =
          cmd.y ?? (-appState.scrollY + window.innerHeight / 2) / zoomValue

        if (cmd.addType === "sticky") {
          addElements(createSticky(cmd.content, centerX, centerY))
          addSystemMessage("Sticky note added.")
        } else {
          addElements(
            createNoteCard(
              {
                noteId: `manual-${Date.now()}`,
                title: cmd.content.slice(0, 50),
                summary: cmd.content,
                tags: [],
              },
              { x: centerX, y: centerY }
            )
          )
          addSystemMessage("Note card added.")
        }
        break
      }

      case "set-background": {
        if (!drawingApi) return
        drawingApi.updateScene({
          appState: {
            viewBackgroundColor: cmd.color,
          } as unknown as Pick<AppState, keyof AppState>,
        })
        break
      }

      case "open-library": {
        if (!drawingApi) return

        const libraryBtn =
          document.querySelector<HTMLButtonElement>(
            '[data-testid="toolbar-library"]'
          ) ||
          document.querySelector<HTMLButtonElement>(".library-button") ||
          document.querySelector<HTMLButtonElement>(
            '[aria-label="Library"]'
          ) ||
          document.querySelector<HTMLButtonElement>(".ToolIcon__library")

        if (libraryBtn) {
          libraryBtn.click()
          return
        }

        try {
          const apiAny = drawingApi as unknown as {
            toggleSidebar?: (opts: { name: string; force: boolean }) => void
          }
          apiAny.toggleSidebar?.({ name: "library", force: true })
        } catch {
          addSystemMessage(
            "Click the book icon 📚 in the toolbar to open the library."
          )
        }
        break
      }

      case "zoom": {
        if (!drawingApi) return
        const zoomAppState = drawingApi.getAppState()
        const currentZoom = getZoomValue(zoomAppState)

        if (cmd.direction === "fit") {
          const elements = drawingApi.getSceneElements()
          if (elements.length > 0) {
            drawingApi.scrollToContent(elements[0], {
              fitToContent: true,
              animate: true,
            })
          }
          return
        }

        const newZoom =
          cmd.direction === "in"
            ? Math.min(5, currentZoom * 1.25)
            : Math.max(0.1, currentZoom * 0.8)

        drawingApi.updateScene({
          appState: {
            zoom: { value: newZoom },
          } as unknown as Pick<AppState, keyof AppState>,
        })
        break
      }

      case "refresh": {
        reload()
        break
      }
    }
  }

  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (!userHasInteracted.current) return
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
            Loading canvas…
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
    <div
      className="w-full h-full excalidraw-wrapper"
      data-excalidraw-host="true"
    >
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          elements: [],
          appState: {
            viewBackgroundColor: "#0e0e1a",
            theme: "dark" as const,
          },
          files: undefined,
        }}
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