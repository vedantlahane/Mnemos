// === FILE: frontend/src/components/layout/Sidebar.tsx ===

import type { RefObject } from "react";
import { TopBar } from "./TopBar";
import { PanelContainer } from "@/components/panels/PanelContainer";
import { ChatBox } from "@/components/chat/ChatBox";
import { useAppStore } from "@/store";

interface Props {
  chatInputRef: RefObject<HTMLTextAreaElement>;
}

export function Sidebar({ chatInputRef }: Props) {
  const activePanel = useAppStore((s) => s.activePanel);

  return (
    <div className="w-[380px] h-full flex flex-col border-l"
      style={{
        borderColor: "var(--glass-border)",
        background: "var(--glass-bg-medium)",
        backdropFilter: "blur(16px)",
      }}
    >
      <TopBar />

      {/* Panel area — slides in/out */}
      {activePanel !== "none" && (
        <div className="flex-shrink-0 max-h-[50%] overflow-y-auto border-b animate-slide-in"
          style={{
            borderColor: "var(--glass-border)",
          }}
        >
          <PanelContainer />
        </div>
      )}

      {/* Chat — always visible at bottom */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatBox inputRef={chatInputRef} />
      </div>
    </div>
  );
}
