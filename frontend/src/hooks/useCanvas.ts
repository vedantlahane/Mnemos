// === FILE: frontend/src/hooks/useCanvas.ts ===

import { useMemo, useEffect, useCallback, useRef } from "react"
import { api } from "@/api/client"
import { debounce } from "@/lib/utils"
import { SYNC_DEBOUNCE_MS, SSE_RECONNECT_MS } from "@/lib/constants"
import { useAppStore, useCanvasStore } from "@/store"
import { lockCanvas, isCanvasLocked } from "@/lib/canvasLock"
import { sanitizeScene } from "@/lib/sanitizeScene"
import type { ExcalidrawScene, SSEEvent } from "@/api/types"

export function useCanvas() {
  const workspace = useAppStore((s) => s.activeWorkspace)

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
  const lastSyncTs = useRef(0)
  const errorCount = useRef(0)
  const pausedUntil = useRef(0)

  useEffect(() => {
    errorCount.current = 0
    pausedUntil.current = 0
  }, [workspace?.id])

  // ── Push scene to Excalidraw (only when server sends a rebuild) ──
  const pushToExcalidraw = useCallback((sceneData: ExcalidrawScene) => {
    const safe = sanitizeScene(sceneData)
    setScene(safe)

    const excalidrawApi = (window as any).excalidrawAPI
    if (excalidrawApi && safe.elements) {
      const elements = safe.elements.filter(
        (el: any) => el.x != null && el.y != null,
      )
      lockCanvas(1200) // Longer lock for structural rebuilds
      excalidrawApi.updateScene({
        elements: JSON.parse(JSON.stringify(elements)),
      })
    }
    return safe
  }, [setScene])

  // ── Load scene from server (initial load + structural reloads) ──
  const loadScene = useCallback(
    async (pushToCanvas = false) => {
      if (!workspace || loadingRef.current) return
      loadingRef.current = true

      try {
        const data = await api.canvas.getScene(workspace.id)
        const safe = sanitizeScene(data.scene)

        setScene(safe)
        setVersion(data.version)
        versionRef.current = data.version
        errorCount.current = 0
        pausedUntil.current = 0

        if (pushToCanvas) {
          pushToExcalidraw(safe)
        }
      } catch (err: any) {
        console.error("Scene load failed:", err)
        if (err?.status === 404) {
          useAppStore.getState().setActiveWorkspace(null)
        }
      } finally {
        loadingRef.current = false
      }
    },
    [workspace, setScene, setVersion, pushToExcalidraw],
  )

  // ── Initial load ──
  useEffect(() => {
    if (!workspace) { reset(); return }
    loadScene(false)
  }, [workspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload when chat requests it (structural change) ──
  useEffect(() => {
    if (reloadRequested > 0 && workspace) {
      loadScene(true)
    }
  }, [reloadRequested]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced sync — ONLY saves positions, doesn't overwrite canvas ──
  const pendingRef = useRef<ExcalidrawScene | null>(null)

  const debouncedSync = useMemo(
    () =>
      debounce(async () => {
        const toSync = pendingRef.current
        if (!workspace || !toSync) return
        if (isCanvasLocked()) return
        if (Date.now() < pausedUntil.current) return

        // Don't sync if all elements were deleted (Clear Canvas protection)
        const liveElements = toSync.elements?.filter(
          (el) => !el.isDeleted
        ) ?? []
        if (liveElements.length === 0 && versionRef.current > 0) {
          // User cleared everything — reload from server instead of syncing empty
          loadScene(true)
          return
        }

        setSyncing(true)
        lastSyncTs.current = Date.now()

        try {
          const result = await api.canvas.sync(
            workspace.id,
            versionRef.current,
            toSync,
          )

          // KEY CHANGE: Only update Excalidraw if server sent a scene back
          // (which only happens on full_reload, NOT on position-only syncs)
          if (result.scene) {
            pushToExcalidraw(result.scene)
          }

          // Always update version
          markSynced(result.version)
          versionRef.current = result.version
          errorCount.current = 0
        } catch (err: any) {
          errorCount.current++
          setSyncing(false)

          if (err?.status === 404) {
            pausedUntil.current = Infinity
            useAppStore.getState().setActiveWorkspace(null)
            return
          }

          if (errorCount.current >= 3) {
            console.warn("Sync paused after 3 failures")
            pausedUntil.current = Date.now() + 15_000
            errorCount.current = 0
          }
        }
      }, SYNC_DEBOUNCE_MS),
    [workspace?.id, setSyncing, markSynced, pushToExcalidraw, loadScene], // eslint-disable-line
  )

  // ── Cleanup on workspace change — cancel pending syncs ──
  useEffect(() => {
    return () => {
      debouncedSync.cancel?.()
      pendingRef.current = null
    }
  }, [workspace?.id, debouncedSync]) // eslint-disable-line

  // ── onChange — lightweight, just queues for sync ──
  const onSceneChange = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>) => {
      if (isCanvasLocked()) return
      if (Date.now() < pausedUntil.current) return

      pendingRef.current = {
        elements: elements as ExcalidrawScene["elements"],
        appState: appState as ExcalidrawScene["appState"],
        files: {},
      }
      setDirty(true)
      debouncedSync()
    },
    [setDirty, debouncedSync],
  )

  // ── SSE — only reload on structural changes from OTHER clients ──
  useEffect(() => {
    if (!workspace) return

    const wsId = workspace.id
    wsIdRef.current = wsId
    let unsub: (() => void) | undefined
    let reconnectTimer: ReturnType<typeof setTimeout>
    let attempts = 0

    const connect = () => {
      unsub = api.canvas.subscribe(
        wsId,
        (event: SSEEvent) => {
          attempts = 0

          if (event.type === "canvas_updated" && event.version) {
            // Skip if WE caused this (our sync just completed)
            if (Date.now() - lastSyncTs.current < 4000) return

            // Skip position-only changes from other users
            if (event.op === "user_move" || event.op === "user_sync") return

            // Structural change (card_placed, diagram_added, theme_changed, etc.)
            if (event.version > versionRef.current) {
              loadScene(true)
            }
          }

          if (event.type === "stream_end" && event.version) {
            if (event.version > versionRef.current) {
              loadScene(true)
            }
          }
        },
        () => {
          if (wsIdRef.current !== wsId) return
          attempts++
          const delay = Math.min(SSE_RECONNECT_MS * 2 ** (attempts - 1), 30_000)
          reconnectTimer = setTimeout(connect, delay)
        },
      )
    }

    connect()
    return () => {
      wsIdRef.current = null
      unsub?.()
      clearTimeout(reconnectTimer)
    }
  }, [workspace?.id, loadScene])

  return { scene, version, loadScene, onSceneChange }
}