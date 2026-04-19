// === FILE: frontend/src/components/shared/Button.tsx ===

import React from "react";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const variantStyles = {
  primary: {
    background: "var(--accent)",
    color: "white",
    border: "none",
  },
  secondary: {
    background: "var(--glass-bg-thick)",
    color: "var(--glass-text)",
    border: "1px solid var(--glass-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--glass-text-dim)",
    border: "none",
  },
};

const sizeStyles = {
  sm: "px-2 py-1 text-xs rounded-md",
  md: "px-3 py-2 text-sm rounded-lg",
  lg: "px-4 py-2.5 text-base rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...props
}: Props) {
  const baseClass = `font-medium transition-all cursor-pointer ${sizeStyles[size]} ${className}`;

  return (
    <button
      className={baseClass}
      style={variantStyles[variant]}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (variant === "primary") {
          el.style.opacity = "0.9";
        } else if (variant === "secondary") {
          el.style.background = "var(--glass-bg-medium)";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (variant === "primary") {
          el.style.opacity = "1";
        } else if (variant === "secondary") {
          el.style.background = "var(--glass-bg-thick)";
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}
