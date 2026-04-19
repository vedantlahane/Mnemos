// === FILE: frontend/src/components/panels/TagsPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { EmptyState } from "@/components/shared/EmptyState";

export function TagsPanel() {
  const { tags } = usePanelData();

  if (!tags?.tags.length) {
    return (
      <EmptyState
        icon="🏷️"
        message="No tags yet"
        hint="Add tags when capturing items"
      />
    );
  }

  return (
    <div className="p-3">
      <p className="text-xs px-2 mb-2" style={{ color: "var(--glass-text-muted)" }}>
        Tags ({tags.tags.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-1 rounded-full"
            style={{
              background: "var(--accent-subtle)",
              color: "var(--accent)",
              border: "1px solid var(--accent-glow)",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
