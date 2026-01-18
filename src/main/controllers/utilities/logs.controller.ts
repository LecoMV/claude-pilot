/**
 * Logs Controller
 *
 * Type-safe tRPC controller for log management.
 * Handles log retrieval, streaming, and filtering.
 *
 * Migrated from handlers.ts (3 handlers):
 * - logs:recent
 * - logs:stream
 * - logs:stopStream
 *
 * @module logs.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { existsSync, readdirSync, readFileSync, watch, FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { spawnAsync } from '../../utils/spawn-async'
import type { LogEntry, LogLevel } from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// ============================================================================
// Schemas
// ============================================================================

const RecentLogsSchema = z.object({
  limit: z.number().min(1).max(1000).default(200),
})

const StreamLogsSchema = z.object({
  sources: z.array(z.enum(['claude', 'mcp', 'system', 'agent', 'workflow', 'all'])),
})

// ============================================================================
// Log Stream Manager
// ============================================================================

class LogStreamManager {
  private mainWindow: BrowserWindow | null = null
  private journalProcess: ChildProcess | null = null
  private fileWatchers: Map<string, FSWatcher> = new Map()
  private active = false

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  start(sources: string[]): boolean {
    if (this.active) return true

    this.active = true

    // Start journalctl streaming for system logs
    if (sources.includes('system') || sources.includes('all')) {
      this.startJournalStream()
    }

    // Start watching Claude session files
    if (sources.includes('claude') || sources.includes('all')) {
      this.watchClaudeLogs()
    }

    return true
  }

  stop(): boolean {
    this.active = false

    if (this.journalProcess) {
      this.journalProcess.kill()
      this.journalProcess = null
    }

    this.fileWatchers.forEach((watcher) => {
      watcher.close()
    })
    this.fileWatchers.clear()

    return true
  }

  private startJournalStream(): void {
    this.journalProcess = spawn('journalctl', ['--no-pager', '-f', '-o', 'short-iso'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.journalProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        const entry = this.parseJournalLine(line)
        if (entry) {
          this.emit(entry)
        }
      }
    })

    this.journalProcess.on('error', (err) => {
      console.error('[LogStream] Journal process error:', err)
    })
  }

  private watchClaudeLogs(): void {
    const projectsDir = join(CLAUDE_DIR, 'projects')
    if (!existsSync(projectsDir)) return

    try {
      const entries = readdirSync(projectsDir, { withFileTypes: true })
      for (const entry of entries.slice(0, 5)) {
        if (!entry.isDirectory()) continue

        const projectDir = join(projectsDir, entry.name)
        const sessionFiles = readdirSync(projectDir)
          .filter((f) => f.endsWith('.jsonl'))
          .slice(-2)

        for (const sessionFile of sessionFiles) {
          const sessionPath = join(projectDir, sessionFile)
          this.watchFile(sessionPath, 'claude')
        }
      }
    } catch {
      // Ignore errors
    }
  }

  private watchFile(filePath: string, source: string): void {
    if (this.fileWatchers.has(filePath)) return

    try {
      const watcher = watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.emit({
            id: this.generateLogId(),
            timestamp: Date.now(),
            source: source as LogEntry['source'],
            level: 'info',
            message: `File changed: ${filePath}`,
          })
        }
      })

      this.fileWatchers.set(filePath, watcher)
    } catch {
      // Ignore watch errors
    }
  }

  private parseJournalLine(line: string): LogEntry | null {
    const match = line.match(/^(\S+)\s+\S+\s+(\S+)\[\d+\]:\s*(.*)$/)
    if (!match) return null

    const [, timestamp, , message] = match
    return {
      id: this.generateLogId(),
      timestamp: new Date(timestamp).getTime() || Date.now(),
      source: 'system',
      level: this.parseLogLevel(message),
      message: message.slice(0, 500),
    }
  }

  private parseLogLevel(line: string): LogLevel {
    const lower = line.toLowerCase()
    if (lower.includes('error') || lower.includes('failed') || lower.includes('exception'))
      return 'error'
    if (lower.includes('warn') || lower.includes('warning')) return 'warn'
    if (lower.includes('debug')) return 'debug'
    return 'info'
  }

  private generateLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }

  private emit(entry: LogEntry): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('logs:entry', entry)
    }
  }
}

// Singleton instance
const logStreamManager = new LogStreamManager()

// ============================================================================
// Helper Functions
// ============================================================================

function generateLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parseLogLevel(line: string): LogLevel {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception'))
    return 'error'
  if (lower.includes('warn') || lower.includes('warning')) return 'warn'
  if (lower.includes('debug')) return 'debug'
  return 'info'
}

async function getRecentLogs(limit = 200): Promise<LogEntry[]> {
  const logs: LogEntry[] = []
  const logCount = Math.floor(limit / 4)

  // Read from journalctl for system logs
  try {
    const sysLogs = await spawnAsync(
      'journalctl',
      ['--no-pager', '-n', String(logCount), '-o', 'short-iso'],
      { timeout: 5000 }
    )

    for (const line of sysLogs.trim().split('\n').slice(-logCount)) {
      if (!line.trim()) continue
      const match = line.match(/^(\S+)\s+\S+\s+(\S+)\[\d+\]:\s*(.*)$/)
      if (match) {
        const [, timestamp, , message] = match
        logs.push({
          id: generateLogId(),
          timestamp: new Date(timestamp).getTime() || Date.now(),
          source: 'system',
          level: parseLogLevel(message),
          message: message.slice(0, 500),
        })
      }
    }
  } catch {
    // Ignore journalctl errors
  }

  // Read Claude Code logs from recent session transcripts
  const projectsDir = join(CLAUDE_DIR, 'projects')
  if (existsSync(projectsDir)) {
    try {
      const entries = readdirSync(projectsDir, { withFileTypes: true })
      for (const entry of entries.slice(0, 3)) {
        if (!entry.isDirectory()) continue
        const projectDir = join(projectsDir, entry.name)
        const sessionFiles = readdirSync(projectDir)
          .filter((f) => f.endsWith('.jsonl'))
          .slice(-2)

        for (const sessionFile of sessionFiles) {
          const sessionPath = join(projectDir, sessionFile)
          try {
            const content = readFileSync(sessionPath, 'utf-8')
            const lines = content.trim().split('\n').slice(-20)

            for (const line of lines) {
              try {
                const entry = JSON.parse(line)
                if (entry.type === 'message' || entry.role) {
                  logs.push({
                    id: generateLogId(),
                    timestamp: new Date(entry.timestamp || Date.now()).getTime(),
                    source: 'claude',
                    level: 'info',
                    message: `[${entry.role || 'assistant'}] ${(entry.content || '').slice(0, 200)}...`,
                    metadata: { sessionId: sessionFile.replace('.jsonl', ''), model: entry.model },
                  })
                }
                if (entry.type === 'tool_use' || entry.tool) {
                  logs.push({
                    id: generateLogId(),
                    timestamp: new Date(entry.timestamp || Date.now()).getTime(),
                    source: 'agent',
                    level: 'info',
                    message: `Tool: ${entry.tool || entry.name || 'unknown'}`,
                    metadata: entry.input || entry.args,
                  })
                }
              } catch {
                // Skip invalid JSON
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Ignore directory errors
    }
  }

  // Read MCP server logs
  try {
    const mcpLogs = await spawnAsync(
      'journalctl',
      ['--user', '-u', 'mcp-*', '--no-pager', '-n', '20', '-o', 'short-iso'],
      { timeout: 3000 }
    )

    for (const line of mcpLogs.trim().split('\n').slice(-20)) {
      if (!line.trim()) continue
      const match = line.match(/^(\S+)\s+\S+\s+(\S+).*:\s*(.*)$/)
      if (match) {
        const [, timestamp, unit, message] = match
        logs.push({
          id: generateLogId(),
          timestamp: new Date(timestamp).getTime() || Date.now(),
          source: 'mcp',
          level: parseLogLevel(message),
          message: `[${unit}] ${message.slice(0, 300)}`,
        })
      }
    }
  } catch {
    // MCP logs not available
  }

  // Sort by timestamp and limit
  return logs.sort((a, b) => a.timestamp - b.timestamp).slice(-limit)
}

// ============================================================================
// Router
// ============================================================================

export const logsRouter = router({
  /**
   * Get recent logs
   */
  recent: publicProcedure
    .input(RecentLogsSchema.optional())
    .query(({ input }): Promise<LogEntry[]> => {
      return getRecentLogs(input?.limit ?? 200)
    }),

  /**
   * Start log streaming
   */
  stream: auditedProcedure.input(StreamLogsSchema).mutation(({ input }): boolean => {
    return logStreamManager.start(input.sources)
  }),

  /**
   * Stop log streaming
   */
  stopStream: auditedProcedure.mutation((): boolean => {
    return logStreamManager.stop()
  }),
})

// Export for setup
export { logStreamManager }
