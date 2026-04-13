import { useCallback, useEffect, useRef } from "react"
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw"
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { Loader2, MousePointer2, StickyNote, MessageSquare } from "lucide-react"
import { useExcalidraw } from "./useExcalidraw"
import { useStream } from "../hooks/useStream"
import { useCanvasEvents, type CanvasCommand } from "../hooks/useCanvasEvents"
import { useAppContext } from "../hooks/useAppContext"
import { createNoteCard, createSticky } from "./canvasAI"
import { api } from "../api/client"

interface Props {
  pageId: string
}

function getZoomValue(appState: Record<string, unknown>): number {
  if (appState.zoom && typeof appState.zoom === "object" && "value" in (appState.zoom as object)) {
    return (appState.zoom as { value: number }).value
  }
  return (appState.zoom as number) || 1
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
    searchCanvasBackend,
    scrollToElement,
    reload,
  } = useExcalidraw(pageId)

  const { addSystemMessage } = useStream()
  const { current } = useAppContext()
  const canvasSeq = useCanvasEvents((s) => s.seq)
  const canvasConsume = useCanvasEvents((s) => s.consume)

  const userHasInteracted = useRef(false)
  const sceneApplied = useRef(false)

  // ─── Apply initial scene ──────────────────────
  useEffect(() => {
    if (!initialScene || !excalidrawRef.current || sceneApplied.current) return

    const timer = setTimeout(() => {
      const exc = excalidrawRef.current
      if (!exc) return

      exc.updateScene({ elements: initialScene.elements })

      if (initialScene.appState) {
        const restore: Record<string, unknown> = {}
        const s = initialScene.appState
        if (s.scrollX !== undefined) restore.scrollX = s.scrollX
        if (s.scrollY !== undefined) restore.scrollY = s.scrollY
        if (s.zoom !== undefined) restore.zoom = s.zoom
        if (s.viewBackgroundColor) restore.viewBackgroundColor = s.viewBackgroundColor

        if (Object.keys(restore).length > 0) {
          exc.updateScene({ appState: restore })
        }
      }

      sceneApplied.current = true
      setTimeout(() => {
        userHasInteracted.current = true
      }, 2000)
    }, 300)

    return () => clearTimeout(timer)
  }, [initialScene, excalidrawRef])

  // ─── Reset on page change ─────────────────────
  useEffect(() => {
    sceneApplied.current = false
    userHasInteracted.current = false
  }, [pageId])

  // ─── Process canvas commands ──────────────────
  useEffect(() => {
    const cmd = canvasConsume()
    if (!cmd) return
    handleCanvasCommand(cmd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSeq])

  async function handleCanvasCommand(cmd: CanvasCommand) {
    const exc = excalidrawRef.current

    switch (cmd.type) {
      case "search": {
        const backendResults = await searchCanvasBackend(cmd.query)
        if (backendResults.length > 0) {
          const first = backendResults[0]
          const elementId = first.type === "note" ? `note-frame-${first.id}` : first.id
          scrollToElement(elementId)
          addSystemMessage(
            `Found ${backendResults.length} match${backendResults.length > 1 ? "es" : ""} on canvas.`
          )
        } else {
          const localMatches = searchElements(cmd.query)
          if (localMatches.length > 0) {
            scrollToElement(localMatches[0].id)
            addSystemMessage(
              `Found ${localMatches.length} match${localMatches.length > 1 ? "es" : ""} on canvas.`
            )
          } else {
            addSystemMessage(`No matches for "${cmd.query}" on canvas.`)
          }
        }
        break
      }

      case "add": {
        if (!exc) return
        const appState = exc.getAppState()
        const zoom = getZoomValue(appState)
        const centerX = cmd.x ?? (-(appState.scrollX as number || 0) + window.innerWidth / 2) / zoom
        const centerY = cmd.y ?? (-(appState.scrollY as number || 0) + window.innerHeight / 2) / zoom

        if (cmd.addType === "sticky") {
          addElements(createSticky(cmd.content, centerX, centerY))
          if (current.pageId) {
            try {
              await api.createElement(current.pageId, {
                element_type: "sticky",
                content: cmd.content,
                position_x: centerX,
                position_y: centerY,
                width: 180,
                height: 160,
                created_by: "user",
              })
            } catch { /* non-critical */ }
          }
          addSystemMessage("Sticky note added.")
        } else {
          if (current.pageId) {
            try {
              const resp = await api.capture({
                text: cmd.content,
                capture_type: "manual",
                page_hint: current.pageName,
              })
              addSystemMessage(`Note captured (${resp.note_id}). Processing…`)
              setTimeout(async () => {
                try {
                  const note = await api.getNote(resp.note_id)
                  addElements(
                    createNoteCard(
                      {
                        noteId: note.id,
                        title: note.title || "Untitled",
                        summary: note.summary || note.raw_text,
                        tags: note.tags || [],
                      },
                      { x: centerX, y: centerY }
                    )
                  )
                } catch { /* processing may not be done yet */ }
              }, 3000)
            } catch {
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
              addSystemMessage("Note card added (local only).")
            }
          }
        }
        break
      }

      case "set-background": {
        if (!exc) return
        exc.updateScene({
          appState: { viewBackgroundColor: cmd.color } as unknown as Pick<AppState, keyof AppState>,
        })
        break
      }

      case "open-library": {
        if (!exc) return
        const selectors = [
          '[data-testid="toolbar-library"]',
          ".library-button",
          '[aria-label="Library"]',
          ".ToolIcon__library",
        ]
        for (const sel of selectors) {
          const btn = document.querySelector<HTMLButtonElement>(sel)
          if (btn) { btn.click(); return }
        }
        try {
          const apiAny = exc as unknown as {
            toggleSidebar?: (opts: { name: string; force: boolean }) => void
          }
          apiAny.toggleSidebar?.({ name: "library", force: true })
        } catch {
          addSystemMessage("Click the book icon 📚 in the toolbar to open the library.")
        }
        break
      }

      case "zoom": {
        if (!exc) return
        const zoomAppState = exc.getAppState()
        const currentZoom = getZoomValue(zoomAppState)
        if (cmd.direction === "fit") {
          const elements = exc.getSceneElements()
          if (elements.length > 0) {
            exc.scrollToContent(elements[0], { fitToContent: true, animate: true })
          }
          return
        }
        const newZoom = cmd.direction === "in"
          ? Math.min(5, currentZoom * 1.25)
          : Math.max(0.1, currentZoom * 0.8)
        exc.updateScene({
          appState: { zoom: { value: newZoom } } as unknown as Pick<AppState, keyof AppState>,
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
      saveScene(
        elements as unknown as readonly Record<string, unknown>[],
        appState as unknown as Record<string, unknown>,
        files as unknown as Record<string, unknown>
      )
    },
    [saveScene]
  )

  const handleExcalidrawAPI = useCallback(
    (apiRef: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = apiRef as unknown as typeof excalidrawRef.current
    },
    [excalidrawRef]
  )

  // ─── Loading ──────────────────────────────────
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#0e0e1a" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-[var(--accent)]" size={24} />
          <span className="text-[13px] text-[var(--glass-text-dim)]">Loading canvas…</span>
        </div>
      </div>
    )
  }

  // ─── Error ────────────────────────────────────
  if (error && !initialScene) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#0e0e1a" }}>
        <div className="text-center">
          <p className="text-[var(--red)] mb-2">{error}</p>
          <button onClick={reload} className="text-[var(--accent)] underline text-sm">Retry</button>
        </div>
      </div>
    )
  }

  // Check if canvas is empty (no notes loaded)
  const hasContent = initialScene && initialScene.elements.length > 0

  return (
    <div className="w-full h-full excalidraw-wrapper relative" data-excalidraw-host="true">
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          elements: [],
          appState: { viewBackgroundColor: "#0e0e1a", theme: "dark" as const },
          files: undefined,
        }}
        onChange={handleChange}
        theme="dark"
        langCode="en"
        gridModeEnabled={false}
        viewModeEnabled={false}
        zenModeEnabled={false}
      >
        {/* Override Excalidraw's default welcome screen with our own */}
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>
              <div className="text-[28px] font-extrabold text-white tracking-tight">
                {current.pageName || "Canvas"}
              </div>
            </WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>
              Start drawing or use commands to add notes
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemLink href="#">
                Type /add to create a note card
              </WelcomeScreen.Center.MenuItemLink>
              <WelcomeScreen.Center.MenuItemLink href="#">
                Type /capture to save knowledge
              </WelcomeScreen.Center.MenuItemLink>
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
        </WelcomeScreen>

        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>

      {/* Empty state overlay — shown when canvas has no note content */}
      {!hasContent && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[5]">
          <div className="pointer-events-auto text-center max-w-[320px]">
            <div className="glass rounded-2xl p-8 relative overflow-hidden">
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mx-auto mb-4">
                  <MousePointer2 size={24} className="text-[var(--accent)]" />
                </div>
                <h3 className="text-[16px] font-bold text-white mb-2">
                  Empty Canvas
                </h3>
                <p className="text-[12px] text-[var(--glass-text-dim)] leading-relaxed mb-5">
                  Capture notes to populate this canvas, or draw freely with the tools above.
                </p>
                <div className="flex flex-col gap-2 text-left">
                  <HintRow
                    icon={<StickyNote size={13} />}
                    command="/add sticky: hello"
                    label="Add a sticky note"
                  />
                  <HintRow
                    icon={<MessageSquare size={13} />}
                    command="/capture some text"
                    label="Capture knowledge"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HintRow({
  icon,
  command,
  label,
}: {
  icon: React.ReactNode
  command: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="text-[var(--accent)]">{icon}</div>
      <div>
        <code className="text-[10px] font-mono text-[var(--accent-light)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded">
          {command}
        </code>
        <span className="text-[10px] text-[var(--glass-text-muted)] ml-2">{label}</span>
      </div>
    </div>
  )
}