// === FILE: frontend/src/components/panels/BoardsPanel.tsx ===

import { usePanelData } from "@/hooks/use-panel-new";
import { useChat } from "@/hooks/use-chat-new";
import { formatTime } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";

export function BoardsPanel() {
  const { boards } = usePanelData();
  const { send } = useChat();

  if (!boards?.boards.length) {
    return (
      <EmptyState
        icon="📋"
        message="No boards yet"
        hint='Say "create board My Board"'
      />
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      <p className="text-xs px-2 mb-2" style={{ color: "var(--glass-text-muted)" }}>
        Boards
      </p>
      {boards.boards.map((b) => (
        <button
          key={b.id}
          onClick={() => send(`open ${b.display_name}`)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group"
          style={{
            color: "var(--glass-text)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--glass-bg-thick)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <span className="text-lg">{b.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {b.display_name}
            </p>
            {b.description && (
              <p className="text-xs truncate" style={{ color: "var(--glass-text-muted)" }}>
                {b.description}
              </p>
            )}
          </div>
          <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: "var(--glass-text-muted)" }}
          >
            {formatTime(b.updated_at)}
          </span>
        </button>
      ))}
    </div>
  );
}
