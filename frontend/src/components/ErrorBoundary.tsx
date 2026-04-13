import { Component, type ReactNode, type ErrorInfo } from "react"
import { AlertCircle } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="glass-surface-1 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle className="text-[var(--red)]" size={16} />
          <div>
            <p className="text-[13px] text-[var(--red)] font-semibold">
              Something went wrong
            </p>
            <p className="text-[11px] text-[var(--glass-text-muted)] mt-1">
              {this.state.error?.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="ml-auto text-[11px] text-[var(--accent)] hover:underline"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}