// === FILE: frontend/src/components/canvas/Canvas.tsx ===

import { useCallback, useMemo, useRef, useEffect } from "react"
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { useCanvas } from "@/hooks/useCanvas"
import { useAppStore } from "@/store"
import { EmptyCanvas } from "./EmptyCanvas"
import { CANVAS_CONTENT_WIDTH, CANVAS_COLUMN_CENTER } from "@/lib/constants"
import { lockCanvas, isCanvasLocked, unlockCanvas } from "@/lib/canvasLock"
import { sanitizeElements } from "@/lib/sanitizeScene"

const FIXED_ZOOM = 1

function computeLockedScrollX(): number {
  return window.innerWidth / 2 - CANVAS_COLUMN_CENTER
}

export function Canvas() {
  const workspace = useAppStore((s) => s.activeWorkspace)
  const { scene, onSceneChange } = useCanvas()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<any>(null)
  const centeredFor = useRef<string | null>(null)
  const scrollXRef = useRef(computeLockedScrollX())

  // Track desired scrollY so we can allow vertical scroll
  const scrollYRef = useRef(0)

  const theme = useMemo(
    () => (scene?.appState?.theme === "light" ? "light" : "dark"),
    [scene?.appState?.theme],
  )

  const setApi = useCallback((api: any) => {
    if (apiRef.current !== api) {
      apiRef.current = api
      ;(window as any).excalidrawAPI = api
    }
  }, [])

  // ── LAYER 1: Block zoom/horizontal at native DOM level ──
  // This fires BEFORE Excalidraw's internal handlers
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    // Block ALL zoom gestures
    const blockZoom = (e: WheelEvent) => {
      // Ctrl/Meta + wheel = zoom → block completely
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return
      }
      // Shift + wheel = horizontal scroll → block
      if (e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return
      }
      // Trackpad horizontal swipe → block
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) + 1) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return
      }
      // Allow vertical scroll through (Excalidraw handles it as scrollY)
    }

    // Block pinch zoom
    const blockPinch = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    // Block keyboard zoom
    const blockKeyZoom = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
      ) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }

    // Block gesture events (Safari trackpad)
    const blockGesture = (e: Event) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    // Use capture phase to fire BEFORE Excalidraw
    el.addEventListener("wheel", blockZoom, { passive: false, capture: true })
    el.addEventListener("touchmove", blockPinch, { passive: false, capture: true })
    el.addEventListener("keydown", blockKeyZoom, { capture: true })
    el.addEventListener("gesturestart", blockGesture, { capture: true })
    el.addEventListener("gesturechange", blockGesture, { capture: true })
    el.addEventListener("gestureend", blockGesture, { capture: true })

    return () => {
      el.removeEventListener("wheel", blockZoom, true)
      el.removeEventListener("touchmove", blockPinch, true)
      el.removeEventListener("keydown", blockKeyZoom, true)
      el.removeEventListener("gesturestart", blockGesture, true)
      el.removeEventListener("gesturechange", blockGesture, true)
      el.removeEventListener("gestureend", blockGesture, true)
    }
  }, [])

  // ── Window resize → recenter ──
  useEffect(() => {
    const onResize = () => {
      scrollXRef.current = computeLockedScrollX()
      const api = apiRef.current
      if (!api) return
      lockCanvas(200)
      api.updateScene({
        appState: {
          scrollX: scrollXRef.current,
          zoom: { value: FIXED_ZOOM as any },
        },
      })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // ── Cleanup on workspace switch ──
  useEffect(() => {
    return () => {
      unlockCanvas()
      centeredFor.current = null
    }
  }, [workspace?.id])

  // ── Center content on first load ──
  useEffect(() => {
    if (!scene || !apiRef.current || !workspace) return
    if (centeredFor.current === workspace.id) return

    const api = apiRef.current
    const t = setTimeout(() => {
      scrollXRef.current = computeLockedScrollX()
      scrollYRef.current = 0
      lockCanvas(500)
      api.updateScene({
        appState: {
          zoom: { value: FIXED_ZOOM as any },
          scrollX: scrollXRef.current,
          scrollY: 0,
        },
      })
      centeredFor.current = workspace.id
    }, 250)
    return () => clearTimeout(t)
  }, [scene, workspace?.id])

  // ── Push theme/background when they change ──
  useEffect(() => {
    const api = apiRef.current
    if (!api || !scene) return
    const bg = scene.appState?.viewBackgroundColor
    if (!bg) return
    lockCanvas(300)
    api.updateScene({
      appState: { theme, viewBackgroundColor: bg },
    })
  }, [theme, scene?.appState?.viewBackgroundColor])

  // ── LAYER 2: Correct in onChange (catches anything DOM blocking missed) ──
  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      _files: BinaryFiles,
    ) => {
      if (isCanvasLocked()) return

      const api = apiRef.current
      if (!api) return

      const fixes: Record<string, unknown> = {}
      let needsFix = false

      // FORCE zoom to 1 — this is the critical fix
      const currentZoom = appState.zoom?.value ?? 1
      if (Math.abs(currentZoom - FIXED_ZOOM) > 0.001) {
        fixes.zoom = { value: FIXED_ZOOM as any }
        needsFix = true
      }

      // FORCE horizontal scroll to locked position
      const targetX = scrollXRef.current
      const currentX = appState.scrollX ?? 0
      if (Math.abs(currentX - targetX) > 2) {
        fixes.scrollX = targetX
        needsFix = true
      }

      // Track vertical scroll (this is allowed)
      scrollYRef.current = appState.scrollY ?? 0

      if (needsFix) {
        lockCanvas(100)
        api.updateScene({ appState: fixes })
        return // don't sync correction frames
      }

      // Everything is within constraints → pass to sync
      onSceneChange(elements, appState as unknown as Record<string, unknown>)
    },
    [onSceneChange],
  )

  // ── LAYER 3: Periodic enforcement (catches edge cases like focus changes) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const api = apiRef.current
      if (!api || isCanvasLocked()) return

      try {
        const state = api.getAppState?.()
        if (!state) return

        const zoom = state.zoom?.value ?? 1
        const scrollX = state.scrollX ?? 0
        const targetX = scrollXRef.current

        if (Math.abs(zoom - FIXED_ZOOM) > 0.01 || Math.abs(scrollX - targetX) > 5) {
          lockCanvas(100)
          api.updateScene({
            appState: {
              zoom: { value: FIXED_ZOOM as any },
              scrollX: targetX,
            },
          })
        }
      } catch {
        // API not ready
      }
    }, 500) // Check every 500ms

    return () => clearInterval(interval)
  }, [])

  // ── Build initial data ──
  const initialData = useMemo(() => {
    if (!scene?.elements) return null

    const elements = sanitizeElements(
      scene.elements.filter(
        (el: any) => el.x != null && el.y != null,
      ) as any,
    )

    return {
      elements: JSON.parse(JSON.stringify(elements)),
      files: scene.files ? JSON.parse(JSON.stringify(scene.files)) : undefined,
      appState: {
        zoom: { value: FIXED_ZOOM as any },
        scrollX: computeLockedScrollX(),
        scrollY: 0,
        theme: theme as any,
        viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#0e0e1a",
      },
    }
  }, [scene, theme])

  const menu = useMemo(
    () => (
      <MainMenu>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu>
    ),
    [],
  )

  if (!workspace) return <EmptyCanvas />

  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-void)]">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <span className="text-sm text-[var(--glass-text-dim)]">Loading canvas…</span>
        </div>
      </div>
    )
  }

  const isLight = theme === "light"
  const gutterBg = isLight ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.15)"
  const gutterBorder = isLight
    ? "1px solid rgba(0,0,0,0.05)"
    : "1px solid rgba(255,255,255,0.03)"
  const gutterWidth = `calc(50% - ${CANVAS_CONTENT_WIDTH / 2}px)`

  return (
    <div className="w-full h-full relative canvas-lock" ref={wrapperRef}>
      {/* Left gutter — pointer-events: none lets clicks through to canvas beneath */}
      <div
        className="absolute top-0 bottom-0 left-0 pointer-events-none z-10"
        style={{ width: gutterWidth, background: gutterBg, borderRight: gutterBorder }}
      />
      {/* Right gutter */}
      <div
        className="absolute top-0 bottom-0 right-0 pointer-events-none z-10"
        style={{ width: gutterWidth, background: gutterBg, borderLeft: gutterBorder }}
      />

      <Excalidraw
        key={`${workspace.id}-${theme}`}
        initialData={initialData ?? undefined}
        excalidrawAPI={setApi}
        onChange={handleChange}
        theme={theme}
        langCode="en"
        gridModeEnabled={false}
        viewModeEnabled={false}
        zenModeEnabled={false}
      >
        {menu}
      </Excalidraw>
    </div>
  )
}