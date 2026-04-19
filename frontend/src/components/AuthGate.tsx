import { useEffect, useRef, useState, type ReactNode } from "react"
import { api } from "@/api/client"
import { Logo } from "@/components/shared/Logo"
import { Icon } from "@/components/shared/Icon"

type Stage =
  | { kind: "loading" }
  | { kind: "allowed" }
  | { kind: "login"; clientId: string; error?: string }

export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>({ kind: "loading" })
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await api.auth.me()
        if (cancelled) return

        if (!me.auth_enabled) {
          localStorage.setItem("mnemos_access", "auth-disabled")
          setStage({ kind: "allowed" })
          return
        }

        if (me.user) {
          setStage({ kind: "allowed" })
          return
        }

        const refreshToken = localStorage.getItem("mnemos_refresh")
        if (refreshToken) {
          try {
            await api.auth.refresh(refreshToken)
            const after = await api.auth.me()
            if (after.user) {
              setStage({ kind: "allowed" })
              return
            }
          } catch { /* fall through */ }
        }

        setStage({
          kind: "login",
          clientId: me.google_client_id ?? "",
          error: me.google_client_id ? undefined : "Google Client ID not configured.",
        })
      } catch (e) {
        if (!cancelled) {
          setStage({
            kind: "login",
            clientId: "",
            error: e instanceof Error ? e.message : "Auth check failed",
          })
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (stage.kind !== "login" || !stage.clientId || !buttonRef.current) return

    const init = async () => {
      if (!document.querySelector("script[data-gsi]")) {
        const s = document.createElement("script")
        s.src = "https://accounts.google.com/gsi/client"
        s.async = true
        s.dataset.gsi = "true"
        document.head.appendChild(s)
        await new Promise<void>((res, rej) => {
          s.onload = () => res()
          s.onerror = () => rej()
        })
      }

      if (!window.google?.accounts?.id || !buttonRef.current) return

      window.google.accounts.id.initialize({
        client_id: stage.clientId,
        callback: async ({ credential }: { credential: string }) => {
          try {
            await api.auth.loginWithGoogle(credential)
            setStage({ kind: "allowed" })
          } catch (e) {
            setStage({
              kind: "login",
              clientId: stage.clientId,
              error: e instanceof Error ? e.message : "Login failed",
            })
          }
        },
      })

      buttonRef.current.innerHTML = ""
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: "300",
      })
    }

    init().catch(() => {
      setStage({ kind: "login", clientId: stage.clientId, error: "Failed to load Google Sign-In" })
    })
  }, [stage])

  if (stage.kind === "allowed") return <>{children}</>

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-void)] relative">
      {/* Ambient glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.04] pointer-events-none"
        style={{
          background: "radial-gradient(circle, var(--accent), transparent 70%)",
          top: "20%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="glass-solid rounded-3xl p-10 w-full max-w-[380px] text-center relative z-10 animate-scale-in">
        <div className="mb-6 inline-block">
          <Logo size={52} animated />
        </div>
        <h1 className="text-white text-xl font-semibold mb-1 tracking-tight">Mnemos</h1>

        {stage.kind === "loading" ? (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Icon name="processing" size={14} className="text-[var(--accent-light)] animate-spin" />
            <p className="text-sm text-[var(--glass-text-dim)]">Connecting…</p>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-[var(--glass-text-muted)] mb-8">
              Sign in to your knowledge workspace
            </p>
            <div ref={buttonRef} className="min-h-[44px] flex justify-center" />
            {stage.error && (
              <p className="mt-5 text-xs text-[var(--red)]/80">{stage.error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: {
            client_id: string
            callback: (r: { credential: string }) => void
          }) => void
          renderButton: (el: HTMLElement, opts: Record<string, string>) => void
        }
      }
    }
  }
}