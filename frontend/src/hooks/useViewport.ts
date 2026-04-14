/**
 * Tracks the Excalidraw viewport and provides it for backend calls.
 */

import { useCallback, useRef } from "react";
import type { Viewport } from "../lib/canvasOps"

export function useViewport(apiRef: React.MutableRefObject<any>) {
  const lastViewport = useRef<Viewport>({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    zoom: 1,
  });

  const getViewport = useCallback((): Viewport => {
    const api = apiRef.current;
    if (!api) return lastViewport.current;

    const appState = api.getAppState();
    const viewport: Viewport = {
      x: appState.scrollX || 0,
      y: appState.scrollY || 0,
      width: appState.width || window.innerWidth,
      height: appState.height || window.innerHeight,
      zoom: (appState.zoom as any)?.value ?? appState.zoom ?? 1,
    };

    lastViewport.current = viewport;
    return viewport;
  }, [apiRef]);

  const onScrollChange = useCallback(
    (scrollX: number, scrollY: number) => {
      lastViewport.current = {
        ...lastViewport.current,
        x: scrollX,
        y: scrollY,
      };
    },
    []
  );

  return { getViewport, onScrollChange, lastViewport };
}
