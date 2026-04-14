import { useCallback, useEffect, useRef, useState } from "react"
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
import { useViewport } from "../hooks/useViewport"
import { CanvasApplier } from "../lib/canvasApplier"
import { createNoteCard, createSticky, createTextBare, layoutText } from "./canvasAI"
import { readCanvasContext, findOpenPosition, findStackPosition } from "./canvasContext"
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

function getCanvasTheme(appState?: Record<string, unknown>): "light" | "dark" {
  return appState?.theme === "light" ? "light" : "dark"
}

function getCanvasBackground(appState?: Record<string, unknown>): string {
  return typeof appState?.viewBackgroundColor === "string" && appState.viewBackgroundColor.length > 0
    ? appState.viewBackgroundColor
    : "#0e0e1a"
}

function buildRestoredAppState(appState?: Record<string, unknown>): Record<string, unknown> {
  if (!appState) return {}
  const keys = [
    "scrollX",
    "scrollY",
    "zoom",
    "viewBackgroundColor",
    "theme",
    "currentItemStrokeColor",
    "currentItemBackgroundColor",
    "currentItemFillStyle",
    "currentItemStrokeWidth",
    "currentItemStrokeStyle",
    "currentItemRoughness",
    "currentItemRoundness",
    "currentItemOpacity",
    "currentItemFontFamily",
    "currentItemFontSize",
    "currentItemTextAlign",
    "currentItemStartArrowhead",
    "currentItemEndArrowhead",
    "gridSize",
    "openSidebar",
  ]

  const restored: Record<string, unknown> = {}
  for (const key of keys) {
    const value = appState[key]
    if (value !== undefined) restored[key] = value
  }
  return restored
}

function buildAllowedStylePatch(settings: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    "theme",
    "viewBackgroundColor",
    "currentItemStrokeColor",
    "currentItemBackgroundColor",
    "currentItemFillStyle",
    "currentItemStrokeWidth",
    "currentItemStrokeStyle",
    "currentItemRoughness",
    "currentItemOpacity",
    "currentItemFontFamily",
    "currentItemFontSize",
    "currentItemTextAlign",
    "currentItemStartArrowhead",
    "currentItemEndArrowhead",
    "currentItemRoundness",
  ]

  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (settings[key] !== undefined) patch[key] = settings[key]
  }
  return patch
}

function normalizeForCanvas(text: string): string {
  return text
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*\*\s+/gm, "• ")
    .replace(/^\s*-\s+/gm, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\s+$/gm, "")
    .trim()
}

function buildCanvasTextBlocks(
  text: string,
  fontSize = 16,
  fontFamily = 1,
  maxWidth = 540,
  maxLinesPerBlock = 14
): Array<{ text: string; width: number; height: number }> {
  const normalized = normalizeForCanvas(text)
  const wrapped = layoutText(normalized, fontSize, fontFamily, maxWidth, 2000)
  const lines = wrapped.text.split("\n")

  const blocks: Array<{ text: string; width: number; height: number }> = []
  for (let i = 0; i < lines.length; i += maxLinesPerBlock) {
    const chunk = lines.slice(i, i + maxLinesPerBlock).join("\n").trim()
    if (!chunk) continue
    const measured = layoutText(chunk, fontSize, fontFamily, maxWidth, maxLinesPerBlock + 2)
    blocks.push({ text: chunk, width: Math.max(420, measured.width + 12), height: Math.max(80, measured.height + 16) })
  }
  return blocks.slice(0, 32)
}

function elementBounds(elements: Array<Record<string, unknown>>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const el of elements) {
    const x = Number(el.x || 0)
    const y = Number(el.y || 0)
    const w = Math.max(1, Number(el.width || 0))
    const h = Math.max(1, Number(el.height || 0))
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  return { minX, minY, maxX, maxY }
}

function translateElements(elements: Array<Record<string, unknown>>, dx: number, dy: number): Array<Record<string, unknown>> {
  return elements.map((el) => ({
    ...el,
    x: Number(el.x || 0) + dx,
    y: Number(el.y || 0) + dy,
  }))
}

