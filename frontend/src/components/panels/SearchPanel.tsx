// === FILE: frontend/src/components/panels/SearchPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { EmptyState } from "@/components/shared/EmptyState";

export function SearchPanel() {
  const { search } = usePanelData();

  if (!search?.results.length) {
    return (
      <EmptyState
        icon="🔍"
        message="No search results"
        hint="Try a different query"
      />
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      <p className="text-xs px-2 mb-2" style={{ color: "var(--glass-text-muted)" }}>
        Results ({search.results.length})
      </p>
      {search.results.map((result) => (
        <div
          key={result.id}
          className="px-3 py-2.5 rounded-lg transition-all"
          style={{
            background: "var(--glass-bg-thick)",
            border: "1px solid var(--glass-border)",
            color: "var(--glass-text)",
          }}
        >
          <p className="text-sm font-medium truncate">{result.title}</p>
          <p className="text-xs truncate mt-1" style={{ color: "var(--glass-text-muted)" }}>
            {result.excerpt || result.content_type}
          </p>
        </div>
      ))}
    </div>
  );
}
