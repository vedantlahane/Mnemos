import { type ReactNode, useEffect } from "react"
import { useSettingsStore } from "../hooks/useSettings"
import { useAuth } from "@/hooks/use-auth-new"

export function ContextProvider({ children }: { children: ReactNode }) {
  const load = useSettingsStore((s) => s.load)
  const { init } = useAuth()

  useEffect(() => {
    load()
    init() // Initialize auth on mount
  }, [load, init])

  return <>{children}</>
}