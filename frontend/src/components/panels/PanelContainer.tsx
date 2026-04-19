// === FILE: frontend/src/components/panels/PanelContainer.tsx ===

import { useAppStore } from "@/store";
import { BoardsPanel } from "./BoardsPanel";
import { ItemsPanel } from "./ItemsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { GraphPanel } from "./GraphPanel";
import { TagsPanel } from "./TagsPanel";
import { StatsPanel } from "./StatsPanel";
import { SearchPanel } from "./SearchPanel";

export function PanelContainer() {
  const panel = useAppStore((s) => s.activePanel);
  const setPanel = useAppStore((s) => s.setActivePanel);

  const panels: Record<string, React.ComponentType> = {
    boards: BoardsPanel,
    items: ItemsPanel,
    settings: SettingsPanel,
    graph: GraphPanel,
    tags: TagsPanel,
    stats: StatsPanel,
    search: SearchPanel,
  };

  const Panel = panels[panel];
  if (!Panel) return null;

  return (
    <div className="relative">
      {/* Close button */}
      <button
        onClick={() => setPanel("none")}
        className="absolute top-2 right-2 z-10 p-1 rounded-md transition-all"
        style={{
          color: "var(--glass-text-muted)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--glass-text)";
          (e.currentTarget as HTMLElement).style.background = "var(--glass-bg-thick)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--glass-text-muted)";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <Panel />
    </div>
  );
}
