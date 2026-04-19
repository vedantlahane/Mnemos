export function EmptyCanvas() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-void)]">
      <div className="text-center max-w-xs">
        <p className="text-5xl mb-4">🧠</p>
        <h2 className="text-lg font-semibold text-white mb-2">Mnemos</h2>
        <p className="text-sm text-[var(--glass-text-dim)] leading-relaxed">
          Open a board to start. Try{" "}
          <code className="px-1.5 py-0.5 rounded text-xs bg-[var(--glass-bg-thick)] text-[var(--accent)] border border-[var(--glass-border)]">
            show boards
          </code>{" "}
          in the chat.
        </p>
      </div>
    </div>
  )
}