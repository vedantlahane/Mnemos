// === FILE: frontend/src/components/layout/Shell.tsx ===

/**
 * Main app layout using the new store architecture.
 * Left: Excalidraw canvas (full bleed)
 * Right: Collapsible sidebar with chat + panels
 */

import { useRef } from "react";
import { Canvas } from "@/components/canvas/Canvas";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAppStore } from "@/store";
import { useKeyboard } from "@/hooks/use-keyboard-new";

export function Shell() {
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const setActivePanel = useAppStore((s) => s.setActivePanel);

  useKeyboard(chatInputRef, () => setActivePanel("none"));

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-void)]">
      {/* Canvas — takes all remaining space */}
      <div className="flex-1 relative">
        <Canvas />
      </div>

      {/* Sidebar — fixed width with glass aesthetic */}
      <Sidebar chatInputRef={chatInputRef} />
    </div>
  );
}
