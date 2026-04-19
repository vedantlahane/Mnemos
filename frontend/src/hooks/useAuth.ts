import { useCallback } from "react"
import { api } from "@/api/client"
import { useAppStore } from "@/store"

export function useAuth() {
  const setUser = useAppStore((s) => s.setUser)
  const setAuthEnabled = useAppStore((s) => s.setAuthEnabled)

  const init = useCallback(async () => {
    try {
      const state = await api.auth.me()
      setAuthEnabled(state.auth_enabled)
      setUser(state.user)
    } catch {
      setUser(null)
    }
  }, [setUser, setAuthEnabled])

  const loginWithGoogle = useCallback(
    async (token: string) => {
      const result = await api.auth.loginWithGoogle(token)
      setUser(result.user)
    },
    [setUser],
  )

  const logout = useCallback(() => {
    api.auth.logout()
    setUser(null)
  }, [setUser])

  return { init, loginWithGoogle, logout }
}