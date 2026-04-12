import type { ReactNode } from "react"

/**
 * ContextProvider wraps the app.
 * State is managed by zustand (useAppContextStore), not React context.
 * This component exists as a structural placeholder for:
 * - Future React context providers (theme, locale, etc.)
 * - Error boundaries
 * - Initialization side effects
 */
export function ContextProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}