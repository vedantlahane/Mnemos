// === FILE: frontend/src/components/canvas/EmptyCanvas.tsx ===

export function EmptyCanvas() {
  return (
    <div className="flex items-center justify-center h-full"
      style={{
        background: "var(--color-void)",
      }}
    >
      <div className="text-center max-w-md">
        <p className="text-6xl mb-4">🧠</p>
        <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--glass-text)" }}>
          Mnemos
        </h2>
        <p className="text-sm" style={{ color: "var(--glass-text-secondary)" }}>
          Open a board to start. Try typing{" "}
          <code className="px-1.5 py-0.5 rounded text-xs"
            style={{
              background: "var(--glass-bg-thick)",
              color: "var(--accent)",
              border: "1px solid var(--glass-border)",
            }}
          >
            show boards
          </code>{" "}
          in the chat.
        </p>
      </div>
    </div>
  );
}
