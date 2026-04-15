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
import { useNotebookMode } from "../hooks/useNotebookMode"
import { CanvasApplier } from "../lib/canvasApplier"
import { initPretext, createNoteCard, createSticky, createTextBare, layoutText } from "./canvasAI"
import { readCanvasContext, findOpenPosition, findStackPosition } from "./canvasContext"
import { renderTopology } from "./diagramRenderer"
import { api } from "../api/client"
import { nanoid } from "../utils"

interface Props {
  pageId: string
  viewMode?: "canvas" | "notebook"
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
    "scrollX", "scrollY", "zoom", "viewBackgroundColor", "theme",
    "currentItemStrokeColor", "currentItemBackgroundColor",
    "currentItemFillStyle", "currentItemStrokeWidth", "currentItemStrokeStyle",
    "currentItemRoughness", "currentItemRoundness", "currentItemOpacity",
    "currentItemFontFamily", "currentItemFontSize", "currentItemTextAlign",
    "currentItemStartArrowhead", "currentItemEndArrowhead",
    "gridSize", "openSidebar",
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
    "theme", "viewBackgroundColor",
    "currentItemStrokeColor", "currentItemBackgroundColor",
    "currentItemFillStyle", "currentItemStrokeWidth", "currentItemStrokeStyle",
    "currentItemRoughness", "currentItemOpacity", "currentItemFontFamily",
    "currentItemFontSize", "currentItemTextAlign",
    "currentItemStartArrowhead", "currentItemEndArrowhead", "currentItemRoundness",
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
    blocks.push({
      text: chunk,
      width: Math.max(420, measured.width + 12),
      height: Math.max(80, measured.height + 16),
    })
  }
  return blocks.slice(0, 32)
}

function elementBounds(elements: Array<Record<string, unknown>>): {
  minX: number; minY: number; maxX: number; maxY: number
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of elements) {
    let elMinX = Number(el.x || 0)
    let elMinY = Number(el.y || 0)
    let elMaxX = elMinX + Math.max(1, Number(el.width || 0))
    let elMaxY = elMinY + Math.max(1, Number(el.height || 0))
    
    if (el.points && Array.isArray(el.points)) {
      for (const pt of el.points) {
        if (Array.isArray(pt) && pt.length >= 2) {
          elMinX = Math.min(elMinX, Number(el.x || 0) + Number(pt[0]))
          elMinY = Math.min(elMinY, Number(el.y || 0) + Number(pt[1]))
          elMaxX = Math.max(elMaxX, Number(el.x || 0) + Number(pt[0]))
          elMaxY = Math.max(elMaxY, Number(el.y || 0) + Number(pt[1]))
        }
      }
    }
    
    minX = Math.min(minX, elMinX)
    minY = Math.min(minY, elMinY)
    maxX = Math.max(maxX, elMaxX)
    maxY = Math.max(maxY, elMaxY)
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

function translateElements(
  elements: Array<Record<string, unknown>>,
  dx: number,
  dy: number
): Array<Record<string, unknown>> {
  return elements.map((el) => ({
    ...el,
    x: Number(el.x || 0) + dx,
    y: Number(el.y || 0) + dy,
  }))
}

function collidesRect(
  x: number, y: number, width: number, height: number,
  occupied: Array<{ x: number; y: number; w: number; h: number }>,
  padding = 28
): boolean {
  for (const r of occupied) {
    if (
      x < r.x + r.w + padding &&
      x + width + padding > r.x &&
      y < r.y + r.h + padding &&
      y + height + padding > r.y
    ) return true
  }
  return false
}

function candidateDiagramAnchors(
  ctx: ReturnType<typeof readCanvasContext>,
  width: number, height: number
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
    return translateElements(rawElements, chosen.x + 12 - bounds.minX, chosen.y + 12 - bounds.minY)
  }
  const fallback = findOpenPosition(ctx, currentW, currentH, 36)
  return translateElements(rawElements, fallback.x + 12 - bounds.minX, fallback.y + 12 - bounds.minY)
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
    if (words.length === 0) { committedLines.push(""); continue }
    let liveLine = ""
    for (const word of words) {
      liveLine = liveLine ? `${liveLine} ${word}` : word
      const partial = [...committedLines, liveLine].join("\n")
      const sceneEls = exc.getSceneElements() as readonly Record<string, unknown>[]
      const updated = sceneEls.map((el) => {
        if (el.id !== elementId) return el
        return {
          ...el, text: partial, originalText: partial,
          width: finalLayout.width, height: finalLayout.height,
          version: Number(el.version || 1) + 1,
          versionNonce: Math.floor(Math.random() * 2e9),
          updated: Date.now(),
        }
      })
      exc.updateScene({ elements: updated as any })
      await new Promise((r) => setTimeout(r, 0))
    }
    committedLines.push(line)
  }
}

