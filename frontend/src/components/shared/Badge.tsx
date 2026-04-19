// === FILE: frontend/src/components/shared/Badge.tsx ===

interface Props {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "error";
  size?: "sm" | "md";
}

const variantStyles = {
  default: {
    background: "var(--glass-bg-thick)",
    color: "var(--glass-text-dim)",
    border: "1px solid var(--glass-border)",
  },
  accent: {
    background: "var(--accent-subtle)",
    color: "var(--accent)",
    border: "1px solid var(--accent-glow)",
  },
  success: {
    background: "var(--green-subtle)",
    color: "var(--green)",
    border: "1px solid var(--green)",
  },
  warning: {
    background: "var(--amber-subtle)",
    color: "var(--amber)",
    border: "1px solid var(--amber)",
  },
  error: {
    background: "var(--red-subtle)",
    color: "var(--red)",
    border: "1px solid var(--red)",
  },
};

export function Badge({ children, variant = "default", size = "sm" }: Props) {
  const style = variantStyles[variant];
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const fontSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${padding} ${fontSize}`}
      style={style}
    >
      {children}
    </span>
  );
}
