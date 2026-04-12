import type { ReactNode } from "react"

export function ContextProvider({ children }: { children: ReactNode }) {
  // We use zustand for state, so ContextProvider just renders children here
  // Or provides other scoped contexts if needed later.
  return <>{children}</>
}
