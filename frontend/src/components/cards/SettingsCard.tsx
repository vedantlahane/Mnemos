import { Icon } from "@/components/shared/Icon"
import { useChat } from "@/hooks/useChat"
import type { Preferences } from "@/api/types"
import { PRIMARY_MODELS, SECONDARY_MODELS } from "@/lib/constants"

interface Props {
  data: Preferences
}

export function SettingsCard({ data }: Props) {
  const { send } = useChat()

  return (
    <div className="space-y-3 animate-scale-in">
      {/* Theme */}
      <SettingRow label="Theme">
        <div className="flex gap-1.5">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => send(`${t} mode`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all ${
                data.theme === t
                  ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                  : "glass-pill text-[var(--glass-text-dim)]"
              }`}
            >
              <Icon name={t === "dark" ? "moon" : "sun"} size={12} />
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </SettingRow>

      {/* Primary model */}
      <SettingRow label="Primary Model">
        <div className="space-y-1">
          {PRIMARY_MODELS.map((m) => (
            <ModelRow key={m.id} name={m.name} tier={m.tier} active={data.primary_model === m.id} />
          ))}
        </div>
      </SettingRow>

      {/* Secondary model */}
      <SettingRow label="Secondary Model">
        <div className="space-y-1">
          {SECONDARY_MODELS.map((m) => (
            <ModelRow key={m.id} name={m.name} tier={m.tier} active={data.secondary_model === m.id} />
          ))}
        </div>
      </SettingRow>

      {/* Toggles row */}
      <div className="flex gap-2">
        <TogglePill label="Auto Layout" on={data.auto_layout} />
        <TogglePill label="Auto Connect" on={data.auto_connect} />
      </div>

      {/* Similarity */}
      <SettingRow label={`Similarity — ${Math.round(data.similarity_threshold * 100)}%`}>
        <div className="w-full h-1 bg-black/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] rounded-full transition-all duration-500"
            style={{ width: `${data.similarity_threshold * 100}%` }}
          />
        </div>
      </SettingRow>
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-3 space-y-2">
      <p className="text-[11px] font-medium text-[var(--glass-text-muted)] uppercase tracking-wider">{label}</p>
      {children}
    </div>
  )
}

function ModelRow({ name, tier, active }: { name: string; tier: string; active: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
        active
          ? "bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/20"
          : "text-[var(--glass-text-dim)] hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2">
        {active && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-glow-pulse" />}
        <span>{name}</span>
      </div>
      <span className="text-[10px] text-[var(--glass-text-muted)]">{tier}</span>
    </div>
  )
}

function TogglePill({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={`flex-1 glass-card rounded-2xl px-3 py-2.5 flex items-center justify-between ${
      on ? "border-[var(--green)]/20" : ""
    }`}>
      <span className="text-[11px] text-[var(--glass-text-dim)]">{label}</span>
      <div className={`w-7 h-3.5 rounded-full transition-all duration-300 ${on ? "bg-[var(--green)]" : "bg-white/10"}`}>
        <div className={`w-2.5 h-2.5 rounded-full bg-white transition-transform duration-300 mt-0.5 ${
          on ? "translate-x-[14px]" : "translate-x-[2px]"
        }`} />
      </div>
    </div>
  )
}