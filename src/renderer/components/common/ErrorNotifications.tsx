import { useEffect } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  X,
  Bell,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useErrorStore,
  initializeErrorListener,
  type ErrorSeverity,
  type ErrorNotification,
} from '@/stores/errors'

/**
 * Get icon component for severity
 */
function SeverityIcon({ severity, className }: { severity: ErrorSeverity; className?: string }) {
  const iconClass = cn('w-4 h-4', className)

  switch (severity) {
    case 'critical':
      return <AlertOctagon className={cn(iconClass, 'text-accent-red')} />
    case 'error':
      return <AlertTriangle className={cn(iconClass, 'text-accent-red')} />
    case 'warning':
      return <AlertCircle className={cn(iconClass, 'text-accent-yellow')} />
    case 'info':
      return <Info className={cn(iconClass, 'text-accent-blue')} />
    default:
      return <AlertTriangle className={iconClass} />
  }
}

/**
 * Single error notification item
 */
function ErrorItem({ error, onDismiss }: { error: ErrorNotification; onDismiss: () => void }) {
  const severityBg = {
    critical: 'bg-accent-red/10 border-accent-red/30',
    error: 'bg-accent-red/10 border-accent-red/20',
    warning: 'bg-accent-yellow/10 border-accent-yellow/20',
    info: 'bg-accent-blue/10 border-accent-blue/20',
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-all',
        severityBg[error.severity],
        error.dismissed && 'opacity-50'
      )}
    >
      <SeverityIcon severity={error.severity} className="mt-0.5 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-text-muted">{error.code}</span>
          <span className="text-xs text-text-muted">
            {new Date(error.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-text-primary break-words">{error.message}</p>

        {error.action && (
          <button
            onClick={error.action.handler}
            className="mt-2 text-xs text-accent-purple hover:underline"
          >
            {error.action.label}
          </button>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/**
 * Error notifications panel
 */
interface ErrorNotificationsPanelProps {
  className?: string
  maxVisible?: number
}

export function ErrorNotificationsPanel({
  className,
  maxVisible = 5,
}: ErrorNotificationsPanelProps) {
  const { errors, dismissError, dismissAll, clearErrors } = useErrorStore()

  // Initialize listener on mount
  useEffect(() => {
    const unsubscribe = initializeErrorListener()
    return () => unsubscribe()
  }, [])

  const visibleErrors = errors.filter((e) => !e.dismissed).slice(0, maxVisible)
  const hiddenCount = errors.filter((e) => !e.dismissed).length - maxVisible

  if (visibleErrors.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Notifications ({visibleErrors.length})
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={dismissAll}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Dismiss All
          </button>
          <button
            onClick={clearErrors}
            className="text-text-muted hover:text-accent-red transition-colors"
            title="Clear all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visibleErrors.map((error) => (
          <ErrorItem
            key={error.id}
            error={error}
            onDismiss={() => dismissError(error.id)}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <p className="text-xs text-text-muted text-center">
          +{hiddenCount} more notifications
        </p>
      )}
    </div>
  )
}

/**
 * Toast-style error notifications (shows briefly then auto-dismisses)
 */
export function ErrorToast() {
  const { errors, dismissError } = useErrorStore()

  // Get latest undismissed error
  const latestError = errors.find((e) => !e.dismissed)

  useEffect(() => {
    if (!latestError) return

    // Auto-dismiss after 5 seconds for non-critical errors
    if (latestError.severity !== 'critical') {
      const timer = setTimeout(() => {
        dismissError(latestError.id)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [latestError, dismissError])

  if (!latestError) {
    return null
  }

  const severityBg = {
    critical: 'bg-accent-red',
    error: 'bg-accent-red/90',
    warning: 'bg-accent-yellow/90 text-background',
    info: 'bg-accent-blue/90',
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg text-white animate-in slide-in-from-bottom-4',
        severityBg[latestError.severity]
      )}
    >
      <div className="flex items-start gap-3">
        <SeverityIcon severity={latestError.severity} className="text-white mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-sm">{latestError.message}</p>
          <p className="text-xs opacity-80 mt-1">{latestError.code}</p>
        </div>
        <button
          onClick={() => dismissError(latestError.id)}
          className="text-white/80 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * Error badge for sidebar/header
 */
export function ErrorBadge({ className }: { className?: string }) {
  const { errors, unreadCount, markAllRead } = useErrorStore()

  const criticalCount = errors.filter(
    (e) => !e.dismissed && e.severity === 'critical'
  ).length

  if (unreadCount === 0) {
    return null
  }

  return (
    <button
      onClick={markAllRead}
      className={cn(
        'relative flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-colors',
        criticalCount > 0
          ? 'bg-accent-red text-white animate-pulse'
          : 'bg-accent-yellow text-background',
        className
      )}
      title={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
    >
      {unreadCount > 9 ? '9+' : unreadCount}
    </button>
  )
}
