// === FILE: frontend/src/hooks/use-keyboard-new.ts ===

import { useEffect } from "react";

/**
 * Global keyboard shortcuts.
 * Cmd/Ctrl+K → focus chat input
 * Escape → close panel
 */
export function useKeyboard(
  chatInputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>,
  onEscape?: () => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K → focus chat
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        chatInputRef.current?.focus();
      }

      // Escape → close panel
      if (e.key === "Escape") {
        onEscape?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chatInputRef, onEscape]);
}
