// === FILE: frontend/src/components/layout/TopBar.tsx ===

import { useAppStore } from "@/store";
import { useCanvasStore } from "@/store";

export function TopBar() {
  const workspace = useAppStore((s) => s.activeWorkspace);
  const version = useCanvasStore((s) => s.version);
  const isDirty = useCanvasStore((s) => s.isDirty);
  const isSyncing = useCanvasStore((s) => s.isSyncing);

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b flex-shrink-0"
      style={{
        borderColor: "var(--glass-border)",
      }}
    >
      <div className="flex items-center gap-2">
        {workspace ? (
          <>
            <span className="text-lg">{workspace.icon}</span>
            <span className="font-medium text-sm" style={{ color: "var(--glass-text)" }}>
              {workspace.display_name}
            </span>
          </>
        ) : (
          <span className="text-sm" style={{ color: "var(--glass-text-muted)" }}>
            No board open
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--glass-text-muted)" }}>
        {isSyncing && <span className="animate-pulse">syncing…</span>}
        {isDirty && !isSyncing && <span>unsaved</span>}
        {!isDirty && !isSyncing && workspace && (
          <span>v{version}</span>
        )}
      </div>
    </div>
  );
}
