// === FILE: frontend/src/components/panels/SettingsPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { EmptyState } from "@/components/shared/EmptyState";

export function SettingsPanel() {
  const { settings } = usePanelData();

  if (!settings) {
    return (
      <EmptyState
        icon="⚙️"
        message="Settings unavailable"
      />
    );
  }

  return (
    <div className="p-3">
      <p className="text-xs px-2" style={{ color: "var(--glass-text-muted)" }}>
        Settings
      </p>
      <div className="mt-3 space-y-2">
        {/* Settings would be rendered here */}
      </div>
    </div>
  );
}
