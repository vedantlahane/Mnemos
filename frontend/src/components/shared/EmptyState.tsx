interface Props {
  icon?: string
  message: string
  hint?: string
}

export function EmptyState({ icon = "📭", message, hint }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <span className="text-3xl mb-2">{icon}</span>
      <p className="text-sm text-[var(--glass-text-dim)]">{message}</p>
      {hint && (
        <p className="text-xs text-[var(--glass-text-muted)] mt-1">{hint}</p>
      )}
    </div>
  )
}