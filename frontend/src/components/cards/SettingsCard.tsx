import { Icon } from "@/components/shared/Icon"
import type { Preferences } from "@/api/types"
import { PRIMARY_MODELS, SECONDARY_MODELS } from "@/lib/constants"

interface Props {
  data: Preferences
  send: (msg: string) => void
}

export function SettingsCard({ data, send }: Props) {
  return (
    <div className="space-y-2 animate-scale-in">
      {/* Theme */}
      <Card>
        <Label>Theme</Label>
        <div className="flex gap-1.5">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => send(`set theme ${t}`)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer",
                data.theme === t
                  ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                  : "glass-pill text-[var(--glass-text-dim)] hover:text-white",
              )}
            >
              <Icon name={t === "dark" ? "moon" : "sun"} size={12} />
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Primary model */}
      <Card>
        <Label>Primary Model</Label>
        <div className="space-y-0.5">
          {PRIMARY_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => send(`set primary model ${m.name}`)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer",
                data.primary_model === m.id
                  ? "bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/20"
                  : "text-[var(--glass-text-dim)] hover:bg-white/[0.03] hover:text-white/70",
              )}
            >
              <div className="flex items-center gap-2">
                {data.primary_model === m.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-glow-pulse" />
                )}
                <span>{m.name}</span>
              </div>
              <span className="text-[10px] text-[var(--glass-text-muted)]">{m.tier}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Secondary model */}
      <Card>
        <Label>Secondary Model</Label>
        <div className="space-y-0.5">
          {SECONDARY_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => send(`set secondary model ${m.name}`)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer",
                data.secondary_model === m.id
                  ? "bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/20"
                  : "text-[var(--glass-text-dim)] hover:bg-white/[0.03] hover:text-white/70",
              )}
            >
              <div className="flex items-center gap-2">
                {data.secondary_model === m.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-glow-pulse" />
                )}
                <span>{m.name}</span>
              </div>
              <span className="text-[10px] text-[var(--glass-text-muted)]">{m.tier}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => send(`set auto layout ${data.auto_layout ? "off" : "on"}`)}
          className="flex-1 glass-card rounded-2xl px-3 py-2.5 flex items-center justify-between cursor-pointer"
        >
          <span className="text-[11px] text-[var(--glass-text-dim)]">Auto Layout</span>
          <Toggle on={data.auto_layout} />
        </button>
        <button
          onClick={() => send(`set auto connect ${data.auto_connect ? "off" : "on"}`)}
          className="flex-1 glass-card rounded-2xl px-3 py-2.5 flex items-center justify-between cursor-pointer"
        >
          <span className="text-[11px] text-[var(--glass-text-dim)]">Auto Connect</span>
          <Toggle on={data.auto_connect} />
        </button>
      </div>

      {/* Similarity */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <Label>Similarity Threshold</Label>
          <span className="text-[11px] font-mono text-[var(--accent-light)]">
            {Math.round(data.similarity_threshold * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => send("decrease similarity threshold")}
            className="w-6 h-6 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-all text-xs cursor-pointer"
          >
            −
          </button>
          <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] rounded-full transition-all duration-500"
              style={{ width: `${data.similarity_threshold * 100}%` }}
            />
          </div>
          <button
            onClick={() => send("increase similarity threshold")}
            className="w-6 h-6 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-all text-xs cursor-pointer"
          >
            +
          </button>
        </div>
      </Card>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-3 space-y-2">
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium text-[var(--glass-text-muted)] uppercase tracking-wider">
      {children}
    </p>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div className={cn(
      "w-7 h-3.5 rounded-full transition-all duration-300 flex-shrink-0",
      on ? "bg-[var(--green)]" : "bg-white/10",
    )}>
      <div className={cn(
        "w-2.5 h-2.5 rounded-full bg-white transition-transform duration-300 mt-0.5",
        on ? "translate-x-[14px]" : "translate-x-[2px]",
      )} />
    </div>
  )
}

function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}