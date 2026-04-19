import { Icon, type IconName } from "./Icon"

interface Props {
  icon?: IconName
  message: string
  hint?: string
}

export function EmptyState({ icon = "brain", message, hint }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-6 px-4 text-center animate-fade-in">
      <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent)]/10 flex items-center justify-center mb-3">
        <Icon name={icon} size={18} className="text-[var(--accent-light)]" />
      </div>
      <p className="text-sm text-[var(--glass-text-dim)]">{message}</p>
      {hint && (
        <p className="text-xs text-[var(--glass-text-muted)] mt-1.5">{hint}</p>
      )}
    </div>
  )
}