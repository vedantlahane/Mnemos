// === FILE: frontend/src/components/chat/TypingIndicator.tsx ===

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5"
        style={{
          background: "var(--glass-bg-thick)",
          border: "1px solid var(--glass-border)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              background: "var(--glass-text-dim)",
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
