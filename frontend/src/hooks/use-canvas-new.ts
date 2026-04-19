// === FILE: frontend/src/hooks/use-canvas-new.ts ===

import { useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/client";
import { debounce } from "@/lib/utils";
import { useAppStore, useCanvasStore } from "@/store";
import type { ExcalidrawScene, SSEEvent } from "@/lib/types";

const SYNC_DEBOUNCE_MS = 1500;
const SSE_RECONNECT_MS = 3000;

export function useCanvas() {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const {
    version,
    scene,
    setScene,
    setVersion,
    setSyncing,
    setDirty,
    markSynced,
  } = useCanvasStore();

  const wsIdRef = useRef<string | null>(null);
  const versionRef = useRef(version);
  versionRef.current = version;

  // ── Load scene when workspace changes or version bumps ──
  const loadScene = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const data = await api.canvas.getScene(activeWorkspace.id);
      setScene(data.scene);
      setVersion(data.version);
    } catch (err) {
      console.error("Failed to load scene:", err);
    }
  }, [activeWorkspace, setScene, setVersion]);

  useEffect(() => {
    loadScene();
  }, [loadScene]);

  // ── Debounced sync on user changes ──
  const syncToServer = useCallback(
    debounce(async (updatedScene: ExcalidrawScene) => {
      if (!activeWorkspace) return;
      setSyncing(true);
      try {
        const result = await api.canvas.sync(
          activeWorkspace.id,
          versionRef.current,
          updatedScene,
        );

        if (result.status === "full_reload" && result.scene) {
          setScene(result.scene);
        }
        markSynced(result.version);
      } catch (err) {
        console.error("Sync failed:", err);
        setSyncing(false);
      }
    }, SYNC_DEBOUNCE_MS),
    [activeWorkspace, setSyncing, markSynced, setScene],
  );

  /** Called by Excalidraw onChange */
  const onSceneChange = useCallback(
    (elements: readonly any[], appState: any) => {
      setDirty(true);
      const updatedScene: ExcalidrawScene = {
        elements: elements as any[],
        appState,
        files: {},
      };
      syncToServer(updatedScene);
    },
    [setDirty, syncToServer],
  );

  // ── SSE subscription for real-time updates ──
  useEffect(() => {
    if (!activeWorkspace) return;

    const wsId = activeWorkspace.id;
    wsIdRef.current = wsId;

    const handleEvent = (event: SSEEvent) => {
      if (event.type === "canvas_updated" && event.version) {
        // Only reload if server version is ahead
        if (event.version > versionRef.current) {
          loadScene();
        }
      }
    };

    let unsub = api.canvas.subscribe(wsId, handleEvent, () => {
      // Reconnect on error
      setTimeout(() => {
        if (wsIdRef.current === wsId) {
          unsub = api.canvas.subscribe(wsId, handleEvent);
        }
      }, SSE_RECONNECT_MS);
    });

    return () => unsub();
  }, [activeWorkspace, loadScene]);

  return {
    scene,
    version,
    loadScene,
    onSceneChange,
  };
}
