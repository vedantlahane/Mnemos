import { type ReactNode, useEffect } from "react"
import { useSettingsStore } from "../hooks/useSettings"

export function ContextProvider({ children }: { children: ReactNode }) {
  const load = useSettingsStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return <>{children}</>
}