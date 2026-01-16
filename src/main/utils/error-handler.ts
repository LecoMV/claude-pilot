// Centralized error handler for main process

import { app, dialog, BrowserWindow } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import {
  AppError,
  IPCError,
  FilesystemError,
  NetworkError,
  DatabaseError,
  ProcessError,
  isOperationalError,
  getErrorMessage,
} from '../../shared/errors'

/**
 * Error handler configuration
 */
interface ErrorHandlerConfig {
  logToFile: boolean
  logDir: string
  showDialogForCritical: boolean
  maxLogSizeBytes: number
}

const defaultConfig: ErrorHandlerConfig = {
  logToFile: true,
  logDir: join(app.getPath('userData'), 'logs'),
  showDialogForCritical: true,
  maxLogSizeBytes: 10 * 1024 * 1024, // 10MB
}

let config = { ...defaultConfig }
let errorBuffer: AppError[] = []
const MAX_BUFFER_SIZE = 100

/**
 * Configure the error handler
 */
export function configureErrorHandler(options: Partial<ErrorHandlerConfig>): void {
  config = { ...config, ...options }

  // Ensure log directory exists
  if (config.logToFile && !existsSync(config.logDir)) {
    mkdirSync(config.logDir, { recursive: true })
  }
}

/**
 * Get current error buffer for debugging
 */
export function getRecentErrors(): AppError[] {
  return [...errorBuffer]
}

/**
 * Clear error buffer
 */
export function clearErrorBuffer(): void {
  errorBuffer = []
}

/**
 * Format error for logging
 */
function formatError(error: AppError): string {
  const timestamp = new Date(error.timestamp).toISOString()
  const parts = [
    `[${timestamp}]`,
    `[${error.severity.toUpperCase()}]`,
    `[${error.category}]`,
    `[${error.code}]`,
    error.message,
  ]

  if (error.context.operation) {
    parts.push(`| operation: ${error.context.operation}`)
  }

  if (error.context.component) {
    parts.push(`| component: ${error.context.component}`)
  }

  if (error.context.metadata) {
    parts.push(`| metadata: ${JSON.stringify(error.context.metadata)}`)
  }

  if (error.stack) {
    parts.push(`\n${error.stack}`)
  }

  return parts.join(' ')
}

/**
 * Write error to log file
 */
function writeToLogFile(formattedError: string): void {
  if (!config.logToFile) return

  try {
    const logFile = join(config.logDir, `errors-${new Date().toISOString().split('T')[0]}.log`)
    appendFileSync(logFile, formattedError + '\n\n')
  } catch {
    // Silently fail - we don't want logging to cause more errors
    console.error('[ErrorHandler] Failed to write to log file')
  }
}

/**
 * Show error dialog for critical errors
 */
function showErrorDialog(error: AppError): void {
  if (!config.showDialogForCritical) return
  if (error.severity !== 'critical') return

  const win = BrowserWindow.getFocusedWindow()

  dialog.showMessageBox(win ?? undefined as unknown as BrowserWindow, {
    type: 'error',
    title: 'Critical Error',
    message: error.message,
    detail: `Error Code: ${error.code}\n\nPlease restart the application if issues persist.`,
    buttons: ['OK'],
  })
}

/**
 * Send error to renderer for display
 */
function notifyRenderer(error: AppError): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('error:occurred', {
        code: error.code,
        message: error.message,
        severity: error.severity,
        category: error.category,
        timestamp: error.timestamp,
      })
    }
  }
}

/**
 * Main error handling function
 */
