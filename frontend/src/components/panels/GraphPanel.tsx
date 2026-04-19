// === FILE: frontend/src/components/panels/GraphPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { EmptyState } from "@/components/shared/EmptyState";

export function GraphPanel() {
  const { graph } = usePanelData();

  if (!graph) {
    return (
      <EmptyState
        icon="🌐"
        message="No graph data"
        hint="Say 'show graph' to generate"
      />
    );
  }

  return (
    <div className="p-3">
      <p className="text-xs px-2" style={{ color: "var(--glass-text-muted)" }}>
        Knowledge Graph
      </p>
      {/* Graph visualization would go here */}
    </div>
  );
}
