import { useAppStore, useCanvasStore } from "@/store"

export function TopBar() {
  const workspace = useAppStore((s) => s.activeWorkspace)
  const version = useCanvasStore((s) => s.version)
  const isDirty = useCanvasStore((s) => s.isDirty)
  const isSyncing = useCanvasStore((s) => s.isSyncing)

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--glass-border)] flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {workspace ? (
          <>
            <span className="text-lg flex-shrink-0">{workspace.icon}</span>
            <span className="text-sm font-medium text-white truncate">
              {workspace.display_name}
            </span>
          </>
        ) : (
          <span className="text-sm text-[var(--glass-text-muted)]">No board open</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--glass-text-muted)] flex-shrink-0">
        {isSyncing && <span className="animate-pulse">syncing…</span>}
        {isDirty && !isSyncing && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)]" title="Unsaved changes" />
        )}
        {!isDirty && !isSyncing && workspace && <span>v{version}</span>}
      </div>
    </div>
  )
}