export function handleError(error: unknown, context?: { component?: string; operation?: string }): AppError {
  // Convert to AppError if needed
  let appError: AppError

  if (error instanceof AppError) {
    appError = error
  } else {
    appError = new AppError(getErrorMessage(error), {
      context: {
        operation: context?.operation ?? 'unknown',
        component: context?.component,
      },
      cause: error instanceof Error ? error : undefined,
    })
  }

  // Add to buffer
  errorBuffer.push(appError)
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift()
  }

  // Format and log
  const formatted = formatError(appError)
  console.error(formatted)
  writeToLogFile(formatted)

  // Show dialog for critical errors
  if (appError.severity === 'critical') {
    showErrorDialog(appError)
  }

  // Notify renderer for non-info errors
  if (appError.severity !== 'info') {
    notifyRenderer(appError)
  }

  return appError
}

/**
 * Handle IPC errors specifically
 */
export function handleIPCError(
  channel: string,
  error: unknown,
  metadata?: Record<string, unknown>
): AppError {
  const ipcError = new IPCError(getErrorMessage(error), {
    channel,
    cause: error instanceof Error ? error : undefined,
    metadata,
  })

  return handleError(ipcError)
}

/**
 * Handle filesystem errors specifically
 */
export function handleFilesystemError(
  path: string,
  operation: 'read' | 'write' | 'delete' | 'stat' | 'list',
  error: unknown
): AppError {
  const fsError = new FilesystemError(getErrorMessage(error), {
    path,
    operation,
    cause: error instanceof Error ? error : undefined,
  })

  return handleError(fsError)
}

/**
 * Handle network errors specifically
 */
export function handleNetworkError(
  endpoint: string,
  error: unknown,
  statusCode?: number
): AppError {
  const netError = new NetworkError(getErrorMessage(error), {
    endpoint,
    statusCode,
    cause: error instanceof Error ? error : undefined,
  })

  return handleError(netError)
}

/**
 * Handle database errors specifically
 */
export function handleDatabaseError(
  database: 'postgresql' | 'memgraph' | 'qdrant' | 'sqlite',
  operation: string,
  error: unknown
): AppError {
  const dbError = new DatabaseError(getErrorMessage(error), {
    database,
    operation,
    cause: error instanceof Error ? error : undefined,
  })

  return handleError(dbError)
}

/**
 * Handle process/subprocess errors specifically
 */
export function handleProcessError(
  command: string,
  error: unknown,
  exitCode?: number
): AppError {
  const procError = new ProcessError(getErrorMessage(error), {
    command,
    exitCode,
    cause: error instanceof Error ? error : undefined,
  })

  return handleError(procError)
}

/**
 * Log a warning (non-critical issue)
 */
export function logWarning(message: string, context?: { component?: string; operation?: string; metadata?: Record<string, unknown> }): void {
  const warning = new AppError(message, {
    severity: 'warning',
    context: {
      operation: context?.operation ?? 'unknown',
      component: context?.component,
      metadata: context?.metadata,
    },
  })

  // Add to buffer
  errorBuffer.push(warning)
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift()
  }

  // Log but don't show dialog
  const formatted = formatError(warning)
  console.warn(formatted)
  writeToLogFile(formatted)
}

/**
 * Log info (for tracking operations)
 */
export function logInfo(message: string, context?: { component?: string; operation?: string; metadata?: Record<string, unknown> }): void {
  const info = new AppError(message, {
    severity: 'info',
    context: {
      operation: context?.operation ?? 'unknown',
      component: context?.component,
      metadata: context?.metadata,
    },
  })

  // Only write to file, don't pollute console
  const formatted = formatError(info)
  writeToLogFile(formatted)
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    handleError(error, { operation: 'uncaughtException' })

    // For programmer errors, exit
    if (!isOperationalError(error)) {
      console.error('[FATAL] Non-operational error - exiting')
      process.exit(1)
    }
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    handleError(reason, { operation: 'unhandledRejection' })
  })

  console.log('[ErrorHandler] Global error handlers configured')
}

/**
 * Graceful shutdown with error logging
 */
export function shutdownWithError(error: AppError): void {
  const formatted = formatError(error)
  console.error('[FATAL]', formatted)
  writeToLogFile(`[FATAL] ${formatted}`)

  app.quit()
}
