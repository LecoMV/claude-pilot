// Enterprise-grade error handling types for Claude Pilot

/**
 * Error severity levels for categorization and handling
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info'

/**
 * Error categories for grouping and filtering
 */
export type ErrorCategory =
  | 'ipc'
  | 'filesystem'
  | 'network'
  | 'database'
  | 'process'
  | 'validation'
  | 'ui'
  | 'auth'
  | 'unknown'

/**
 * Structured error context for debugging
 */
export interface ErrorContext {
  operation: string
  component?: string
  userId?: string
  requestId?: string
  metadata?: Record<string, unknown>
}

/**
 * Base error class with enhanced context
 */
export class AppError extends Error {
  public readonly code: string
  public readonly severity: ErrorSeverity
  public readonly category: ErrorCategory
  public readonly context: ErrorContext
  public readonly timestamp: number
  public readonly isOperational: boolean

  constructor(
    message: string,
    options: {
      code?: string
      severity?: ErrorSeverity
      category?: ErrorCategory
      context: ErrorContext
      cause?: Error
      isOperational?: boolean
    }
  ) {
    super(message)
    this.name = 'AppError'
    this.code = options.code ?? 'ERR_UNKNOWN'
    this.severity = options.severity ?? 'error'
    this.category = options.category ?? 'unknown'
    this.context = options.context
    this.timestamp = Date.now()
    this.isOperational = options.isOperational ?? true
    this.cause = options.cause

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    }
  }
}

/**
 * IPC communication errors
 */
export class IPCError extends AppError {
  constructor(
    message: string,
    options: {
      channel: string
      cause?: Error
      metadata?: Record<string, unknown>
    }
  ) {
    super(message, {
      code: 'ERR_IPC',
      severity: 'error',
      category: 'ipc',
      context: {
        operation: `ipc:${options.channel}`,
        metadata: options.metadata,
      },
      cause: options.cause,
    })
    this.name = 'IPCError'
  }
}

/**
 * Filesystem operation errors
 */
export class FilesystemError extends AppError {
  constructor(
    message: string,
    options: {
      path: string
      operation: 'read' | 'write' | 'delete' | 'stat' | 'list'
      cause?: Error
    }
  ) {
    super(message, {
      code: 'ERR_FILESYSTEM',
      severity: 'error',
      category: 'filesystem',
      context: {
        operation: `fs:${options.operation}`,
        metadata: { path: options.path },
      },
      cause: options.cause,
    })
    this.name = 'FilesystemError'
  }
}

/**
 * Network/API errors
 */
export class NetworkError extends AppError {
  public readonly statusCode?: number
  public readonly endpoint?: string

  constructor(
    message: string,
    options: {
      endpoint: string
      statusCode?: number
      cause?: Error
    }
  ) {
    super(message, {
      code: 'ERR_NETWORK',
      severity: options.statusCode && options.statusCode >= 500 ? 'critical' : 'error',
      category: 'network',
      context: {
        operation: 'network:request',
        metadata: { endpoint: options.endpoint, statusCode: options.statusCode },
      },
      cause: options.cause,
    })
    this.name = 'NetworkError'
    this.statusCode = options.statusCode
    this.endpoint = options.endpoint
  }
}

/**
 * Database operation errors
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    options: {
      database: 'postgresql' | 'memgraph' | 'qdrant' | 'sqlite'
      operation: string
      cause?: Error
    }
  ) {
    super(message, {
      code: 'ERR_DATABASE',
      severity: 'error',
      category: 'database',
      context: {
        operation: `db:${options.database}:${options.operation}`,
        metadata: { database: options.database },
      },
      cause: options.cause,
    })
    this.name = 'DatabaseError'
  }
}

/**
 * Process/subprocess errors
 */
export class ProcessError extends AppError {
  public readonly exitCode?: number

  constructor(
    message: string,
    options: {
      command: string
      exitCode?: number
      cause?: Error
    }
  ) {
    super(message, {
      code: 'ERR_PROCESS',
      severity: options.exitCode === 0 ? 'warning' : 'error',
      category: 'process',
      context: {
        operation: 'process:spawn',
        metadata: { command: options.command, exitCode: options.exitCode },
      },
      cause: options.cause,
    })
    this.name = 'ProcessError'
    this.exitCode = options.exitCode
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends AppError {
  public readonly field?: string
  public readonly value?: unknown

  constructor(
    message: string,
    options: {
      field?: string
      value?: unknown
      operation: string
    }
  ) {
    super(message, {
      code: 'ERR_VALIDATION',
      severity: 'warning',
      category: 'validation',
      context: {
        operation: options.operation,
        metadata: { field: options.field },
      },
      isOperational: true,
    })
    this.name = 'ValidationError'
    this.field = options.field
    this.value = options.value
  }
}

/**
 * UI/React component errors
 */
export class UIError extends AppError {
  constructor(
    message: string,
    options: {
      component: string
      cause?: Error
    }
  ) {
    super(message, {
      code: 'ERR_UI',
      severity: 'error',
      category: 'ui',
      context: {
        operation: 'ui:render',
        component: options.component,
      },
      cause: options.cause,
    })
    this.name = 'UIError'
  }
}

/**
 * Service unavailable errors (for graceful degradation)
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string,
    options: {
      service: string
      fallback?: string
    }
  ) {
    super(message, {
      code: 'ERR_SERVICE_UNAVAILABLE',
      severity: 'warning',
      category: 'network',
      context: {
        operation: `service:${options.service}`,
        metadata: { fallback: options.fallback },
      },
      isOperational: true,
    })
    this.name = 'ServiceUnavailableError'
  }
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E }

/**
 * Helper to create success result
 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data }
}

/**
 * Helper to create error result
 */
export function err<E extends AppError>(error: E): Result<never, E> {
  return { success: false, error }
}

/**
 * Wrap an async operation with error handling
 */
export async function tryCatch<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<Result<T>> {
  try {
    const data = await operation()
    return ok(data)
  } catch (error) {
    return err(
      new AppError(error instanceof Error ? error.message : String(error), {
        context,
        cause: error instanceof Error ? error : undefined,
      })
    )
  }
}

/**
 * Check if an error is an operational error (expected, can be handled)
 */
export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}

/**
 * Extract error code safely
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code
  }
  return 'ERR_UNKNOWN'
}
