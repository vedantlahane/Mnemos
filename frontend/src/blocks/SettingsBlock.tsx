import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useSettings } from "../hooks/useSettings"
import { GlassInput } from "../glass/GlassInput"
import { GlassDropdown } from "../glass/GlassDropdown"
import type { BlockItem } from "../types"

export default function SettingsBlock(_props: { item: BlockItem }) {
  const { settings, update } = useSettings()

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-6">
        Workspace Settings
      </div>

      <div className="flex flex-col gap-5">
        <SettingRow label="Theme" description="Visual theme for the workspace">
          <GlassDropdown
            value={settings.theme}
            onChange={(v) => update({ theme: v as "glass" | "dark" })}
            options={[
              { value: "glass", label: "Glass (default)" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SettingRow>

        <SettingRow label="Primary LLM" description="Model for complex tasks (chat, analysis)">
          <GlassDropdown
            value={settings.model}
            onChange={(v) => update({ model: v })}
            options={[
              { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
              { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
            ]}
          />
        </SettingRow>

        <SettingRow label="Fast LLM (Groq)" description="Model for extraction, routing, edge classification">
          <GlassDropdown
            value={settings.groq_model}
            onChange={(v) => update({ groq_model: v })}
            options={[
              { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
              { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (faster)" },
              { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Similarity Threshold"
          description="Minimum score for semantic search (0.0 – 1.0)"
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.similarity_threshold}
              onChange={(e) =>
                update({ similarity_threshold: parseFloat(e.target.value) })
              }
              className="w-36 accent-[var(--accent)]"
            />
            <GlassInput
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={String(settings.similarity_threshold)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update({ similarity_threshold: parseFloat(e.target.value) || 0.65 })
              }
              className="w-20 text-center text-[13px]"
            />
          </div>
        </SettingRow>

        <SettingRow label="Auto Layout" description="AI auto-positions new notes on canvas">
          <Toggle
            value={settings.auto_layout}
            onChange={(v) => update({ auto_layout: v })}
          />
        </SettingRow>

        <SettingRow label="Auto Connect" description="Auto-create edges between related notes">
          <Toggle
            value={settings.auto_connect}
            onChange={(v) => update({ auto_connect: v })}
          />
        </SettingRow>

        <SettingRow
          label="Embedding Dimensions"
          description="Output dimensions for Gemini embeddings"
        >
          <span className="text-[13px] text-[var(--glass-text-dim)] font-mono">
            {settings.embedding_dimensions}
          </span>
        </SettingRow>

        <SettingRow label="Backend" description="API server connection">
          <BackendStatus          />
        </SettingRow>
      </div>

      <div className="mt-6 pt-4 border-t border-[var(--glass-border)]">
        <p className="text-[11px] text-[var(--glass-text-muted)] leading-relaxed">
          Settings are synced to the backend and persisted locally as fallback.
        </p>
      </div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-white">{label}</div>
        <div className="text-[11px] text-[var(--glass-text-muted)] mt-0.5">
          {description}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        value ? "bg-[var(--accent)]" : "bg-[rgba(255,255,255,0.1)]"
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}

function BackendStatus() {
  const [status, setStatus] = useState<{
    state: "checking" | "online" | "offline"
    version?: string
    providers?: { google: boolean; groq: boolean }
    authEnabled?: boolean
  }>({ state: "checking" })

  useEffect(() => {
    api
      .health()
      .then((res) => {
        if (res) {
          setStatus({
            state: "online",
            version: res.version,
            providers: res.providers,
            authEnabled: res.auth_enabled,
          })
        } else {
          setStatus({ state: "offline" })
        }
      })
      .catch(() => setStatus({ state: "offline" }))
  }, [])

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            status.state === "online"
              ? "bg-[var(--green)]"
              : status.state === "offline"
                ? "bg-[var(--red)]"
                : "bg-[var(--amber)] animate-pulse"
          }`}
        />
        <span className="text-[12px] text-[var(--glass-text-dim)] capitalize">
          {status.state}
          {status.version && ` v${status.version}`}
        </span>
      </div>
      {status.providers && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--glass-text-muted)]">
          <span>Gemini ✓</span>
          <span>
            Groq {status.providers.groq ? "✓" : "✗"}
          </span>
          <span>
            Auth {status.authEnabled ? "on" : "off"}
          </span>
        </div>
      )}
    </div>
  )
}