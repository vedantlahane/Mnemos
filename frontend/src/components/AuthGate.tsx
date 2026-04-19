import { useEffect, useRef, useState, type ReactNode } from "react"
import { api } from "@/api/client"

type Stage =
  | { kind: "loading" }
  | { kind: "allowed" }
  | { kind: "login"; clientId: string; error?: string }

export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>({ kind: "loading" })
  const buttonRef = useRef<HTMLDivElement>(null)

  // Bootstrap
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

        // Try refresh
        const refreshToken = localStorage.getItem("mnemos_refresh")
        if (refreshToken) {
          try {
            await api.auth.refresh(refreshToken)
            const after = await api.auth.me()
            if (after.user) {
              setStage({ kind: "allowed" })
              return
            }
          } catch { /* fall through to login */ }
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

  // Google Sign-In button
  useEffect(() => {
    if (stage.kind !== "login" || !stage.clientId || !buttonRef.current) return

    const init = async () => {
      // Load GSI script
      if (!document.querySelector("script[data-gsi]")) {
        const s = document.createElement("script")
        s.src = "https://accounts.google.com/gsi/client"
        s.async = true
        s.dataset.gsi = "true"
        document.head.appendChild(s)
        await new Promise<void>((res, rej) => { s.onload = () => res(); s.onerror = () => rej() })
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
    <div className="h-full flex items-center justify-center bg-[var(--color-void)]">
      <div className="glass rounded-2xl p-8 w-full max-w-[420px] text-center">
        <p className="text-5xl mb-4">🧠</p>
        <h1 className="text-white text-xl font-bold mb-2">Mnemos</h1>

        {stage.kind === "loading" ? (
          <p className="text-sm text-[var(--glass-text-dim)]">Connecting…</p>
        ) : (
          <>
            <p className="text-sm text-[var(--glass-text-dim)] mb-6">
              Sign in to access your knowledge workspace.
            </p>
            <div ref={buttonRef} className="min-h-[44px] flex justify-center" />
            {stage.error && (
              <p className="mt-4 text-xs text-[var(--red)]">{stage.error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Extend Window for Google GSI
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, opts: Record<string, string>) => void
        }
      }
    }
  }
}