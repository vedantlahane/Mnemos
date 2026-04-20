// === FILE: frontend/src/components/canvas/Canvas.tsx ===

import { useCallback, useMemo, useRef, useEffect } from "react"
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { useCanvas } from "@/hooks/useCanvas"
import { useAppStore } from "@/store"
import { EmptyCanvas } from "./EmptyCanvas"
import {
  CANVAS_CONTENT_WIDTH,
  CANVAS_COLUMN_CENTER,
} from "@/lib/constants"
import { lockCanvas, isCanvasLocked, unlockCanvas } from "@/lib/canvasLock"

function computeLockedScrollX(): number {
  return window.innerWidth / 2 - CANVAS_COLUMN_CENTER
}

export function Canvas() {
  const workspace = useAppStore((s) => s.activeWorkspace)
  const { scene, onSceneChange } = useCanvas()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const excalidrawAPIRef = useRef<any>(null)
  const hasCentered = useRef<string | null>(null)
  const lockedScrollXRef = useRef(computeLockedScrollX())

  // ── Derive theme from scene ──
  const sceneTheme = useMemo(() => {
    return scene?.appState?.theme === "light" ? "light" : "dark"
  }, [scene?.appState?.theme])

  const setExcalidrawAPI = useCallback((api: any) => {
    if (excalidrawAPIRef.current !== api) {
      excalidrawAPIRef.current = api
      ;(window as any).excalidrawAPI = api
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      lockedScrollXRef.current = computeLockedScrollX()
      const api = excalidrawAPIRef.current
      if (api) {
        lockCanvas(200)
        api.updateScene({
          appState: { scrollX: lockedScrollXRef.current, zoom: { value: 1 as any } },
        })
      }
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    return () => {
      unlockCanvas()
      hasCentered.current = null
    }
  }, [workspace?.id])

  // ── Block ALL zoom and horizontal scroll at the DOM level ──
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) + 1) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false, capture: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("keydown", onKeyDown, { capture: true })
    return () => {
      el.removeEventListener("wheel", onWheel, true)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("keydown", onKeyDown, true)
    }
  }, [])

  // ── Center content after scene loads ──
  useEffect(() => {
    if (!scene || !excalidrawAPIRef.current || !workspace) return
    if (hasCentered.current === workspace.id) return

    const api = excalidrawAPIRef.current
    const t = setTimeout(() => {
      try {
        lockedScrollXRef.current = computeLockedScrollX()
        lockCanvas(500)
        api.updateScene({
          appState: {
            zoom: { value: 1 as any },
            scrollX: lockedScrollXRef.current,
            scrollY: 0,
          },
        })
        hasCentered.current = workspace.id
      } catch {
        // Excalidraw not ready
      }
    }, 300)

    return () => clearTimeout(t)
  }, [scene, workspace?.id])

  // ── Update theme when it changes (from settings toggle) ──
  useEffect(() => {
    const api = excalidrawAPIRef.current
    if (!api || !scene) return

    const bg = scene.appState?.viewBackgroundColor
    if (bg) {
      lockCanvas(300)
      api.updateScene({
        appState: {
          theme: sceneTheme,
          viewBackgroundColor: bg,
        },
      })
    }
  }, [sceneTheme, scene?.appState?.viewBackgroundColor])

  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      _files: BinaryFiles,
    ) => {
      if (isCanvasLocked()) return

      const api = excalidrawAPIRef.current
      const corrections: Record<string, unknown> = {}
      let needsCorrection = false

      if (appState.zoom?.value !== 1) {
        corrections.zoom = { value: 1 as any }
        needsCorrection = true
      }

      const targetScrollX = lockedScrollXRef.current
      const currentScrollX = appState.scrollX ?? 0
      if (Math.abs(currentScrollX - targetScrollX) > 3) {
        corrections.scrollX = targetScrollX
        needsCorrection = true
      }

      if (needsCorrection && api) {
        lockCanvas(150)
        api.updateScene({ appState: corrections })
        return
      }

      onSceneChange(elements, appState as unknown as Record<string, unknown>)
    },
    [onSceneChange],
  )

  const initialData = useMemo(() => {
    if (!scene || !scene.elements) return null
    const safeElements = scene.elements.filter(
      (el: any) =>
        el.x !== null &&
        el.x !== undefined &&
        el.y !== null &&
        el.y !== undefined,
    )
    return {
      elements: JSON.parse(JSON.stringify(safeElements)),
      files: scene.files ? JSON.parse(JSON.stringify(scene.files)) : undefined,
      appState: {
        zoom: { value: 1 as any },
        scrollX: computeLockedScrollX(),
        scrollY: 0,
        theme: sceneTheme as any,
        viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#0e0e1a",
      },
    }
  }, [scene, sceneTheme])

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

  // Gutter colors adapt to theme
  const gutterBg = sceneTheme === "light"
    ? "rgba(0, 0, 0, 0.04)"
    : "rgba(0, 0, 0, 0.15)"
  const gutterBorder = sceneTheme === "light"
    ? "1px solid rgba(0, 0, 0, 0.06)"
    : "1px solid rgba(255, 255, 255, 0.03)"

  return (
    <div className="w-full h-full relative canvas-lock" ref={wrapperRef}>
      {/* Left gutter */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none z-10"
        style={{
          left: 0,
          width: `calc(50% - ${CANVAS_CONTENT_WIDTH / 2}px)`,
          background: gutterBg,
          borderRight: gutterBorder,
        }}
      />
      {/* Right gutter */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none z-10"
        style={{
          right: 0,
          width: `calc(50% - ${CANVAS_CONTENT_WIDTH / 2}px)`,
          background: gutterBg,
          borderLeft: gutterBorder,
        }}
      />

      <Excalidraw
        key={`${workspace.id}-${sceneTheme}`}
        initialData={initialData ?? undefined}
        excalidrawAPI={setExcalidrawAPI}
        onChange={handleChange}
        theme={sceneTheme}
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