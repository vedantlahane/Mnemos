// === FILE: frontend/src/components/panels/ItemsPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { EmptyState } from "@/components/shared/EmptyState";

export function ItemsPanel() {
  const { items } = usePanelData();

  if (!items?.items.length) {
    return (
      <EmptyState
        icon="📌"
        message="No items yet"
        hint="Capture something to get started"
      />
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      <p className="text-xs px-2 mb-2" style={{ color: "var(--glass-text-muted)" }}>
        Items ({items.items.length})
      </p>
      {items.items.map((item) => (
        <div
          key={item.id}
          className="px-3 py-2.5 rounded-lg transition-all"
          style={{
            background: "var(--glass-bg-thick)",
            border: "1px solid var(--glass-border)",
            color: "var(--glass-text)",
          }}
        >
          <p className="text-sm font-medium truncate">{item.title || "Untitled"}</p>
          {item.summary && (
            <p className="text-xs truncate mt-1" style={{ color: "var(--glass-text-muted)" }}>
              {item.summary}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
