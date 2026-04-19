import { useCallback, useMemo } from "react"
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { useCanvas } from "@/hooks/useCanvas"
import { useAppStore } from "@/store"
import { EmptyCanvas } from "./EmptyCanvas"

export function Canvas() {
  const workspace = useAppStore((s) => s.activeWorkspace)
  const { scene, version, onSceneChange } = useCanvas()

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, _files: BinaryFiles) => {
      onSceneChange(elements, appState as unknown as Record<string, unknown>)
    },
    [onSceneChange],
  )

  const theme = useMemo(
    () => scene?.appState?.theme ?? "dark",
    [scene],
  )

  const background = useMemo(
    () => scene?.appState?.viewBackgroundColor ?? "#0e0e1a",
    [scene],
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

  return (
    <div className="w-full h-full">
      <Excalidraw
        key={version}
        initialData={{
          elements: scene.elements as any,
          appState: {
            ...scene.appState,
            viewBackgroundColor: background,
            theme,
          },
          files: scene.files as any ?? undefined,
        }}
        onChange={handleChange}
        theme={theme}
        langCode="en"
        gridModeEnabled={false}
        viewModeEnabled={false}
        zenModeEnabled={false}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  )
}