function createPlaceholderElement(): Record<string, unknown> {
  return {
    id: `__placeholder_${nanoid(8)}`,
    type: "rectangle",
    x: -99999, y: -99999, width: 1, height: 1, angle: 0,
    strokeColor: "transparent", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 0, strokeStyle: "solid",
    roughness: 0, opacity: 0, groupIds: [], frameId: null,
    roundness: null, seed: Math.floor(Math.random() * 2e9),
    version: 1, versionNonce: Math.floor(Math.random() * 2e9),
    isDeleted: false, boundElements: null, updated: Date.now(),
    link: null, locked: false,
    customData: { type: "__placeholder" },
  }
}

function hasRealCanvasContent(elements: readonly Record<string, unknown>[]): boolean {
  return elements.some((el) => {
    const custom = (el.customData as Record<string, unknown> | undefined) || {}
    return !String(custom.type || "").startsWith("__placeholder") && !el.isDeleted
  })
}

export default function ExcalidrawCanvas({ pageId, viewMode = "canvas" }: Props) {
  useEffect(() => {
    initPretext().catch(console.error);
  }, [])

  const {
    excalidrawRef, loading, initialScene, error,
    saveScene, addElements, searchElements, searchCanvasBackend,
    scrollToElement, reload,
  } = useExcalidraw(pageId, viewMode)

  const { addSystemMessage } = useStream()
  const { current, switchTo } = useAppContext()
  const canvasSeq = useCanvasEvents((s) => s.seq)
  const canvasConsume = useCanvasEvents((s) => s.consume)
  const { getViewport, onScrollChange } = useViewport(excalidrawRef)

  const isNotebook = viewMode === "notebook"
  const notebook = useNotebookMode(excalidrawRef as React.MutableRefObject<any>, isNotebook, pageId)

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

  useEffect(() => {
    if (!initialScene || !excalidrawRef.current || sceneApplied.current) return
    const timer = setTimeout(() => {
      const exc = excalidrawRef.current
      if (!exc) return
      suppressAutosaveRef.current = true
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
        suppressAutosaveRef.current = false
        if (isNotebook) notebook.relayout()
      }, 100)
    }, 150)
    return () => clearTimeout(timer)
  }, [initialScene, excalidrawRef, isNotebook, notebook])

  useEffect(() => {
    sceneApplied.current = false
    suppressAutosaveRef.current = true
    setEmptyOverlayDismissed(false)
    setHasLiveContent(false)
  }, [pageId, viewMode])

  useEffect(() => {
    if (isNotebook && sceneApplied.current) {
      const timer = setTimeout(() => notebook.relayout(), 300)
      return () => clearTimeout(timer)
    }
  }, [isNotebook, notebook])

  useEffect(() => {
    const handler = () => {
      sceneApplied.current = false
      suppressAutosaveRef.current = true
      reload()
    }
    window.addEventListener("mnemos:refresh-canvas", handler)
    return () => window.removeEventListener("mnemos:refresh-canvas", handler)
  }, [reload])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string }>).detail
      const targetPageId = detail?.pageId
      if (!targetPageId || targetPageId === current.pageId) return
      void (async () => {
        try {
          const page = await api.getPage(targetPageId)
          switchTo("page", targetPageId, page.name)
        } catch {
          switchTo("page", targetPageId)
        }
      })()
    }
    window.addEventListener("mnemos:navigate", handler)
    return () => window.removeEventListener("mnemos:navigate", handler)
  }, [current.pageId, switchTo])

  useEffect(() => {
    const cmd = canvasConsume()
    if (!cmd) return
    handleCanvasCommand(cmd)
  }, [canvasSeq])

  async function handleCanvasCommand(cmd: CanvasCommand) {
    const exc = excalidrawRef.current
    if (!exc) return
    const ctx = readCanvasContext(exc as unknown as ExcalidrawImperativeAPI)
    let localYTracker = isNotebook ? notebook.getBottomY() : 0

    switch (cmd.type) {
      case "search": {
        const backendResults = await searchCanvasBackend(cmd.query)
        if (backendResults.length > 0) {
          const first = backendResults[0]
          const elementId = first.type === "note" ? `note-frame-${first.id}` : first.id
          scrollToElement(elementId)
          addSystemMessage(`Found ${backendResults.length} match${backendResults.length > 1 ? "es" : ""} on canvas.`)
        } else {
          const localMatches = searchElements(cmd.query)
          if (localMatches.length > 0) {
            scrollToElement(localMatches[0].id)
            addSystemMessage(`Found ${localMatches.length} match${localMatches.length > 1 ? "es" : ""} on canvas.`)
          } else {
            addSystemMessage(`No matches for "${cmd.query}" on canvas.`)
          }
        }
        break
      }

      case "add": {
        const bgColor = ctx.backgroundColor
        const getPos = () => {
          if (isNotebook) return { x: notebook.getColumn().left + 20, y: localYTracker + 20 }
          return cmd.x !== undefined ? { x: cmd.x, y: cmd.y ?? ctx.viewportCenter.y } : findOpenPosition(ctx, 360, 200)
        }
        
        if (cmd.addType === "text") {
          addElements(createTextBare(cmd.content, getPos().x, getPos().y, bgColor))
          addSystemMessage("Text added.")
        } else if (cmd.addType === "sticky") {
          addElements(createSticky(cmd.content, getPos().x, getPos().y, undefined, bgColor))
          addSystemMessage("Sticky note added.")
        } else {
          const pos = getPos()
          if (current.pageId) {
            try {
              const resp = await api.capture({
                text: cmd.content, capture_type: "manual",
                page_hint: current.pageName, viewport: getViewport(),
              })
              addSystemMessage(`Note captured (${resp.note_id}). Processing…`)
              setTimeout(async () => {
                try {
                  const note = await api.getNote(resp.note_id)
                  addElements(createNoteCard({
                    noteId: note.id, title: note.title || "Untitled",
                    summary: note.summary || note.raw_text, tags: note.tags || [],
                  }, { x: pos.x, y: pos.y }, bgColor))
                  if (isNotebook) notebook.relayout()
                } catch {}
              }, 3000)
            } catch {
              addElements(createNoteCard({
                noteId: `manual-${Date.now()}`, title: cmd.content.slice(0, 50),
                summary: cmd.content, tags: [],
              }, { x: pos.x, y: pos.y }, bgColor))
              addSystemMessage("Note card added (local only).")
            }
          }
        }
        if (isNotebook) setTimeout(() => notebook.relayout(), 100)
        break
      }

      case "ai-compose": {
        const requestText = cmd.request.trim()
        if (!requestText) return
        addSystemMessage("🧠 Drafting structured explanation…")

        try {
          suppressAutosaveRef.current = true
          if (cmd.includeDiagram) {
            try {
              const diagramResp = await api.generateDiagram(requestText, cmd.pageId || current.pageId)
              if (diagramResp.topology) {
                if ((diagramResp.topology as any).app_state) {
                  const appStatePatch = buildAllowedStylePatch((diagramResp.topology as any).app_state)
                  if (Object.keys(appStatePatch).length > 0) {
                    exc.updateScene({ appState: appStatePatch as any })
                  }
                }
                const diagramGroupId = nanoid();
                const diagramElements = renderTopology(diagramResp.topology as any, ctx, diagramGroupId)
                const bounds = elementBounds(diagramElements as any)
                const dw = bounds.maxX - bounds.minX;
                const dh = bounds.maxY - bounds.minY;

                if (isNotebook) {
                  const col = notebook.getColumn();
                  const alignX = col.left + Math.max(0, (col.width - dw)/2)
                  const placedDiagram = translateElements(diagramElements as any, alignX - bounds.minX, localYTracker + 40 - bounds.minY)
                  addElements(placedDiagram as any)
                  localYTracker += dh + 80 // Advance notebook flow!
                } else {
                  addElements(placeDiagramWithoutOverlap(ctx, diagramElements as any) as any)
                }
                addSystemMessage("Diagram added. Now composing text…")
              }
            } catch {
              addSystemMessage("Diagram generation skipped.")
            }
          }

          const chatResp = await api.chat(`Explain: ${requestText}`, [], "page", cmd.pageId || current.pageId)
          const answer = (chatResp.answer || "").trim()
          if (!answer) return

          const blocks = buildCanvasTextBlocks(answer)
          let positions: Array<{ x: number; y: number }>
          
          if (isNotebook) {
            const col = notebook.getColumn()
            positions = blocks.map((b) => {
              const pos = { x: col.left + 20, y: localYTracker + 20 }
              localYTracker += b.height + 28
              return pos
            })
          } else {
            positions = findStackPosition(ctx, blocks.map((b) => ({ width: b.width, height: b.height })), 28)
          }

          for (let idx = 0; idx < blocks.length; idx++) {
            const block = blocks[idx]
            const [textEl] = createTextBare(
              "", positions[idx].x, positions[idx].y, ctx.backgroundColor,
              { fontSize: 16, fontFamily: 1, maxWidth: 540, maxLines: 240, customDataType: "ai-compose-text" }
            )
            addElements([textEl as any])
            await streamTextIntoElement(exc as any, String(textEl.id), block.text, {
              fontSize: 16, fontFamily: 1, maxWidth: 540, maxLines: 240,
            })
          }
          addSystemMessage(`Composed ${blocks.length} text block${blocks.length > 1 ? "s" : ""}.`)
        } catch {
          addSystemMessage("AI composition failed.")
        } finally {
          suppressAutosaveRef.current = false
          flushSceneSave()
          if (isNotebook) setTimeout(() => notebook.relayout(), 200)
        }
        break
      }

      case "generate-diagram": {
        addSystemMessage("🎨 Generating diagram…")
        try {
          suppressAutosaveRef.current = true
          const resp = await api.generateDiagram(cmd.request, cmd.pageId)
          if (resp.topology) {
            if ((resp.topology as any).app_state) {
              const appStatePatch = buildAllowedStylePatch((resp.topology as any).app_state)
              if (Object.keys(appStatePatch).length > 0) {
                exc.updateScene({ appState: appStatePatch as any })
              }
            }
            const diagramGroupId = nanoid();
            const diagramElements = renderTopology(resp.topology as any, ctx, diagramGroupId)
            const bounds = elementBounds(diagramElements as any)

            if (isNotebook) {
              const dw = bounds.maxX - bounds.minX;
              const col = notebook.getColumn();
              const alignX = col.left + Math.max(0, (col.width - dw)/2)
              const placedDiagram = translateElements(diagramElements as any, alignX - bounds.minX, localYTracker + 40 - bounds.minY)
              addElements(placedDiagram as any)
            } else {
              addElements(placeDiagramWithoutOverlap(ctx, diagramElements as any) as any)
            }
            addSystemMessage("Diagram added securely to layout.")
          }
        } catch {
          addSystemMessage("Diagram generation failed.")
        } finally {
          suppressAutosaveRef.current = false
          flushSceneSave()
          if (isNotebook) setTimeout(() => notebook.relayout(), 200)
        }
        break
      }

      case "set-style": {
        const patch = buildAllowedStylePatch(cmd.settings as any)
        if (Object.keys(patch).length === 0) { addSystemMessage("No valid style settings."); return }
        exc.updateScene({ appState: patch as any })
        addSystemMessage("Canvas style updated.")
        break
      }

      case "zoom": {
        if (cmd.direction === "fit") {
          const els = exc.getSceneElements()
          if (els.length > 0) exc.scrollToContent(els[0], { fitToContent: true, animate: true })
          return
        }
        const cz = getZoomValue(exc.getAppState())
        const nz = cmd.direction === "in" ? Math.min(5, cz * 1.25) : Math.max(0.1, cz * 0.8)
        exc.updateScene({ appState: { zoom: { value: nz } } as any })
        break
      }

      case "open-library": {
        try { (exc as any).toggleSidebar?.({ name: "default", tab: "library", force: true }) } catch {}
        break
      }

      case "close-library": {
        try { (exc as any).toggleSidebar?.({ name: "default", tab: "library", force: false }) } catch {}
        break
      }

      case "set-background":
        exc.updateScene({ appState: { viewBackgroundColor: cmd.color } as any })
        break

      case "set-theme":
        exc.updateScene({ appState: { theme: cmd.theme } as any })
        break

      case "refresh":
        reload()
        break
    }
  }

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const hasReal = hasRealCanvasContent(elements as unknown as readonly Record<string, unknown>[])
      setHasLiveContent(hasReal)
      if (hasReal) setEmptyOverlayDismissed(true)

      onScrollChange((appState.scrollX || 0) as number, (appState.scrollY || 0) as number)

      if (isNotebook && !notebook.isLayouting()) {
        notebook.onNotebookChange()
      }

      if (suppressAutosaveRef.current || !sceneApplied.current) return

      saveScene(
        elements as unknown as readonly Record<string, unknown>[],
        appState as unknown as Record<string, unknown>,
        files as unknown as Record<string, unknown>
      )
    },
    [saveScene, onScrollChange, isNotebook, notebook]
  )

  const handleExcalidrawAPI = useCallback(
    (apiRef: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = apiRef as unknown as typeof excalidrawRef.current
      applierRef.current = new CanvasApplier(apiRef)
      useExcalidrawAPI.getState().setAPI(apiRef)

      setTimeout(() => {
        try {
          const api = excalidrawRef.current
          if (!api) return
          if (api.getSceneElements().length === 0) {
            api.updateScene({ elements: [createPlaceholderElement()] })
          }
        } catch {}
      }, 50)
    },
    [excalidrawRef]
  )

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

  const hasRealContent = hasLiveContent || !!(initialScene && hasRealCanvasContent(initialScene.elements as readonly Record<string, unknown>[]))
  const canvasTheme = getCanvasTheme(initialScene?.appState)
  const canvasBg = getCanvasBackground(initialScene?.appState)

  return (
    <div
      className={`w-full h-full excalidraw-wrapper relative ${isNotebook ? "notebook-mode" : ""}`}
      data-excalidraw-host="true"
      onPointerDownCapture={() => setEmptyOverlayDismissed(true)}
      onWheelCapture={() => setEmptyOverlayDismissed(true)}
    >
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          elements: [createPlaceholderElement() as any],
          appState: {
            viewBackgroundColor: canvasBg,
            theme: canvasTheme,
            ...(isNotebook ? { gridSize: 0 } : {}),
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

      {!hasRealContent && !emptyOverlayDismissed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
          <div className="pointer-events-auto">
            <div className="glass rounded-2xl p-8 relative overflow-hidden max-w-[320px]">
              <div className="relative z-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mx-auto mb-4">
                  <MousePointer2 size={24} className="text-[var(--accent)]" />
                </div>
                <h3 className="text-[16px] font-bold text-white mb-2">
                  {isNotebook ? "Empty Notebook" : "Empty Canvas"}
                </h3>
                <p className="text-[12px] text-[var(--glass-text-dim)] leading-relaxed mb-5">
                  {isNotebook
                    ? "Start typing or generating. Elements will perfectly flow vertically without overlap."
                    : "Capture notes or draw freely."
                  }
                </p>
                <div className="flex flex-col gap-2 text-left">
                  <HintRow icon={<StickyNote size={13} />} command="/add sticky: hello" label="Add a sticky" />
                  <HintRow icon={<MessageSquare size={13} />} command="/diagram architecture" label="Generate architecture" />
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
        <code className="text-[10px] font-mono text-[var(--accent-light)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded border border-[var(--accent)]/10">{command}</code>
        <span className="text-[10px] text-[var(--glass-text-muted)] ml-2">{label}</span>
      </div>
    </div>
  )
}