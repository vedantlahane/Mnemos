// === FILE: frontend/src/components/shared/Card.tsx ===

import React from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function Card({ children, className = "", onClick, interactive = false }: Props) {
  const cursor = interactive || onClick ? "cursor-pointer" : "";

  return (
    <div
      className={`px-3 py-2.5 rounded-lg transition-all ${cursor} ${className}`}
      style={{
        background: "var(--glass-bg-thick)",
        border: "1px solid var(--glass-border)",
        color: "var(--glass-text)",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (interactive || onClick) {
          (e.currentTarget as HTMLElement).style.background = "var(--glass-bg-medium)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (interactive || onClick) {
          (e.currentTarget as HTMLElement).style.background = "var(--glass-bg-thick)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
        }
      }}
    >
      {children}
    </div>
  );
}
