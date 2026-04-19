// === FILE: frontend/src/components/shared/EmptyState.tsx ===

interface Props {
  icon?: string;
  message: string;
  hint?: string;
}

export function EmptyState({ icon = "📭", message, hint }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <span className="text-3xl mb-2">{icon}</span>
      <p className="text-sm" style={{ color: "var(--glass-text-secondary)" }}>
        {message}
      </p>
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--glass-text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
