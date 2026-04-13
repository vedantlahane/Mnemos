import { useEffect } from "react"
import { api } from "../api/client"
import { useSettings } from "../hooks/useSettings"
import { GlassInput } from "../glass/GlassInput"
import { GlassDropdown } from "../glass/GlassDropdown"
import type { BlockItem } from "../types"
import { useState } from "react"

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

        <SettingRow
          label="LLM Model"
          description="Model used for processing and chat"
        >
          <GlassDropdown
            value={settings.model}
            onChange={(v) => update({ model: v })}
            options={[
              { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
              { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
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
                update({
                  similarity_threshold: parseFloat(e.target.value) || 0.65,
                })
              }
              className="w-20 text-center text-[13px]"
            />
          </div>
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
          <BackendStatus />
        </SettingRow>
      </div>

      <div className="mt-6 pt-4 border-t border-[var(--glass-border)]">
        <p className="text-[11px] text-[var(--glass-text-muted)] leading-relaxed">
          Settings are persisted locally and synced to the backend.
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

function BackendStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">(
    "checking"
  )

  useEffect(() => {
    api
      .health()
      .then((res) => setStatus(res ? "online" : "offline"))
      .catch(() => setStatus("offline"))
  }, [])

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          status === "online"
            ? "bg-[var(--green)]"
            : status === "offline"
              ? "bg-[var(--red)]"
              : "bg-[var(--amber)] animate-pulse"
        }`}
      />
      <span className="text-[12px] text-[var(--glass-text-dim)] capitalize">
        {status}
      </span>
    </div>
  )
}