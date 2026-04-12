import { useEffect, useState } from "react"
import { api } from "../api/client"
import { GlassInput } from "../glass/GlassInput"
import { GlassDropdown } from "../glass/GlassDropdown"

export default function SettingsBlock() {
  const [threshold, setThreshold] = useState("0.65")
  const [model, setModel] = useState("gemini-2.5-flash")
  const [theme, setTheme] = useState("glass")

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-tertiary)] mb-6">
        Workspace Settings
      </div>

      <div className="flex flex-col gap-5">
        <SettingRow label="Theme" description="Visual theme for the workspace">
          <GlassDropdown
            value={theme}
            onChange={setTheme}
            options={[
              { value: "glass", label: "Glass (default)" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SettingRow>

        <SettingRow label="LLM Model" description="Model used for processing and chat">
          <GlassDropdown
            value={model}
            onChange={setModel}
            options={[
              { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
              { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
            ]}
          />
        </SettingRow>

        <SettingRow label="Similarity Threshold" description="Minimum score for semantic search (0.0 – 1.0)">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-36 accent-[var(--color-accent-dim)]"
            />
            <GlassInput
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setThreshold(e.target.value)}
              className="w-20 text-center text-[13px]"
            />
          </div>
        </SettingRow>

        <SettingRow label="Embedding Dimensions" description="Output dimensions for Gemini embeddings">
          <span className="text-[13px] text-[var(--color-secondary)] font-mono">768</span>
        </SettingRow>

        <SettingRow label="Backend" description="API server connection">
          <BackendStatus />
        </SettingRow>
      </div>

      <div className="mt-6 pt-4 border-t border-[rgba(255,255,255,0.06)]">
        <p className="text-[11px] text-[var(--color-tertiary)] leading-relaxed">
          Settings are stored locally. You can also type{" "}
          <code className="font-mono text-[var(--color-accent)]">"set threshold to 0.8"</code> in chat.
        </p>
      </div>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-white">{label}</div>
        <div className="text-[11px] text-[var(--color-tertiary)] mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function BackendStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking")

  useEffect(() => {
    api.health()
      .then((res) => setStatus(res ? "online" : "offline"))
      .catch(() => setStatus("offline"))
  }, [])

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          status === "online"
            ? "bg-[var(--color-success)]"
            : status === "offline"
            ? "bg-[var(--color-error)]"
            : "bg-[var(--color-warning)] animate-pulse"
        }`}
      />
      <span className="text-[12px] text-[var(--color-secondary)] capitalize">{status}</span>
    </div>
  )
}