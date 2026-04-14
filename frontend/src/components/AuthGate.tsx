import { useEffect, useRef, useState, type ReactNode } from "react"
import { api } from "../api/client"

type AuthUser = {
  id: string
  email: string
  name?: string
  avatar_url?: string
}

type AuthState =
  | { stage: "loading" }
  | { stage: "allowed" }
  | { stage: "login"; clientId: string; error?: string }

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (resp: { credential: string }) => void
          }) => void
          renderButton: (
            element: HTMLElement,
            options: Record<string, string>
          ) => void
          prompt: () => void
        }
      }
    }
  }
}

const TOKEN_KEY = "mnemos-token"
const REFRESH_KEY = "mnemos-refresh-token"
const USER_KEY = "mnemos-user"

async function bootstrapAuth(): Promise<AuthState> {
  const me = await api.authMe()
  if (!me.auth_enabled) {
    localStorage.setItem(TOKEN_KEY, "auth-disabled")
    return { stage: "allowed" }
  }

  if (me.user) {
    return { stage: "allowed" }
  }

  const refresh = localStorage.getItem(REFRESH_KEY)
  if (refresh) {
    try {
      const refreshed = await api.authRefresh(refresh)
      localStorage.setItem(TOKEN_KEY, refreshed.access_token)
      const meAfterRefresh = await api.authMe()
      if (meAfterRefresh.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(meAfterRefresh.user))
        return { stage: "allowed" }
      }
    } catch {
      // Ignore and continue to login UI.
    }
  }

  return {
    stage: "login",
    clientId: me.google_client_id || "",
    error: me.google_client_id ? undefined : "Google Client ID is not configured on backend.",
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ stage: "loading" })
  const [busy, setBusy] = useState(false)
  const buttonHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const next = await bootstrapAuth()
        if (!cancelled) setState(next)
      } catch (e) {
        if (!cancelled) {
          setState({
            stage: "login",
            clientId: "",
            error: e instanceof Error ? e.message : "Authentication check failed.",
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.stage !== "login" || !state.clientId || !buttonHostRef.current) return

    const loadScript = () =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>("script[data-google-gsi='true']")
        if (existing) {
          if (window.google?.accounts?.id) resolve()
          else existing.addEventListener("load", () => resolve(), { once: true })
          return
        }

        const script = document.createElement("script")
        script.src = "https://accounts.google.com/gsi/client"
        script.async = true
        script.defer = true
        script.dataset.googleGsi = "true"
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("Failed to load Google Sign-In script"))
        document.head.appendChild(script)
      })

    loadScript()
      .then(() => {
        if (!window.google?.accounts?.id || !buttonHostRef.current) return

        window.google.accounts.id.initialize({
          client_id: state.clientId,
          callback: async ({ credential }) => {
            try {
              setBusy(true)
              const auth = await api.authGoogle(credential)
              localStorage.setItem(TOKEN_KEY, auth.access_token)
              localStorage.setItem(REFRESH_KEY, auth.refresh_token)
              localStorage.setItem(USER_KEY, JSON.stringify(auth.user as AuthUser))
              setState({ stage: "allowed" })
            } catch (e) {
              setState({
                stage: "login",
                clientId: state.clientId,
                error: e instanceof Error ? e.message : "Google authentication failed",
              })
            } finally {
              setBusy(false)
            }
          },
        })

        buttonHostRef.current.innerHTML = ""
        window.google.accounts.id.renderButton(buttonHostRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: "300",
        })
      })
      .catch((e) => {
        setState({
          stage: "login",
          clientId: state.clientId,
          error: e instanceof Error ? e.message : "Unable to initialize Google Sign-In",
        })
      })
  }, [state])

  if (state.stage === "allowed") return <>{children}</>

  if (state.stage === "loading") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-void)] text-white">
        <div className="glass rounded-2xl px-6 py-5 text-[14px] text-[var(--glass-text-dim)]">Checking authentication...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-void)] p-6">
      <div className="glass rounded-2xl w-full max-w-[420px] p-6">
        <div className="text-[11px] uppercase tracking-widest text-[var(--glass-text-muted)] mb-2">Authentication</div>
        <h1 className="text-white text-[24px] font-bold mb-2">Sign in to Mnemos</h1>
        <p className="text-[13px] text-[var(--glass-text-dim)] mb-5">
          Your backend requires authentication. Continue with Google to access workspace data.
        </p>

        <div ref={buttonHostRef} className="min-h-[44px]" />

        {busy && (
          <div className="mt-4 text-[12px] text-[var(--glass-text-dim)]">Signing you in...</div>
        )}

        {state.error && (
          <div className="mt-4 text-[12px] text-[#fca5a5]">{state.error}</div>
        )}
      </div>
    </div>
  )
}
