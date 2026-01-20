/**
 * Diagnostics Controller
 *
 * Comprehensive system diagnostics for monitoring app health, errors, and performance.
 * Provides real-time visibility into everything happening in Claude Pilot.
 *
 * @module diagnostics.controller
 */

import { z } from 'zod'
import { router, publicProcedure } from '../../trpc/trpc'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as os from 'os'

// ============================================================================
// Types
// ============================================================================

interface ErrorLogEntry {
  timestamp: string
  level: string
  code: string
  message: string
  operation?: string
  component?: string
  stack?: string
}

interface SystemMetrics {
  uptime: number
  memory: {
    total: number
    used: number
    free: number
    percentUsed: number
  }
  cpu: {
    model: string
    cores: number
    loadAvg: number[]
  }
  process: {
    memoryUsage: NodeJS.MemoryUsage
    uptime: number
    pid: number
    version: string
  }
}

interface DiagnosticsReport {
  timestamp: string
  errors: ErrorLogEntry[]
  warnings: ErrorLogEntry[]
  systemMetrics: SystemMetrics
  recentActivity: ActivityItem[]
  healthChecks: HealthCheck[]
}

interface ActivityItem {
  timestamp: string
  type: string
  message: string
  source?: string
}

interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  message?: string
  lastChecked: string
}

// ============================================================================
// Config
// ============================================================================

const CONFIG_DIR = join(homedir(), '.config', 'claude-pilot')
const LOGS_DIR = join(CONFIG_DIR, 'logs')
const AUDIT_DIR = join(CONFIG_DIR, 'audit')
const SENTRY_DIR = join(CONFIG_DIR, 'sentry')

// ============================================================================
// Schemas
// ============================================================================

const ErrorLogQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  level: z.enum(['error', 'warning', 'all']).default('all'),
  since: z.string().optional(), // ISO date string
})

const DiagnosticsReportSchema = z.object({
  includeStack: z.boolean().default(false),
  errorLimit: z.number().int().min(1).max(100).default(50),
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse error log lines into structured entries
 */
function parseErrorLogLine(line: string): ErrorLogEntry | null {
  // Format: [timestamp] [LEVEL] [code] [CODE] message | operation: X | component: Y
  const match = line.match(/^\[([^\]]+)\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)$/)
  if (!match) return null

  const [, timestamp, level, , code, rest] = match
  const parts = rest.split(' | ')
  const message = parts[0]

  let operation: string | undefined
  let component: string | undefined

  for (const part of parts.slice(1)) {
    if (part.startsWith('operation:')) {
      operation = part.replace('operation:', '').trim()
    } else if (part.startsWith('component:')) {
      component = part.replace('component:', '').trim()
    }
  }

  return {
    timestamp,
    level: level.toLowerCase(),
    code,
    message,
    operation,
    component,
  }
}

/**
 * Get system metrics
 */
function getSystemMetrics(): SystemMetrics {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  return {
    uptime: os.uptime(),
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percentUsed: Math.round((usedMem / totalMem) * 100),
    },
    cpu: {
      model: os.cpus()[0]?.model || 'Unknown',
      cores: os.cpus().length,
      loadAvg: os.loadavg(),
    },
    process: {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid,
      version: process.version,
    },
  }
}

/**
 * Read and parse error log files
 */
async function readErrorLogs(
  limit: number,
  level: 'error' | 'warning' | 'all',
  since?: string
): Promise<{ errors: ErrorLogEntry[]; warnings: ErrorLogEntry[] }> {
  const errors: ErrorLogEntry[] = []
  const warnings: ErrorLogEntry[] = []

  if (!existsSync(LOGS_DIR)) {
    return { errors, warnings }
  }

  try {
    const files = await readdir(LOGS_DIR)
    const errorFiles = files
      .filter((f) => f.startsWith('errors-') && f.endsWith('.log'))
      .sort()
      .reverse() // Most recent first

    const sinceDate = since ? new Date(since) : null

    for (const file of errorFiles) {
      if (errors.length >= limit && warnings.length >= limit) break

      const filePath = join(LOGS_DIR, file)
      const content = await readFile(filePath, 'utf-8')
      const lines = content.trim().split('\n').reverse() // Most recent first

      for (const line of lines) {
        if (errors.length >= limit && warnings.length >= limit) break
        if (!line.trim()) continue

        // Check if this is a continuation line (stack trace)
        if (line.startsWith('    at ') || line.startsWith('AppError:')) {
          // Append to previous entry's stack
          const lastEntry = errors.length > 0 ? errors[errors.length - 1] : null
          if (lastEntry) {
            lastEntry.stack = (lastEntry.stack || '') + '\n' + line
          }
          continue
        }

        const entry = parseErrorLogLine(line)
        if (!entry) continue

        // Filter by date
        if (sinceDate && new Date(entry.timestamp) < sinceDate) continue

        // Filter by level and add to appropriate array
        if (entry.level === 'error' && (level === 'error' || level === 'all')) {
          if (errors.length < limit) errors.push(entry)
        } else if (entry.level === 'warning' && (level === 'warning' || level === 'all')) {
          if (warnings.length < limit) warnings.push(entry)
        }
      }
    }
  } catch (err) {
    console.error('Failed to read error logs:', err)
  }

  return { errors, warnings }
}

/**
 * Get recent activity from Sentry breadcrumbs
 */
