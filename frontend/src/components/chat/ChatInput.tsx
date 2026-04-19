// === FILE: frontend/src/components/chat/ChatInput.tsx ===

import { forwardRef, useState, useCallback } from "react";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(
  ({ onSend, disabled }, ref) => {
    const [value, setValue] = useState("");

    const handleSend = useCallback(() => {
      const trimmed = value.trim();
      if (!trimmed || disabled) return;
      onSend(trimmed);
      setValue("");
    }, [value, disabled, onSend]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend],
    );

    return (
      <div className="p-3 border-t flex-shrink-0"
        style={{
          borderColor: "var(--glass-border)",
          background: "var(--glass-bg)",
        }}
      >
        <div className="flex items-end gap-2 rounded-xl px-4 py-2"
          style={{
            background: "var(--glass-bg-thick)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (⌘K to focus)"
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none outline-none max-h-32 leading-relaxed bg-transparent"
            style={{
              color: "var(--glass-text)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="p-1.5 rounded-lg transition-all flex-shrink-0"
            style={{
              color: "var(--accent)",
              opacity: disabled || !value.trim() ? 0.3 : 1,
              cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!disabled && value.trim()) {
                (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";
