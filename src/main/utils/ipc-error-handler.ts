/**
 * IPC Error Handler Utility
 * Provides consistent error handling, logging, and audit integration for IPC handlers
 *
 * Usage:
 * Instead of:
 *   try { ... } catch (e) { console.error('Failed:', e); return false; }
 *
 * Use:
 *   return handleIPCError(
 *     async () => { ... },
 *     { channel: 'my:channel', operation: 'my operation' }
 *   )
 */

import { auditService, ActivityType, Severity, StatusCode, EventCategory } from '../services/audit'
import {
  AppError,
  DatabaseError,
  FilesystemError,
  IPCError,
  ProcessError,
  NetworkError,
  ValidationError,
  Result,
  ok,
  err,
  getErrorMessage,
} from '../../shared/errors'

/**
 * IPC handler context for error tracking
 */
interface IPCContext {
  channel: string
  operation: string
  component?: string
  metadata?: Record<string, unknown>
}

/**
 * Error response structure for IPC
 */
export interface IPCErrorResponse {
  success: false
  error: {
    code: string
    message: string
    severity: 'critical' | 'error' | 'warning' | 'info'
    category: string
  }
}

/**
 * Success response structure for IPC
 */
export interface IPCSuccessResponse<T> {
  success: true
  data: T
}

export type IPCResponse<T> = IPCSuccessResponse<T> | IPCErrorResponse

/**
 * Log level for console output
 */
type LogLevel = 'info' | 'warn' | 'error'

/**
 * Logger that prefixes messages with channel and timestamp
 */
