import { Component, type ReactNode, type ErrorInfo } from "react"

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-[var(--color-void)]">
          <div className="glass rounded-2xl p-6 max-w-md text-center">
            <p className="text-[var(--red)] text-sm font-semibold mb-1">Something went wrong</p>
            <p className="text-[var(--glass-text-muted)] text-xs mb-4">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}