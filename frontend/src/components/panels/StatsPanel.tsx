// === FILE: frontend/src/components/panels/StatsPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { EmptyState } from "@/components/shared/EmptyState";

export function StatsPanel() {
  const { stats } = usePanelData();

  if (!stats) {
    return (
      <EmptyState
        icon="📊"
        message="No statistics"
        hint="Say 'show stats' for dashboard"
      />
    );
  }

  return (
    <div className="p-3">
      <p className="text-xs px-2" style={{ color: "var(--glass-text-muted)" }}>
        Statistics
      </p>
      <div className="mt-3 space-y-2">
        {/* Stats would be rendered here */}
      </div>
    </div>
  );
}
