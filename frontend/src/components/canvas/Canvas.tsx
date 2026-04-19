// === FILE: frontend/src/components/canvas/Canvas.tsx ===

import { useCallback, useMemo } from "react";
import { useCanvas } from "@/hooks/use-canvas-new";
import { useAppStore } from "@/store";
import { EmptyCanvas } from "./EmptyCanvas";

// If using the existing Excalidraw setup, import it here
// For now, we'll create a placeholder that integrates with existing canvas logic
import ExcalidrawCanvas from "@/canvas/ExcalidrawCanvas";

export function Canvas() {
  const workspace = useAppStore((s) => s.activeWorkspace);
  const { scene, onSceneChange } = useCanvas();

  if (!workspace) {
    return <EmptyCanvas />;
  }

  if (!scene) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--glass-text-muted)" }}>
        Loading canvas…
      </div>
    );
  }

  // For now, use the existing ExcalidrawCanvas component
  // TODO: Integrate the new store-based canvas sync here
  return (
    <div className="w-full h-full">
      <ExcalidrawCanvas pageId={workspace.id} />
    </div>
  );
}
