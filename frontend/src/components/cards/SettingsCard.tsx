// === FILE: frontend/src/components/cards/SettingsCard.tsx ===

import { Icon } from "@/components/shared/Icon"
import type { Preferences } from "@/api/types"
import { PRIMARY_MODELS, SECONDARY_MODELS } from "@/lib/constants"

interface Props {
  data: Preferences
  send: (msg: string) => void
}

export function SettingsCard({ data, send }: Props) {
  return (
    <div className="space-y-1.5">
      {/* Theme */}
      <Row>
        <RowLabel>Theme</RowLabel>
        <div className="flex gap-1.5">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => send(t === "dark" ? "dark mode" : "light mode")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all cursor-pointer",
                data.theme === t
                  ? "bg-[var(--accent)] text-white shadow-[0_0_10px_var(--accent-glow)]"
                  : "bg-white/[0.04] text-white/35 hover:text-white/60 border border-white/[0.06]",
              )}
            >
              <Icon name={t === "dark" ? "moon" : "sun"} size={11} />
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </Row>

      {/* Primary Model */}
      <Row>
        <RowLabel>Primary Model</RowLabel>
        <div className="space-y-0.5">
          {PRIMARY_MODELS.map((m) => {
            const isActive = data.primary_model === m.id || data.primary_model === m.name
            return (
              <button
                key={m.id}
                onClick={() => send(`set primary model ${m.id}`)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] transition-all cursor-pointer",
                  isActive
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/15"
                    : "text-white/35 hover:bg-white/[0.03] hover:text-white/55",
                )}
              >
                <div className="flex items-center gap-2">
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
                  )}
                  <span>{m.name}</span>
                </div>
                <span className="text-[10px] text-white/15">{m.tier}</span>
              </button>
            )
          })}
        </div>
      </Row>

      {/* Secondary Model */}
      <Row>
        <RowLabel>Secondary Model</RowLabel>
        <div className="space-y-0.5">
          {SECONDARY_MODELS.map((m) => {
            const isActive = data.secondary_model === m.id || data.secondary_model === m.name
            return (
              <button
                key={m.id}
                onClick={() => send(`set secondary model ${m.id}`)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] transition-all cursor-pointer",
                  isActive
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/15"
                    : "text-white/35 hover:bg-white/[0.03] hover:text-white/55",
                )}
              >
                <div className="flex items-center gap-2">
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
                  )}
                  <span>{m.name}</span>
                </div>
                <span className="text-[10px] text-white/15">{m.tier}</span>
              </button>
            )
          })}
        </div>
      </Row>

      {/* Toggles */}
      <div className="flex gap-1.5">
        <button
          onClick={() => send(`set auto layout ${data.auto_layout ? "off" : "on"}`)}
          className="flex-1 flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-all"
        >
          <span className="text-[11px] text-white/35">Auto Layout</span>
          <Toggle on={data.auto_layout} />
        </button>
        <button
          onClick={() => send(`set auto connect ${data.auto_connect ? "off" : "on"}`)}
          className="flex-1 flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-all"
        >
          <span className="text-[11px] text-white/35">Auto Connect</span>
          <Toggle on={data.auto_connect} />
        </button>
      </div>

      {/* Similarity */}
      <Row>
        <div className="flex items-center justify-between mb-1.5">
          <RowLabel>Similarity</RowLabel>
          <span className="text-[11px] font-mono text-[var(--accent-light)]">
            {Math.round(data.similarity_threshold * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => send("decrease similarity threshold")}
            className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.07] transition-all text-xs cursor-pointer border border-white/[0.06]"
          >
            −
          </button>
          <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] rounded-full transition-all duration-500"
              style={{ width: `${data.similarity_threshold * 100}%` }}
            />
          </div>
          <button
            onClick={() => send("increase similarity threshold")}
            className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.07] transition-all text-xs cursor-pointer border border-white/[0.06]"
          >
            +
          </button>
        </div>
      </Row>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-2.5 bg-white/[0.02] border border-white/[0.05] space-y-1.5">
      {children}
    </div>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.06em]">
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