function collidesRect(
  x: number,
  y: number,
  width: number,
  height: number,
  occupied: Array<{ x: number; y: number; w: number; h: number }>,
  padding = 28
): boolean {
  for (const r of occupied) {
    if (
      x < r.x + r.w + padding &&
      x + width + padding > r.x &&
      y < r.y + r.h + padding &&
      y + height + padding > r.y
    ) {
      return true
    }
  }
  return false
}

function candidateDiagramAnchors(
  ctx: ReturnType<typeof readCanvasContext>,
  width: number,
  height: number
): Array<{ x: number; y: number; score: number }> {
  const c = ctx.viewportCenter
  const b = ctx.viewportBounds

  const raw = [
    { x: c.x - width / 2, y: c.y - height / 2 },
    { x: c.x - width / 2, y: b.minY + 40 },
    { x: b.maxX - width - 40, y: b.minY + 40 },
    { x: b.minX + 40, y: b.minY + 40 },
    { x: b.maxX - width - 40, y: c.y - height / 2 },
    { x: b.minX + 40, y: c.y - height / 2 },
    { x: c.x - width / 2, y: b.maxY - height - 40 },
  ]

  return raw.map((p) => {
    const clampedX = Math.max(b.minX + 20, Math.min(p.x, b.maxX - width - 20))
    const clampedY = Math.max(b.minY + 20, Math.min(p.y, b.maxY - height - 20))
    const cx = clampedX + width / 2
    const cy = clampedY + height / 2
    const score = Math.abs(cx - c.x) + Math.abs(cy - c.y)
    return { x: clampedX, y: clampedY, score }
  })
}

function placeDiagramWithoutOverlap(
  ctx: ReturnType<typeof readCanvasContext>,
  rawElements: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (rawElements.length === 0) return rawElements

  const bounds = elementBounds(rawElements)
  const currentW = Math.max(1, bounds.maxX - bounds.minX) + 24
  const currentH = Math.max(1, bounds.maxY - bounds.minY) + 24

  const candidates = candidateDiagramAnchors(ctx, currentW, currentH).sort((a, b) => a.score - b.score)
  const chosen = candidates.find((c) => !collidesRect(c.x, c.y, currentW, currentH, ctx.occupiedRects, 24))

  if (chosen) {
    const dx = chosen.x + 12 - bounds.minX
    const dy = chosen.y + 12 - bounds.minY
    return translateElements(rawElements, dx, dy)
  }

  const fallback = findOpenPosition(ctx, currentW, currentH, 36)
  const dx = fallback.x + 12 - bounds.minX
  const dy = fallback.y + 12 - bounds.minY
  return translateElements(rawElements, dx, dy)
}

async function streamTextIntoElement(
  exc: ExcalidrawImperativeAPI,
  elementId: string,
  fullText: string,
  opts: { fontSize: number; fontFamily: number; maxWidth: number; maxLines: number }
) {
  const finalLayout = layoutText(fullText, opts.fontSize, opts.fontFamily, opts.maxWidth, opts.maxLines)
  const lines = finalLayout.text.split("\n")
  const committedLines: string[] = []

  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean)

    if (words.length === 0) {
      committedLines.push("")
      continue
    }

    let liveLine = ""
    for (const word of words) {
      liveLine = liveLine ? `${liveLine} ${word}` : word
      const partial = [...committedLines, liveLine].join("\n")

      const sceneEls = exc.getSceneElements() as readonly Record<string, unknown>[]
      const updated = sceneEls.map((el) => {
        if (el.id !== elementId) return el
        return {
          ...el,
          text: partial,
          originalText: partial,
          width: finalLayout.width,
          height: finalLayout.height,
          version: Number(el.version || 1) + 1,
          versionNonce: Math.floor(Math.random() * 2_000_000_000),
          updated: Date.now(),
        }
      })

      exc.updateScene({ elements: updated as any })
      await new Promise((r) => setTimeout(r, 0))
    }

    committedLines.push(line)
  }
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