async function getRecentActivity(limit: number): Promise<ActivityItem[]> {
  const activity: ActivityItem[] = []
  const scopeFile = join(SENTRY_DIR, 'scope_v3.json')

  if (!existsSync(scopeFile)) {
    return activity
  }

  try {
    const content = await readFile(scopeFile, 'utf-8')
    const data = JSON.parse(content)
    const breadcrumbs = data.scope?.breadcrumbs || []

    for (const crumb of breadcrumbs.slice(-limit).reverse()) {
      activity.push({
        timestamp: new Date(crumb.timestamp * 1000).toISOString(),
        type: crumb.category || crumb.type || 'unknown',
        message: crumb.message || JSON.stringify(crumb.data),
        source: crumb.data?.logger,
      })
    }
  } catch (err) {
    console.error('Failed to read Sentry breadcrumbs:', err)
  }

  return activity
}

/**
 * Run health checks on critical services
 */
async function runHealthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = []
  const now = new Date().toISOString()

  // Check config directory
  checks.push({
    name: 'Config Directory',
    status: existsSync(CONFIG_DIR) ? 'healthy' : 'unhealthy',
    message: existsSync(CONFIG_DIR) ? 'Accessible' : 'Missing',
    lastChecked: now,
  })

  // Check logs directory
  checks.push({
    name: 'Logs Directory',
    status: existsSync(LOGS_DIR) ? 'healthy' : 'degraded',
    message: existsSync(LOGS_DIR) ? 'Accessible' : 'Missing (will be created)',
    lastChecked: now,
  })

  // Check audit database
  const auditDb = join(AUDIT_DIR, 'audit.db')
  checks.push({
    name: 'Audit Database',
    status: existsSync(auditDb) ? 'healthy' : 'degraded',
    message: existsSync(auditDb) ? 'Accessible' : 'Missing',
    lastChecked: now,
  })

  // Check process memory
  const memUsage = process.memoryUsage()
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)

  checks.push({
    name: 'Process Memory',
    status: heapPercent < 80 ? 'healthy' : heapPercent < 95 ? 'degraded' : 'unhealthy',
    message: `${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercent}%)`,
    lastChecked: now,
  })

  // Check external services via HTTP
  const httpChecks = [
    { name: 'Ollama', url: 'http://localhost:11434/api/tags' },
    { name: 'Qdrant', url: 'http://localhost:6333/collections' },
    { name: 'Memgraph', url: 'http://localhost:7687' },
  ]

  for (const { name, url } of httpChecks) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)

      const response = await fetch(url, {
        signal: controller.signal,
        method: name === 'Memgraph' ? 'GET' : 'GET',
      }).catch(() => null)

      clearTimeout(timeout)

      checks.push({
        name,
        status: response?.ok ? 'healthy' : 'unhealthy',
        message: response?.ok ? 'Responding' : 'Not responding',
        lastChecked: now,
      })
    } catch {
      checks.push({
        name,
        status: 'unhealthy',
        message: 'Connection failed',
        lastChecked: now,
      })
    }
  }

  return checks
}

// ============================================================================
// Router
// ============================================================================

export const diagnosticsRouter = router({
  /**
   * Get recent errors from log files
   */
  getErrors: publicProcedure
    .input(ErrorLogQuerySchema.optional())
    .query(async ({ input }): Promise<ErrorLogEntry[]> => {
      const { limit, level, since } = input || { limit: 100, level: 'all' as const }
      const { errors } = await readErrorLogs(limit, level, since)
      return errors
    }),

  /**
   * Get recent warnings from log files
   */
  getWarnings: publicProcedure
    .input(ErrorLogQuerySchema.optional())
    .query(async ({ input }): Promise<ErrorLogEntry[]> => {
      const { limit, since } = input || { limit: 100 }
      const { warnings } = await readErrorLogs(limit, 'warning', since)
      return warnings
    }),

  /**
   * Get current system metrics
   */
  getMetrics: publicProcedure.query((): SystemMetrics => {
    return getSystemMetrics()
  }),

  /**
   * Get recent activity from Sentry breadcrumbs
   */
  getActivity: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(({ input }): Promise<ActivityItem[]> => {
      return getRecentActivity(input?.limit || 50)
    }),

  /**
   * Run health checks on critical services
   */
  healthCheck: publicProcedure.query((): Promise<HealthCheck[]> => {
    return runHealthChecks()
  }),

  /**
   * Get full diagnostics report
   */
  getReport: publicProcedure
    .input(DiagnosticsReportSchema.optional())
    .query(async ({ input }): Promise<DiagnosticsReport> => {
      const { includeStack, errorLimit } = input || { includeStack: false, errorLimit: 50 }

      const [logData, activity, healthChecks] = await Promise.all([
        readErrorLogs(errorLimit, 'all'),
        getRecentActivity(50),
        runHealthChecks(),
      ])

      // Strip stack traces if not requested
      const errors = includeStack
        ? logData.errors
        : logData.errors.map(({ stack: _, ...rest }) => rest)
      const warnings = includeStack
        ? logData.warnings
        : logData.warnings.map(({ stack: _, ...rest }) => rest)

      return {
        timestamp: new Date().toISOString(),
        errors,
        warnings,
        systemMetrics: getSystemMetrics(),
        recentActivity: activity,
        healthChecks,
      }
    }),

  /**
   * Clear error logs (for debugging/testing)
   */
  clearLogs: publicProcedure.mutation(async (): Promise<boolean> => {
    // Only clear today's log to preserve history
    const today = new Date().toISOString().split('T')[0]
    const todayLog = join(LOGS_DIR, `errors-${today}.log`)

    if (existsSync(todayLog)) {
      const { writeFile } = await import('fs/promises')
      await writeFile(todayLog, '')
      return true
    }
    return false
  }),

  /**
   * Get error counts by category
   */
  getErrorSummary: publicProcedure.query(async (): Promise<Record<string, number>> => {
    const { errors } = await readErrorLogs(500, 'error')
    const summary: Record<string, number> = {}

    for (const error of errors) {
      const key = error.code || 'UNKNOWN'
      summary[key] = (summary[key] || 0) + 1
    }

    return summary
  }),
})
