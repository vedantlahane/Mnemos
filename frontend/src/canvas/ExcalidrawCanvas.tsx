import { useCallback, useEffect, useRef } from "react"
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
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
import { useExcalidrawAPI } from "../hooks/useExcalidrawAPI"
import { createNoteCard, createSticky, createTextBare } from "./canvasAI"
import { readCanvasContext, findOpenPosition } from "./canvasContext"
import { renderTopology } from "./diagramRenderer"
import { api } from "../api/client"
import { nanoid } from "../utils"

interface Props {
  pageId: string
}

function getZoomValue(appState: Record<string, unknown>): number {
  if (appState.zoom && typeof appState.zoom === "object" && "value" in (appState.zoom as object)) {
    return (appState.zoom as { value: number }).value
  }
  return (appState.zoom as number) || 1
}

/**
 * Create an invisible placeholder element so Excalidraw
 * never shows its built-in welcome screen (lock icon / decorations).
 * This is a 1x1 transparent dot far off-screen.
 */
function createPlaceholderElement(): Record<string, unknown> {
  return {
    id: `__placeholder_${nanoid(8)}`,
    type: "rectangle",
    x: -99999,
    y: -99999,
    width: 1,
    height: 1,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 0,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 0,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2e9),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2e9),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    customData: { type: "__placeholder" },
  }
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

      // Always include at least one element to prevent welcome screen
      const elements = initialScene.elements.length > 0
        ? initialScene.elements
        : [createPlaceholderElement()]

      exc.updateScene({ elements })

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
    }, 150)

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
        const ctx = readCanvasContext(exc)
        const bgColor = ctx.backgroundColor

        if (cmd.addType === "text") {
          const pos = cmd.x !== undefined
            ? { x: cmd.x, y: cmd.y ?? ctx.viewportCenter.y }
            : findOpenPosition(ctx, 500, 50)
          addElements(createTextBare(cmd.content, pos.x, pos.y, bgColor))
          if (current.pageId) {
            try {
              await api.createElement(current.pageId, {
                element_type: "text",
                content: cmd.content,
                position_x: pos.x,
                position_y: pos.y,
                width: 500,
                height: 50,
                created_by: "user",
              })
            } catch { /* non-critical */ }
          }
          addSystemMessage("Text added.")
        } else if (cmd.addType === "sticky") {
          const pos = cmd.x !== undefined
            ? { x: cmd.x, y: cmd.y ?? ctx.viewportCenter.y }
            : findOpenPosition(ctx, 180, 160)
          addElements(createSticky(cmd.content, pos.x, pos.y, undefined, bgColor))
          if (current.pageId) {
            try {
              await api.createElement(current.pageId, {
                element_type: "sticky",
                content: cmd.content,
                position_x: pos.x,
                position_y: pos.y,
                width: 180,
                height: 160,
                created_by: "user",
              })
            } catch { /* non-critical */ }
          }
          addSystemMessage("Sticky note added.")
        } else {
          if (current.pageId) {
            const pos = cmd.x !== undefined
              ? { x: cmd.x, y: cmd.y ?? ctx.viewportCenter.y }
              : findOpenPosition(ctx, 360, 240)
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
                    createNoteCard({
                      noteId: note.id,
                      title: note.title || "Untitled",
                      summary: note.summary || note.raw_text,
                      tags: note.tags || [],
                    }, { x: pos.x, y: pos.y }, bgColor)
                  )
                } catch { /* processing may not be done */ }
              }, 3000)
            } catch {
              addElements(
                createNoteCard({
                  noteId: `manual-${Date.now()}`,
                  title: cmd.content.slice(0, 50),
                  summary: cmd.content,
                  tags: [],
                }, { x: pos.x, y: pos.y }, bgColor)
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
        try {
          // Excalidraw's built-in library lives in DEFAULT_SIDEBAR
          // which has name: "default" and defaultTab: "library"
          const toggled = (exc as any).toggleSidebar?.({
            name: "default",
            tab: "library",
            force: true,
          })
          if (toggled === undefined || toggled === false) {
            // Fallback: set openSidebar via updateScene appState
            try {
              exc.updateScene({
                appState: {
                  openSidebar: { name: "default", tab: "library" },
                } as any,
              })
            } catch {
              // Last resort: try clicking the native library button
              const libBtn = document.querySelector(
                '.excalidraw button[data-testid="library-button"], .excalidraw .sidebar-trigger'
              ) as HTMLButtonElement | null
              if (libBtn) libBtn.click()
              else addSystemMessage("Library button not found. Use the Excalidraw toolbar.")
            }
          }
        } catch {
          addSystemMessage("Could not open Excalidraw Library.")
        }
        break
      }

      case "close-library": {
        if (!exc) return
        try {
          (exc as any).toggleSidebar?.({
            name: "default",
            tab: "library",
            force: false,
          })
        } catch {
          try {
            exc.updateScene({
              appState: { openSidebar: null } as any,
            })
          } catch {}
        }
        break
      }

      case "zoom": {
        if (!exc) return
        const zas = exc.getAppState()
        const cz = getZoomValue(zas)
        if (cmd.direction === "fit") {
          const els = exc.getSceneElements()
          if (els.length > 0) exc.scrollToContent(els[0], { fitToContent: true, animate: true })
          return
        }
        const nz = cmd.direction === "in" ? Math.min(5, cz * 1.25) : Math.max(0.1, cz * 0.8)
        exc.updateScene({
          appState: { zoom: { value: nz } } as unknown as Pick<AppState, keyof AppState>,
        })
        break
      }

      case "refresh":
        reload()
        break

      case "generate-diagram": {
        if (!exc) return
        addSystemMessage("🎨 Generating diagram…")
        try {
          const resp = await api.generateDiagram(cmd.request, cmd.pageId)
          if (resp.topology) {
            const ctx = readCanvasContext(exc)
            const diagramElements = renderTopology(resp.topology as any, ctx)
            addElements(diagramElements as any)
            addSystemMessage(`Diagram created: "${resp.topology.title || "Untitled"}" with ${resp.topology.elements?.length || 0} elements.`)
          } else {
            addSystemMessage("Diagram generation returned empty result.")
          }
        } catch (e) {
          addSystemMessage("Failed to generate diagram. Check backend logs.")
        }
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

      // Share the API globally so Library panel can access it
      useExcalidrawAPI.getState().setAPI(apiRef)

      // Immediately inject placeholder to suppress welcome screen
      setTimeout(() => {
        try {
          const api = excalidrawRef.current
          if (!api) return
          const els = api.getSceneElements()
          if (els.length === 0) {
            api.updateScene({ elements: [createPlaceholderElement()] })
          }
        } catch { /* ignore */ }
      }, 50)
    },
    [excalidrawRef]
  )

  // Clean up global API ref on unmount
  useEffect(() => {
    return () => {
      useExcalidrawAPI.getState().clearAPI()
    }
  }, [])

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

  // Check if canvas has real content (not just placeholder)
  const hasRealContent = initialScene && initialScene.elements.some(
    (el) => !(el.customData as Record<string, unknown>)?.type?.toString().startsWith("__placeholder")
  )

  return (
    <div className="w-full h-full excalidraw-wrapper relative" data-excalidraw-host="true">
      {/* Excalidraw with placeholder element to prevent welcome screen */}
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          elements: [createPlaceholderElement() as any],
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

      {/* Custom empty state overlay */}
      {!hasRealContent && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
          <div className="pointer-events-auto">
            <div className="glass rounded-2xl p-8 relative overflow-hidden max-w-[320px]">
              <div className="relative z-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mx-auto mb-4">
                  <MousePointer2 size={24} className="text-[var(--accent)]" />
                </div>
                <h3 className="text-[16px] font-bold text-white mb-2">Empty Canvas</h3>
                <p className="text-[12px] text-[var(--glass-text-dim)] leading-relaxed mb-5">
                  Capture notes or draw freely with the tools above.
                </p>
                <div className="flex flex-col gap-2 text-left">
                  <HintRow icon={<StickyNote size={13} />} command="/add sticky: hello" label="Add a sticky" />
                  <HintRow icon={<MessageSquare size={13} />} command="/capture text" label="Capture note" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HintRow({ icon, command, label }: { icon: React.ReactNode; command: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="text-[var(--accent)]">{icon}</div>
      <div>
        <code className="text-[10px] font-mono text-[var(--accent-light)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded">{command}</code>
        <span className="text-[10px] text-[var(--glass-text-muted)] ml-2">{label}</span>
      </div>
    </div>
  )
}