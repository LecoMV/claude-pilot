import { ReactNode } from 'react'
import { AlertTriangle, AlertCircle, AlertOctagon, Info, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Error codes for common error scenarios.
 * Format: [DOMAIN]-[CATEGORY]-[SPECIFIC]
 * Example: MCP-CONN-001 = MCP Connection error 001
 */
export const ErrorCodes = {
  // MCP Server Errors
  MCP_CONN_001: 'MCP-CONN-001', // Server connection failed
  MCP_CONN_002: 'MCP-CONN-002', // Server timeout
  MCP_CONF_001: 'MCP-CONF-001', // Invalid configuration
  MCP_CONF_002: 'MCP-CONF-002', // Missing required field
  MCP_TOOL_001: 'MCP-TOOL-001', // Tool execution failed

  // Session Errors
  SES_LOAD_001: 'SES-LOAD-001', // Failed to load sessions
  SES_LOAD_002: 'SES-LOAD-002', // Session file corrupted
  SES_TRANS_001: 'SES-TRANS-001', // Transcript parse error
  SES_TRANS_002: 'SES-TRANS-002', // Transcript file not found

  // Memory/Database Errors
  MEM_CONN_001: 'MEM-CONN-001', // PostgreSQL connection failed
  MEM_CONN_002: 'MEM-CONN-002', // Memgraph connection failed
  MEM_CONN_003: 'MEM-CONN-003', // Qdrant connection failed
  MEM_QUERY_001: 'MEM-QUERY-001', // Query execution failed
  MEM_QUERY_002: 'MEM-QUERY-002', // Invalid query syntax

  // System Errors
  SYS_PERM_001: 'SYS-PERM-001', // Permission denied
  SYS_FILE_001: 'SYS-FILE-001', // File not found
  SYS_FILE_002: 'SYS-FILE-002', // File read error
  SYS_FILE_003: 'SYS-FILE-003', // File write error
  SYS_PROC_001: 'SYS-PROC-001', // Process spawn failed
  SYS_NET_001: 'SYS-NET-001', // Network unavailable

  // Settings Errors
  SET_LOAD_001: 'SET-LOAD-001', // Settings load failed
  SET_SAVE_001: 'SET-SAVE-001', // Settings save failed
  SET_VAL_001: 'SET-VAL-001', // Invalid setting value

  // Agent/Workflow Errors
  AGT_SPAWN_001: 'AGT-SPAWN-001', // Agent spawn failed
  AGT_EXEC_001: 'AGT-EXEC-001', // Agent execution failed
  WFL_PARSE_001: 'WFL-PARSE-001', // Workflow parse error
  WFL_EXEC_001: 'WFL-EXEC-001', // Workflow execution failed

  // Authentication Errors
  AUTH_CRED_001: 'AUTH-CRED-001', // Invalid credentials
  AUTH_TOKEN_001: 'AUTH-TOKEN-001', // Token expired
  AUTH_PERM_001: 'AUTH-PERM-001', // Unauthorized access

  // Generic
  ERR_UNKNOWN: 'ERR-UNKNOWN', // Unknown error
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * Error severity levels
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info'

/**
 * Error display variants
 */
export type ErrorVariant = 'inline' | 'banner' | 'toast' | 'minimal'

interface ErrorMessageProps {
  /** Error message to display */
  message: string
  /** Optional error code */
  code?: ErrorCode | string
  /** Severity level */
  severity?: ErrorSeverity
  /** Display variant */
  variant?: ErrorVariant
  /** Additional details (expandable) */
  details?: string
  /** Retry action handler */
  onRetry?: () => void
  /** Dismiss handler */
  onDismiss?: () => void
  /** Custom action */
  action?: {
    label: string
    handler: () => void
  }
  /** Show icon */
  showIcon?: boolean
  /** Additional class names */
  className?: string
  /** Children to render (for wrapping content) */
  children?: ReactNode
}

/**
 * Get icon for severity level
 */
function SeverityIcon({
  severity,
  size = 'md',
}: {
  severity: ErrorSeverity
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }[size]

  switch (severity) {
    case 'critical':
      return <AlertOctagon className={cn(sizeClass, 'text-accent-red')} />
    case 'error':
      return <AlertTriangle className={cn(sizeClass, 'text-accent-red')} />
    case 'warning':
      return <AlertCircle className={cn(sizeClass, 'text-accent-yellow')} />
    case 'info':
      return <Info className={cn(sizeClass, 'text-accent-blue')} />
    default:
      return <AlertTriangle className={cn(sizeClass, 'text-text-muted')} />
  }
}

/**
 * ErrorMessage component for displaying errors throughout the app.
 *
 * Supports multiple variants:
 * - inline: Compact, for form fields and inline contexts
 * - banner: Full-width, for page-level errors
 * - toast: Fixed position, auto-dismissing (use ErrorToast from ErrorNotifications)
 * - minimal: Text only with icon, no background
 *
 * @example
 * // Inline error for form field
 * <ErrorMessage
 *   message="Invalid email format"
 *   code={ErrorCodes.SET_VAL_001}
 *   severity="error"
 *   variant="inline"
 * />
 *
 * @example
 * // Banner error with retry
 * <ErrorMessage
 *   message="Failed to connect to MCP server"
 *   code={ErrorCodes.MCP_CONN_001}
 *   severity="error"
 *   variant="banner"
 *   onRetry={handleRetry}
 * />
 */
export function ErrorMessage({
  message,
  code,
  severity = 'error',
  variant = 'inline',
  details,
  onRetry,
  onDismiss,
  action,
  showIcon = true,
  className,
}: ErrorMessageProps) {
  // Severity-based styling
  const severityStyles = {
    critical: {
      bg: 'bg-accent-red/10',
      border: 'border-accent-red/30',
      text: 'text-accent-red',
    },
    error: {
      bg: 'bg-accent-red/10',
      border: 'border-accent-red/20',
      text: 'text-accent-red',
    },
    warning: {
      bg: 'bg-accent-yellow/10',
      border: 'border-accent-yellow/20',
      text: 'text-accent-yellow',
    },
    info: {
      bg: 'bg-accent-blue/10',
      border: 'border-accent-blue/20',
      text: 'text-accent-blue',
    },
  }

  const styles = severityStyles[severity]

  // Minimal variant - just text and icon
  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {showIcon && <SeverityIcon severity={severity} size="sm" />}
        <span className={cn('text-sm', styles.text)}>{message}</span>
        {code && <span className="text-xs text-text-muted font-mono">({code})</span>}
      </div>
    )
  }

  // Inline variant - compact for form fields
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-start gap-2 p-2 rounded text-sm',
          styles.bg,
          styles.border,
          'border',
          className
        )}
        role="alert"
        aria-live="polite"
      >
        {showIcon && <SeverityIcon severity={severity} size="sm" />}
        <div className="flex-1 min-w-0">
          <p className="text-text-primary">{message}</p>
          {code && <p className="text-xs text-text-muted font-mono mt-0.5">{code}</p>}
          {details && <p className="text-xs text-text-muted mt-1">{details}</p>}
        </div>
        {(onRetry || action || onDismiss) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {onRetry && (
              <button
                onClick={onRetry}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Retry"
              >
                <RefreshCw className="w-4 h-4 text-text-muted hover:text-text-primary" />
              </button>
            )}
            {action && (
              <button
                onClick={action.handler}
                className="text-xs text-accent-purple hover:underline px-1"
              >
                {action.label}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4 text-text-muted hover:text-text-primary" />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Banner variant - full-width page errors
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg',
        styles.bg,
        styles.border,
        'border',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      {showIcon && <SeverityIcon severity={severity} size="md" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-text-primary">{getSeverityLabel(severity)}</h4>
          {code && <span className="text-xs font-mono text-text-muted">{code}</span>}
        </div>
        <p className="text-sm text-text-primary">{message}</p>
        {details && <p className="text-xs text-text-muted mt-2">{details}</p>}
        {(onRetry || action) && (
          <div className="flex items-center gap-3 mt-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-surface hover:bg-surface-hover rounded transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
            {action && (
              <button
                onClick={action.handler}
                className="text-sm text-accent-purple hover:underline"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
        </button>
      )}
    </div>
  )
}

/**
 * Get human-readable label for severity
 */
function getSeverityLabel(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical':
      return 'Critical Error'
    case 'error':
      return 'Error'
    case 'warning':
      return 'Warning'
    case 'info':
      return 'Information'
    default:
      return 'Error'
  }
}

// ============================================================================
// Pre-built Error Messages for Common Scenarios
// ============================================================================

/** Connection failed error */
export function ConnectionError({
  service,
  onRetry,
  className,
}: {
  service: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <ErrorMessage
      message={`Failed to connect to ${service}. Please check if the service is running.`}
      code={ErrorCodes.SYS_NET_001}
      severity="error"
      variant="banner"
      onRetry={onRetry}
      className={className}
    />
  )
}

/** Load failed error */
export function LoadError({
  resource,
  onRetry,
  className,
}: {
  resource: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <ErrorMessage
      message={`Failed to load ${resource}. Please try again.`}
      code={ErrorCodes.ERR_UNKNOWN}
      severity="error"
      variant="inline"
      onRetry={onRetry}
      className={className}
    />
  )
}

/** Permission denied error */
export function PermissionError({ action, className }: { action: string; className?: string }) {
  return (
    <ErrorMessage
      message={`Permission denied: Cannot ${action}. Check your access rights.`}
      code={ErrorCodes.SYS_PERM_001}
      severity="error"
      variant="inline"
      className={className}
    />
  )
}

/** Validation error (for form fields) */
export function ValidationError({ message, className }: { message: string; className?: string }) {
  return (
    <ErrorMessage
      message={message}
      code={ErrorCodes.SET_VAL_001}
      severity="warning"
      variant="minimal"
      className={className}
    />
  )
}

/** Network unavailable error */
export function NetworkError({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <ErrorMessage
      message="Network connection unavailable. Please check your internet connection."
      code={ErrorCodes.SYS_NET_001}
      severity="warning"
      variant="banner"
      onRetry={onRetry}
      className={className}
    />
  )
}

export default ErrorMessage
