import { useEffect, useCallback, useRef } from "react"
import { api } from "@/api/client"
import { debounce } from "@/lib/utils"
import { SYNC_DEBOUNCE_MS, SSE_RECONNECT_MS } from "@/lib/constants"
import { useAppStore, useCanvasStore } from "@/store"
import type { ExcalidrawScene, SSEEvent } from "@/api/types"

/**
 * Canvas lifecycle:
 *   1. Load scene when workspace changes
 *   2. Sync on user edits (debounced)
 *   3. Subscribe to SSE for real-time updates
 *   4. Reload when server version > local version
 */
export function useCanvas() {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const {
    version, scene, setScene, setVersion,
    setSyncing, setDirty, markSynced, reset,
  } = useCanvasStore()

  const versionRef = useRef(version)
  versionRef.current = version

  const wsIdRef = useRef<string | null>(null)

  // ── Load scene ──
  const loadScene = useCallback(async () => {
    if (!activeWorkspace) {
      reset()
      return
    }
    try {
      const data = await api.canvas.getScene(activeWorkspace.id)
      setScene(data.scene)
      setVersion(data.version)
      versionRef.current = data.version
    } catch (err) {
      console.error("Failed to load scene:", err)
    }
  }, [activeWorkspace, setScene, setVersion, reset])

  // Load on workspace change
  useEffect(() => {
    loadScene()
  }, [loadScene])

  // ── Debounced sync ──
  const debouncedSync = useCallback(
    debounce(async (updatedScene: ExcalidrawScene) => {
      if (!activeWorkspace) return
      setSyncing(true)
      try {
        const result = await api.canvas.sync(
          activeWorkspace.id,
          versionRef.current,
          updatedScene,
        )
        if (result.status === "full_reload" && result.scene) {
          setScene(result.scene)
        }
        markSynced(result.version)
        versionRef.current = result.version
      } catch (err) {
        console.error("Sync failed:", err)
        setSyncing(false)
      }
    }, SYNC_DEBOUNCE_MS),
    [activeWorkspace, setSyncing, markSynced, setScene],
  )

  /** Called from Excalidraw onChange */
  const onSceneChange = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>) => {
      setDirty(true)
      debouncedSync({
        elements: elements as ExcalidrawScene["elements"],
        appState: appState as ExcalidrawScene["appState"],
        files: {},
      })
    },
    [setDirty, debouncedSync],
  )

  // ── SSE subscription ──
  useEffect(() => {
    if (!activeWorkspace) return

    const wsId = activeWorkspace.id
    wsIdRef.current = wsId
    let unsub: () => void
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      unsub = api.canvas.subscribe(
        wsId,
        (event: SSEEvent) => {
          if (
            event.type === "canvas_updated" &&
            event.version &&
            event.version > versionRef.current
          ) {
            loadScene()
          }
        },
        () => {
          // Reconnect on error
          if (wsIdRef.current === wsId) {
            reconnectTimer = setTimeout(connect, SSE_RECONNECT_MS)
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
  }, [activeWorkspace, loadScene])

  return { scene, version, loadScene, onSceneChange }
}