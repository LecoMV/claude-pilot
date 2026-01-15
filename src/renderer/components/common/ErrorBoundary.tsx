import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  resetKeys?: unknown[]
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

/**
 * Error Boundary component for graceful error handling in React
 * Catches JavaScript errors anywhere in child component tree
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)

    // Send to main process for logging
    window.electron?.send('error:ui', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset error state when resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      )
      if (hasChanged) {
        this.resetError()
      }
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    })
  }

  copyErrorDetails = (): void => {
    const { error, errorInfo } = this.state
    const details = [
      `Error: ${error?.message}`,
      '',
      'Stack Trace:',
      error?.stack ?? 'No stack trace available',
      '',
      'Component Stack:',
      errorInfo?.componentStack ?? 'No component stack available',
    ].join('\n')

    navigator.clipboard.writeText(details)
    this.setState({ copied: true })
    setTimeout(() => this.setState({ copied: false }), 2000)
  }

  render(): ReactNode {
    const { hasError, error, errorInfo, copied } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 animate-in">
          <div className="card max-w-lg w-full p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-red/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-accent-red" />
            </div>

            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Something went wrong
            </h2>

            <p className="text-text-muted mb-4">
              An error occurred while rendering this component.
            </p>

            {error && (
              <div className="bg-background rounded-lg p-4 mb-4 text-left">
                <p className="text-sm font-mono text-accent-red break-all">
                  {error.message}
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={this.resetError}
                className="btn btn-primary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </button>

              <button
                onClick={this.copyErrorDetails}
                className="btn btn-secondary"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Details
                  </>
                )}
              </button>
            </div>

            {/* Expandable stack trace for debugging */}
            {errorInfo && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary">
                  Show technical details
                </summary>
                <pre className="mt-2 p-3 bg-background rounded-lg text-xs overflow-auto max-h-48 text-text-muted font-mono">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return children
  }
}

/**
 * Hook-based error boundary wrapper for functional components
 */
interface WithErrorBoundaryOptions {
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  resetKeys?: unknown[]
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: WithErrorBoundaryOptions = {}
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary {...options}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName ?? Component.name ?? 'Component'})`

  return WrappedComponent
}

/**
 * Inline error boundary for wrapping specific sections
 */
interface InlineErrorBoundaryProps {
  children: ReactNode
  fallbackMessage?: string
  className?: string
}

export function InlineErrorBoundary({
  children,
  fallbackMessage = 'Failed to load this section',
  className,
}: InlineErrorBoundaryProps): ReactNode {
  return (
    <ErrorBoundary
      fallback={
        <div className={cn('p-4 rounded-lg bg-accent-red/10 text-accent-red text-sm', className)}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{fallbackMessage}</span>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

/**
 * Suspense-like error boundary for async components
 */
interface AsyncBoundaryProps {
  children: ReactNode
  loading?: ReactNode
  error?: ReactNode
}

interface AsyncBoundaryState {
  hasError: boolean
}

export class AsyncBoundary extends Component<AsyncBoundaryProps, AsyncBoundaryState> {
  constructor(props: AsyncBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): AsyncBoundaryState {
    return { hasError: true }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.error ?? (
        <div className="p-4 text-center text-text-muted">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
          <p>Failed to load content</p>
        </div>
      )
    }

    return this.props.children
  }
}
