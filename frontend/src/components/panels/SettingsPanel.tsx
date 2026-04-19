import { usePanel } from "@/hooks/usePanel"
import { useChat } from "@/hooks/useChat"
import { EmptyState } from "@/components/shared/EmptyState"
import { PRIMARY_MODELS, SECONDARY_MODELS } from "@/lib/constants"

export function SettingsPanel() {
  const { settings } = usePanel()
  const { send } = useChat()

  if (!settings) {
    return <EmptyState icon="⚙️" message="Settings unavailable" hint='Say "open settings"' />
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-[var(--glass-text-muted)] uppercase tracking-wider">Settings</p>

      {/* Theme */}
      <SettingRow label="Theme" value={settings.theme}>
        <div className="flex gap-1.5">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => send(`${t} mode`)}
              className={`px-3 py-1 rounded-lg text-xs transition-all ${
                settings.theme === t
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--glass-bg-thick)] text-[var(--glass-text-dim)] hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </SettingRow>

      {/* Primary Model */}
      <SettingRow label="Primary Model" value={settings.primary_model}>
        <div className="space-y-1">
          {PRIMARY_MODELS.map((m) => (
            <ModelOption
              key={m.id}
              name={m.name}
              tier={m.tier}
              active={settings.primary_model === m.id}
            />
          ))}
        </div>
      </SettingRow>

      {/* Secondary Model */}
      <SettingRow label="Secondary Model" value={settings.secondary_model}>
        <div className="space-y-1">
          {SECONDARY_MODELS.map((m) => (
            <ModelOption
              key={m.id}
              name={m.name}
              tier={m.tier}
              active={settings.secondary_model === m.id}
            />
          ))}
        </div>
      </SettingRow>

      {/* Toggles */}
      <SettingRow label="Auto Layout" value={settings.auto_layout ? "On" : "Off"}>
        <Toggle on={settings.auto_layout} />
      </SettingRow>

      <SettingRow label="Auto Connect" value={settings.auto_connect ? "On" : "Off"}>
        <Toggle on={settings.auto_connect} />
      </SettingRow>

      {/* Similarity Threshold */}
      <SettingRow label="Similarity Threshold" value={`${Math.round(settings.similarity_threshold * 100)}%`}>
        <div className="w-full h-1.5 bg-[var(--glass-bg-thick)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all"
            style={{ width: `${settings.similarity_threshold * 100}%` }}
          />
        </div>
      </SettingRow>
    </div>
  )
}

function SettingRow({ label, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-[var(--glass-text-dim)]">{label}</p>
      {children}
    </div>
  )
}

function ModelOption({ name, tier, active }: { name: string; tier: string; active: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
        active
          ? "bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20"
          : "text-[var(--glass-text-dim)]"
      }`}
    >
      <span>{name}</span>
      <span className="text-[10px] text-[var(--glass-text-muted)]">{tier}</span>
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div className={`w-8 h-4 rounded-full transition-all ${on ? "bg-[var(--accent)]" : "bg-[var(--glass-bg-thick)]"}`}>
      <div
        className={`w-3 h-3 rounded-full bg-white transition-transform mt-0.5 ${on ? "translate-x-4.5 ml-0.5" : "translate-x-0.5"}`}
      />
    </div>
  )
}