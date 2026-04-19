import { AuthGate } from "@/components/AuthGate"
import { Shell } from "@/components/Shell"
import { ErrorBoundary } from "@/components/ErrorBoundary"

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <Shell />
      </AuthGate>
    </ErrorBoundary>
  )
}