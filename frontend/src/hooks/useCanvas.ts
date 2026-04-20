// === FILE: frontend/src/hooks/useCanvas.ts ===

import { useMemo, useEffect, useCallback, useRef } from "react"
import { api } from "@/api/client"
import { debounce } from "@/lib/utils"
import { SYNC_DEBOUNCE_MS, SSE_RECONNECT_MS } from "@/lib/constants"
import { useAppStore, useCanvasStore } from "@/store"
import { lockCanvas, isCanvasLocked } from "@/lib/canvasLock"
import type { ExcalidrawScene, SSEEvent } from "@/api/types"

export function useCanvas() {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)

  const version = useCanvasStore((s) => s.version)
  const scene = useCanvasStore((s) => s.scene)
  const reloadRequested = useCanvasStore((s) => s.reloadRequested)
  const setScene = useCanvasStore((s) => s.setScene)
  const setVersion = useCanvasStore((s) => s.setVersion)
  const setSyncing = useCanvasStore((s) => s.setSyncing)
  const setDirty = useCanvasStore((s) => s.setDirty)
  const markSynced = useCanvasStore((s) => s.markSynced)
  const reset = useCanvasStore((s) => s.reset)

  const versionRef = useRef(version)
  versionRef.current = version

  const wsIdRef = useRef<string | null>(null)
  const loadingRef = useRef(false)
  const lastSyncTimestamp = useRef(0)

  // ── Error backoff state ──
  const syncErrorCount = useRef(0)
  const syncPaused = useRef(false)

  // Reset error state when workspace changes
  useEffect(() => {
    syncErrorCount.current = 0
    syncPaused.current = false
  }, [activeWorkspace?.id])

  // ── Load scene (initial + reload) ──
  const loadScene = useCallback(
    async (updateExcalidraw = false) => {
      if (!activeWorkspace || loadingRef.current) return
      loadingRef.current = true

      try {
        const data = await api.canvas.getScene(activeWorkspace.id)

        setScene(data.scene)
        setVersion(data.version)
        versionRef.current = data.version

        // Clear error state on success
        syncErrorCount.current = 0
        syncPaused.current = false

        if (updateExcalidraw) {
          const apiObj = (window as any).excalidrawAPI
          if (apiObj && data.scene?.elements) {
            const safeElements = data.scene.elements.filter(
              (el: any) =>
                el.x !== null &&
                el.x !== undefined &&
                el.y !== null &&
                el.y !== undefined,
            )
            lockCanvas(800)
            apiObj.updateScene({
              elements: JSON.parse(JSON.stringify(safeElements)),
            })
          }
        }
      } catch (err: any) {
        console.error("Failed to load scene:", err)
        if (err?.status === 404) {
          useAppStore.getState().setActiveWorkspace(null)
        }
      } finally {
        loadingRef.current = false
      }
    },
    [activeWorkspace, setScene, setVersion],
  )

  // ── Initial load on workspace change ──
  useEffect(() => {
    if (!activeWorkspace) {
      reset()
      return
    }
    loadScene(false)
  }, [activeWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload when chat triggers it ──
  useEffect(() => {
    if (reloadRequested > 0 && activeWorkspace) {
      loadScene(true)
    }
  }, [reloadRequested]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced sync with error handling ──
  const pendingSceneRef = useRef<ExcalidrawScene | null>(null)

  const debouncedSync = useMemo(
    () =>
      debounce(async () => {
        const sceneToSync = pendingSceneRef.current
        if (!activeWorkspace || !sceneToSync || isCanvasLocked()) return

        // Stop syncing if too many errors (server probably down)
        if (syncPaused.current) return

        setSyncing(true)
        lastSyncTimestamp.current = Date.now()

        try {
          const result = await api.canvas.sync(
            activeWorkspace.id,
            versionRef.current,
            sceneToSync,
          )

          if (result.status === "full_reload" && result.scene) {
            lockCanvas(800)
            setScene(result.scene)
            const apiObj = (window as any).excalidrawAPI
            if (apiObj && result.scene.elements) {
              const safeElements = result.scene.elements.filter(
                (el: any) =>
                  el.x !== null &&
                  el.x !== undefined &&
                  el.y !== null &&
                  el.y !== undefined,
              )
              apiObj.updateScene({
                elements: JSON.parse(JSON.stringify(safeElements)),
              })
            }
          }

          markSynced(result.version)
          versionRef.current = result.version
          lastSyncTimestamp.current = Date.now()

          // Reset error count on success
          syncErrorCount.current = 0
        } catch (err: any) {
          syncErrorCount.current += 1

          // 404 = workspace gone → stop everything
          if (err?.status === 404) {
            syncPaused.current = true
            useAppStore.getState().setActiveWorkspace(null)
            setSyncing(false)
            return
          }

          // After 3 consecutive failures, pause syncing for 10s
          if (syncErrorCount.current >= 3) {
            console.warn(
              `Sync failed ${syncErrorCount.current} times, pausing for 10s`,
            )
            syncPaused.current = true
            setTimeout(() => {
              syncPaused.current = false
              syncErrorCount.current = 0
            }, 10_000)
          }

          setSyncing(false)
        }
      }, SYNC_DEBOUNCE_MS),
    [activeWorkspace?.id, setSyncing, markSynced, setScene], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /** Called from Excalidraw onChange — MUST be lightweight */
  const onSceneChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
    ) => {
      if (isCanvasLocked()) return
      if (syncPaused.current) return

      pendingSceneRef.current = {
        elements: elements as ExcalidrawScene["elements"],
        appState: appState as ExcalidrawScene["appState"],
        files: {},
      }
      setDirty(true)
      debouncedSync()
    },
    [setDirty, debouncedSync],
  )

  // ── SSE subscription ──
  useEffect(() => {
    if (!activeWorkspace) return

    const wsId = activeWorkspace.id
    wsIdRef.current = wsId
    let unsub: (() => void) | undefined
    let reconnectTimer: ReturnType<typeof setTimeout>
    let reconnectAttempts = 0

    const connect = () => {
      unsub = api.canvas.subscribe(
        wsId,
        (event: SSEEvent) => {
          // Reset reconnect counter on successful message
          reconnectAttempts = 0

          if (
            (event.type === "canvas_updated" || event.type === "stream_end") &&
            event.version &&
            event.version > versionRef.current
          ) {
            const msSinceSync = Date.now() - lastSyncTimestamp.current
            if (msSinceSync < 3000) return
            loadScene(true)
          }
        },
        () => {
          // Exponential backoff on reconnect (max 30s)
          if (wsIdRef.current === wsId) {
            reconnectAttempts++
            const delay = Math.min(
              SSE_RECONNECT_MS * Math.pow(1.5, reconnectAttempts - 1),
              30_000,
            )
            reconnectTimer = setTimeout(connect, delay)
          }
        },
      )
    }

    connect()

    return () => {
      wsIdRef.current = null
      unsub?.()
      clearTimeout(reconnectTimer)
    }
  }, [activeWorkspace?.id, loadScene])

  return { scene, version, loadScene, onSceneChange }
}