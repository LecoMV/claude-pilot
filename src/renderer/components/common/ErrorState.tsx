/**
 * ErrorState Component
 *
 * Reusable error state display for views and components that fail to load.
 * Provides specific error messages, error codes, and recovery actions.
 */

import { AlertTriangle, RefreshCw, Settings, Server, Database, Wifi, FileX } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ErrorType =
  | 'network'
  | 'server'
  | 'database'
  | 'notFound'
  | 'permission'
  | 'timeout'
  | 'validation'
  | 'unknown'

interface ErrorConfig {
  icon: typeof AlertTriangle
  title: string
  description: string
  color: string
}

const ERROR_CONFIGS: Record<ErrorType, ErrorConfig> = {
  network: {
    icon: Wifi,
    title: 'Connection Failed',
    description: 'Unable to connect. Check your network connection and try again.',
    color: 'text-accent-yellow',
  },
  server: {
    icon: Server,
    title: 'Service Unavailable',
    description: 'The service is not responding. It may be starting up or experiencing issues.',
    color: 'text-accent-red',
  },
  database: {
    icon: Database,
    title: 'Database Error',
    description: 'Unable to retrieve data from the database. The service may need to be restarted.',
    color: 'text-accent-red',
  },
  notFound: {
    icon: FileX,
    title: 'Not Found',
    description: 'The requested resource could not be found.',
    color: 'text-accent-yellow',
  },
  permission: {
    icon: AlertTriangle,
    title: 'Permission Denied',
    description: 'You do not have permission to access this resource.',
    color: 'text-accent-red',
  },
  timeout: {
    icon: RefreshCw,
    title: 'Request Timeout',
    description: 'The request took too long to complete. Please try again.',
    color: 'text-accent-yellow',
  },
  validation: {
    icon: AlertTriangle,
    title: 'Invalid Data',
    description: 'The data provided is invalid or incomplete.',
    color: 'text-accent-yellow',
  },
  unknown: {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again.',
    color: 'text-accent-red',
  },
}

interface ErrorStateProps {
  /** Error message to display */
  message?: string
  /** Type of error for specific styling and messaging */
  type?: ErrorType
  /** Error code for debugging */
  code?: string
  /** Original error object */
  error?: Error | unknown
  /** Retry callback */
  onRetry?: () => void
  /** Navigate to settings callback */
  onSettings?: () => void
  /** Custom action */
  action?: {
    label: string
    onClick: () => void
  }
  /** Additional class names */
  className?: string
  /** Compact mode for inline errors */
  compact?: boolean
  /** Show technical details */
  showDetails?: boolean
}

/**
 * Detect error type from error object
 */
function detectErrorType(error: Error | unknown): ErrorType {
  if (!error) return 'unknown'

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnrefused')
  ) {
    return 'network'
  }
  if (message.includes('timeout') || message.includes('etimedout')) {
    return 'timeout'
  }
  if (message.includes('not found') || message.includes('404')) {
    return 'notFound'
  }
  if (
    message.includes('permission') ||
    message.includes('403') ||
    message.includes('unauthorized')
  ) {
    return 'permission'
  }
  if (message.includes('database') || message.includes('postgres') || message.includes('sql')) {
    return 'database'
  }
  if (message.includes('server') || message.includes('500') || message.includes('503')) {
    return 'server'
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation'
  }

  return 'unknown'
}

/**
 * Generate error code from error
 */
function generateErrorCode(error: Error | unknown, type: ErrorType): string {
  const prefix = type.toUpperCase().slice(0, 3)
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase()

  if (error instanceof Error && error.name) {
    return `${prefix}-${error.name.slice(0, 8).toUpperCase()}-${timestamp}`
  }

  return `${prefix}-${timestamp}`
}

export function ErrorState({
  message,
  type,
  code,
  error,
  onRetry,
  onSettings,
  action,
  className,
  compact = false,
  showDetails = false,
}: ErrorStateProps) {
  const errorType = type || detectErrorType(error)
  const config = ERROR_CONFIGS[errorType]
  const Icon = config.icon
  const errorCode = code || generateErrorCode(error, errorType)
  const errorMessage = message || (error instanceof Error ? error.message : config.description)

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20',
          className
        )}
      >
        <Icon className={cn('w-5 h-5 flex-shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate">{errorMessage}</p>
          <p className="text-xs text-text-muted font-mono">{errorCode}</p>
        </div>
        {onRetry && (
          <button onClick={onRetry} className="btn btn-sm btn-secondary flex-shrink-0">
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center justify-center p-8', className)}>
      <div className="card max-w-md w-full p-6 text-center">
        {/* Icon */}
        <div
          className={cn(
            'w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center',
            errorType === 'unknown' ? 'bg-accent-red/10' : 'bg-surface-hover'
          )}
        >
          <Icon className={cn('w-8 h-8', config.color)} />
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-text-primary mb-2">{config.title}</h2>

        {/* Message */}
        <p className="text-text-muted mb-4">{errorMessage}</p>

        {/* Error code */}
        <p className="text-xs font-mono text-text-muted mb-4">Error Code: {errorCode}</p>

        {/* Actions */}
        <div className="flex gap-2 justify-center flex-wrap">
          {onRetry && (
            <button onClick={onRetry} className="btn btn-primary">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          )}

          {onSettings && (
            <button onClick={onSettings} className="btn btn-secondary">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </button>
          )}

          {action && (
            <button onClick={action.onClick} className="btn btn-secondary">
              {action.label}
            </button>
          )}
        </div>

        {/* Technical details */}
        {showDetails && error instanceof Error && error.stack && (
          <details className="mt-4 text-left">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-background rounded-lg text-xs overflow-auto max-h-32 text-text-muted font-mono">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * Inline error message for form fields and small areas
 */
interface InlineErrorProps {
  message: string
  className?: string
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <p className={cn('text-sm text-accent-red flex items-center gap-1 mt-1', className)}>
      <AlertTriangle className="w-3 h-3" />
      {message}
    </p>
  )
}

/**
 * Empty state with optional error styling
 */
interface EmptyErrorStateProps {
  title: string
  description: string
  icon?: typeof AlertTriangle
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyErrorState({
  title,
  description,
  icon: Icon = FileX,
  action,
  className,
}: EmptyErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
      <div className="w-12 h-12 mb-4 rounded-full bg-surface-hover flex items-center justify-center">
        <Icon className="w-6 h-6 text-text-muted" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-muted mb-4 max-w-sm">{description}</p>
      {action && (
        <button onClick={action.onClick} className="btn btn-secondary">
          {action.label}
        </button>
      )}
    </div>
  )
}
