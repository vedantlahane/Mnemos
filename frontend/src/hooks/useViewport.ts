/**
 * Tracks the Excalidraw viewport and provides it for backend calls.
 */

import { useCallback, useRef } from "react"
import { create } from "zustand"
import type { MutableRefObject } from "react"
import type { Viewport } from "../lib/canvasOps"

type ViewportAwareAPI = {
  getAppState: () => {
    scrollX?: number
    scrollY?: number
    width?: number
    height?: number
    zoom?: number | { value?: number }
  }
}

const DEFAULT_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  zoom: 1,
}

interface ViewportStoreState {
  viewport: Viewport
  setViewport: (viewport: Viewport) => void
}

export const useViewportStore = create<ViewportStoreState>((set) => ({
  viewport: DEFAULT_VIEWPORT,
  setViewport: (viewport) => set({ viewport }),
}))

export function useViewport(apiRef: MutableRefObject<ViewportAwareAPI | null>) {
  const setViewport = useViewportStore((s) => s.setViewport)

  const lastViewport = useRef<Viewport>({
    ...useViewportStore.getState().viewport,
  })

  const updateViewport = useCallback((viewport: Viewport) => {
    lastViewport.current = viewport
    setViewport(viewport)
  }, [setViewport])

  const getViewport = useCallback((): Viewport => {
    const api = apiRef.current
    if (!api) return lastViewport.current

    const appState = api.getAppState()
    const viewport: Viewport = {
      x: appState.scrollX || 0,
      y: appState.scrollY || 0,
      width: appState.width || window.innerWidth,
      height: appState.height || window.innerHeight,
      zoom: (appState.zoom as any)?.value ?? appState.zoom ?? 1,
    }

    updateViewport(viewport)
    return viewport
  }, [apiRef, updateViewport])

  const onScrollChange = useCallback(
    (scrollX: number, scrollY: number) => {
      updateViewport({
        ...lastViewport.current,
        x: scrollX,
        y: scrollY,
      })
    },
    [updateViewport]
  )

  return { getViewport, onScrollChange, lastViewport }
}