function hasRealCanvasContent(elements: readonly Record<string, unknown>[]): boolean {
  return elements.some((el) => {
    const custom = (el.customData as Record<string, unknown> | undefined) || {}
    return !String(custom.type || "").startsWith("__placeholder") && !el.isDeleted
  })
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
  const { getViewport, onScrollChange } = useViewport(excalidrawRef)
  // getViewport is used for SSE operations and API calls that need viewport context
  void getViewport

  const userHasInteracted = useRef(false)
  const sceneApplied = useRef(false)
  const suppressAutosaveRef = useRef(false)
  const applierRef = useRef<CanvasApplier | null>(null)
  const [emptyOverlayDismissed, setEmptyOverlayDismissed] = useState(false)
  const [hasLiveContent, setHasLiveContent] = useState(false)

  const flushSceneSave = useCallback(() => {
    const exc = excalidrawRef.current
    if (!exc) return
    saveScene(
      exc.getSceneElements() as unknown as readonly Record<string, unknown>[],
      exc.getAppState() as unknown as Record<string, unknown>,
      exc.getFiles() as unknown as Record<string, unknown>
    )
  }, [excalidrawRef, saveScene])

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

      setHasLiveContent(hasRealCanvasContent(elements as readonly Record<string, unknown>[]))
      if (hasRealCanvasContent(elements as readonly Record<string, unknown>[])) {
        setEmptyOverlayDismissed(true)
      }

      exc.updateScene({ elements })

      const restoredAppState = buildRestoredAppState(initialScene.appState)
      if (Object.keys(restoredAppState).length > 0) {
        exc.updateScene({ appState: restoredAppState as any })
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
    setEmptyOverlayDismissed(false)
    setHasLiveContent(false)
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

      case "ai-compose": {
        if (!exc) return

        const requestText = cmd.request.trim()
        if (!requestText) {
          addSystemMessage("Nothing to compose.")
          return
        }

        addSystemMessage("🧠 Drafting structured explanation…")

        try {
          suppressAutosaveRef.current = true
          if (cmd.includeDiagram) {
            try {
              const diagramResp = await api.generateDiagram(requestText, cmd.pageId || current.pageId)
              if (diagramResp.topology) {
                if ((diagramResp.topology as any).app_state && typeof (diagramResp.topology as any).app_state === "object") {
                  const appStatePatch = buildAllowedStylePatch((diagramResp.topology as any).app_state)
                  if (Object.keys(appStatePatch).length > 0) {
                    exc.updateScene({ appState: appStatePatch as unknown as Pick<AppState, keyof AppState> })
                  }
                }
                const diagramCtx = readCanvasContext(exc)
                const diagramElements = renderTopology(diagramResp.topology as any, diagramCtx)
                const placedDiagram = placeDiagramWithoutOverlap(
                  diagramCtx,
                  diagramElements as Array<Record<string, unknown>>
                )
                addElements(placedDiagram as any)
                addSystemMessage("Diagram added. Now composing explanatory text…")
              }
            } catch {
              addSystemMessage("Diagram generation skipped due to an error; continuing with text.")
            }
          }

          const prompt = [
            `Explain the topic for a canvas board: ${requestText}`,
            "Format with clear headings and bullet points.",
            "Keep it concise and structured for visual reading on a whiteboard.",
          ].join("\n")

          const chatResp = await api.chat(prompt, [], "page", cmd.pageId || current.pageId)
          const answer = (chatResp.answer || "").trim()

          if (!answer) {
            addSystemMessage("No explanation returned.")
            return
          }

          const ctx = readCanvasContext(exc)
          const blocks = buildCanvasTextBlocks(answer, 16, 1, 540, 14)
          const sizeHints = blocks.map((b) => ({ width: b.width, height: b.height }))
          const positions = findStackPosition(ctx, sizeHints, 28)

          for (let idx = 0; idx < blocks.length; idx++) {
            const block = blocks[idx]
            const [textEl] = createTextBare(
              "",
              positions[idx].x,
              positions[idx].y,
              ctx.backgroundColor,
              {
                fontSize: 16,
                fontFamily: 1,
                maxWidth: 540,
                maxLines: 240,
                customDataType: "ai-compose-text",
              }
            )
            addElements([textEl as any])
            await streamTextIntoElement(exc as any, String(textEl.id), block.text, {
              fontSize: 16,
              fontFamily: 1,
              maxWidth: 540,
              maxLines: 240,
            })
          }

          addSystemMessage(`Composed ${blocks.length} structured text block${blocks.length > 1 ? "s" : ""} on canvas.`)
        } catch {
          addSystemMessage("AI composition failed. Try again or use /compose with a shorter topic.")
        } finally {
          suppressAutosaveRef.current = false
          flushSceneSave()
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

      case "set-theme": {
        if (!exc) return
        exc.updateScene({
          appState: { theme: cmd.theme } as unknown as Pick<AppState, keyof AppState>,
        })
        break
      }

      case "set-style": {
        if (!exc) return
        const patch = buildAllowedStylePatch(cmd.settings as unknown as Record<string, unknown>)
        if (Object.keys(patch).length === 0) {
          addSystemMessage("No valid style settings provided.")
          return
        }
        exc.updateScene({ appState: patch as unknown as Pick<AppState, keyof AppState> })
        addSystemMessage("Canvas style updated.")
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
          suppressAutosaveRef.current = true
          const resp = await api.generateDiagram(cmd.request, cmd.pageId)
          if (resp.topology) {
            if ((resp.topology as any).app_state && typeof (resp.topology as any).app_state === "object") {
              const appStatePatch = buildAllowedStylePatch((resp.topology as any).app_state)
              if (Object.keys(appStatePatch).length > 0) {
                exc.updateScene({ appState: appStatePatch as unknown as Pick<AppState, keyof AppState> })
              }
            }
            const ctx = readCanvasContext(exc)
            const diagramElements = renderTopology(resp.topology as any, ctx)
            const placedDiagram = placeDiagramWithoutOverlap(
              ctx,
              diagramElements as Array<Record<string, unknown>>
            )
            addElements(placedDiagram as any)
            addSystemMessage(`Diagram created: "${resp.topology.title || "Untitled"}" with ${resp.topology.elements?.length || 0} elements.`)
          } else {
            addSystemMessage("Diagram generation returned empty result.")
          }
        } catch (e) {
          addSystemMessage("Failed to generate diagram. Check backend logs.")
        } finally {
          suppressAutosaveRef.current = false
          flushSceneSave()
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
      const hasReal = hasRealCanvasContent(elements as unknown as readonly Record<string, unknown>[])
      setHasLiveContent(hasReal)
      if (hasReal) setEmptyOverlayDismissed(true)

      // Track scroll changes for viewport
      onScrollChange(
        (appState.scrollX || 0) as number,
        (appState.scrollY || 0) as number
      )

      if (suppressAutosaveRef.current) return
      if (!userHasInteracted.current) return
      saveScene(
        elements as unknown as readonly Record<string, unknown>[],
        appState as unknown as Record<string, unknown>,
        files as unknown as Record<string, unknown>
      )
    },
    [saveScene, onScrollChange]
  )

  const handleExcalidrawAPI = useCallback(
    (apiRef: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = apiRef as unknown as typeof excalidrawRef.current

      // Initialize the CanvasApplier for SSE operations
      applierRef.current = new CanvasApplier(apiRef)

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
  const hasRealContent = hasLiveContent || !!(initialScene && hasRealCanvasContent(initialScene.elements as readonly Record<string, unknown>[]))

  const canvasTheme = getCanvasTheme(initialScene?.appState)
  const canvasBg = getCanvasBackground(initialScene?.appState)

  return (
    <div
      className="w-full h-full excalidraw-wrapper relative"
      data-excalidraw-host="true"
      onPointerDownCapture={() => setEmptyOverlayDismissed(true)}
      onWheelCapture={() => setEmptyOverlayDismissed(true)}
    >
      {/* Excalidraw with placeholder element to prevent welcome screen */}
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          elements: [createPlaceholderElement() as any],
          appState: {
            viewBackgroundColor: canvasBg,
            theme: canvasTheme,
          },
          files: undefined,
        }}
        onChange={handleChange}
        theme={canvasTheme}
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
      {!hasRealContent && !emptyOverlayDismissed && (
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