function logWithContext(level: LogLevel, context: IPCContext, message: string, error?: unknown): void {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [IPC:${context.channel}]`

  switch (level) {
    case 'info':
      console.info(prefix, message)
      break
    case 'warn':
      console.warn(prefix, message, error instanceof Error ? error.message : error)
      break
    case 'error':
      console.error(prefix, message, error instanceof Error ? error.stack || error.message : error)
      break
    default: {
      // Exhaustive check - if this is reached, we have a bug
      const _exhaustive: never = level
      console.error(prefix, `Unknown log level: ${_exhaustive}`, message)
    }
  }
}

/**
 * Create an appropriate AppError subclass based on the original error
 */
function wrapError(error: unknown, context: IPCContext): AppError {
  const message = getErrorMessage(error)

  // Already an AppError, just return it
  if (error instanceof AppError) {
    return error
  }

  // Check for database errors
  if (error instanceof Error) {
    const errMsg = error.message.toLowerCase()

    // PostgreSQL errors
    if (
      errMsg.includes('connection') ||
      errMsg.includes('econnrefused') ||
      errMsg.includes('pg_') ||
      errMsg.includes('postgresql')
    ) {
      return new DatabaseError(message, {
        database: 'postgresql',
        operation: context.operation,
        cause: error,
      })
    }

    // Memgraph/Neo4j errors
    if (errMsg.includes('neo4j') || errMsg.includes('memgraph') || errMsg.includes('cypher')) {
      return new DatabaseError(message, {
        database: 'memgraph',
        operation: context.operation,
        cause: error,
      })
    }

    // Qdrant errors
    if (errMsg.includes('qdrant') || errMsg.includes('vector')) {
      return new DatabaseError(message, {
        database: 'qdrant',
        operation: context.operation,
        cause: error,
      })
    }

    // Filesystem errors
    if (
      errMsg.includes('enoent') ||
      errMsg.includes('eacces') ||
      errMsg.includes('eperm') ||
      errMsg.includes('file') ||
      errMsg.includes('directory')
    ) {
      return new FilesystemError(message, {
        path: context.metadata?.path as string ?? 'unknown',
        operation: 'read',
        cause: error,
      })
    }

    // Process errors
    if (errMsg.includes('spawn') || errMsg.includes('exec') || errMsg.includes('process')) {
      return new ProcessError(message, {
        command: context.metadata?.command as string ?? context.operation,
        cause: error,
      })
    }

    // Network errors
    if (
      errMsg.includes('fetch') ||
      errMsg.includes('http') ||
      errMsg.includes('request') ||
      errMsg.includes('timeout')
    ) {
      return new NetworkError(message, {
        endpoint: context.metadata?.endpoint as string ?? 'unknown',
        cause: error,
      })
    }

    // Validation errors
    if (errMsg.includes('invalid') || errMsg.includes('validation') || errMsg.includes('required')) {
      return new ValidationError(message, {
        operation: context.operation,
        field: context.metadata?.field as string,
      })
    }
  }

  // Default to IPCError
  return new IPCError(message, {
    channel: context.channel,
    cause: error instanceof Error ? error : undefined,
    metadata: context.metadata,
  })
}

/**
 * Log error to audit service
 */
function auditError(error: AppError, context: IPCContext): void {
  const severityMap: Record<string, Severity> = {
    critical: Severity.CRITICAL,
    error: Severity.HIGH,
    warning: Severity.MEDIUM,
    info: Severity.LOW,
  }

  auditService.log({
    category: EventCategory.APPLICATION,
    activity: ActivityType.ERROR,
    message: `IPC error: ${context.channel} - ${error.message}`,
    severity: severityMap[error.severity] ?? Severity.HIGH,
    status: StatusCode.FAILURE,
    statusDetail: error.code,
    targetType: 'ipc',
    targetName: context.channel,
    targetData: {
      operation: context.operation,
      errorCode: error.code,
      errorCategory: error.category,
    },
    rawData: error.toJSON(),
  })
}

/**
 * Handle IPC errors with proper logging and audit trail
 *
 * @param operation - The async operation to execute
 * @param context - Context for error tracking
 * @returns Result with typed error
 */
export async function handleIPCError<T>(
  operation: () => Promise<T>,
  context: IPCContext
): Promise<Result<T>> {
  try {
    const data = await operation()
    return ok(data)
  } catch (error) {
    const appError = wrapError(error, context)

    // Log to console with full context
    logWithContext('error', context, `${context.operation} failed:`, appError)

    // Log to audit trail
    auditError(appError, context)

    return err(appError)
  }
}

/**
 * Handle IPC errors and return IPC-friendly response format
 *
 * @param operation - The async operation to execute
 * @param context - Context for error tracking
 * @param defaultValue - Optional default value to return on error
 * @returns IPCResponse with success/error structure
 */
export async function handleIPCResponse<T>(
  operation: () => Promise<T>,
  context: IPCContext,
  defaultValue?: T
): Promise<IPCResponse<T>> {
  const result = await handleIPCError(operation, context)

  if (result.success) {
    return { success: true, data: result.data }
  }

  // If defaultValue provided, return it with success but log warning
  if (defaultValue !== undefined) {
    logWithContext('warn', context, `Using default value after error`, result.error)
    return { success: true, data: defaultValue }
  }

  return {
    success: false,
    error: {
      code: result.error.code,
      message: result.error.message,
      severity: result.error.severity,
      category: result.error.category,
    },
  }
}

/**
 * Wrap an IPC handler with error handling
 * Returns the raw value on success, or the default value on error
 *
 * This is a drop-in replacement for the current pattern:
 *   try { return await something() } catch (e) { console.error(...); return false }
 *
 * Usage:
 *   return wrapIPCHandler(
 *     () => doSomething(),
 *     { channel: 'my:channel', operation: 'do something' },
 *     false // default value on error
 *   )
 */
export async function wrapIPCHandler<T>(
  operation: () => Promise<T>,
  context: IPCContext,
  defaultValue: T
): Promise<T> {
  const result = await handleIPCError(operation, context)

  if (result.success) {
    return result.data
  }

  return defaultValue
}

/**
 * Wrap a sync IPC handler with error handling
 */
export function wrapIPCHandlerSync<T>(
  operation: () => T,
  context: IPCContext,
  defaultValue: T
): T {
  try {
    return operation()
  } catch (error) {
    const appError = wrapError(error, context)
    logWithContext('error', context, `${context.operation} failed:`, appError)
    auditError(appError, context)
    return defaultValue
  }
}

/**
 * Create a context object for IPC handlers
 */
export function createIPCContext(
  channel: string,
  operation: string,
  metadata?: Record<string, unknown>
): IPCContext {
  return { channel, operation, metadata }
}
