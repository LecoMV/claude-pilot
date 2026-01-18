/**
 * Log Stream Manager Service
 * Handles real-time log streaming from journalctl and Claude session files
 * Extracted from handlers.ts during Phase 3 legacy cleanup
 */

import { BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, readFileSync, watch, FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { LogEntry } from '@shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

export class LogStreamManager {
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

    // Watch Claude session files for changes
    if (sources.includes('claude') || sources.includes('all')) {
      this.watchClaudeLogs()
    }

    return true
  }

  stop(): boolean {
    this.active = false

    // Stop journalctl process
    if (this.journalProcess) {
      this.journalProcess.kill()
      this.journalProcess = null
    }

    // Stop file watchers
    for (const watcher of this.fileWatchers.values()) {
      watcher.close()
    }
    this.fileWatchers.clear()

    return true
  }

  private startJournalStream(): void {
    try {
      // Stream journalctl in follow mode
      this.journalProcess = spawn('journalctl', ['-f', '-n', '0', '-o', 'json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.journalProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data
          .toString()
          .split('\n')
          .filter((l) => l.trim())
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            const logEntry: LogEntry = {
              id: `journal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: entry.__REALTIME_TIMESTAMP
                ? parseInt(entry.__REALTIME_TIMESTAMP) / 1000
                : Date.now(),
              source: 'system',
              level: this.mapPriority(entry.PRIORITY),
              message: entry.MESSAGE || '',
              metadata: {
                unit: entry._SYSTEMD_UNIT,
                pid: entry._PID,
              },
            }
            this.emitLog(logEntry)
          } catch {
            // Skip invalid JSON
          }
        }
      })

      this.journalProcess.on('error', (err) => {
        console.error('Journal stream error:', err)
      })
    } catch (error) {
      console.error('Failed to start journal stream:', error)
    }
  }

  private watchClaudeLogs(): void {
    const projectsDir = join(CLAUDE_DIR, 'projects')
    if (!existsSync(projectsDir)) return

    try {
      // Watch the projects directory for new session files
      const watcher = watch(projectsDir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl') && eventType === 'change') {
          this.readLatestLogEntry(join(projectsDir, filename))
        }
      })
      this.fileWatchers.set('projects', watcher)
    } catch (error) {
      console.error('Failed to watch Claude logs:', error)
    }
  }

  private readLatestLogEntry(filepath: string): void {
    try {
      const content = readFileSync(filepath, 'utf-8')
      const lines = content.trim().split('\n')
      if (lines.length === 0) return

      const lastLine = lines[lines.length - 1]
      const entry = JSON.parse(lastLine)

      const logEntry: LogEntry = {
        id: `claude-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
        source: 'claude',
        level: entry.type === 'error' ? 'error' : 'info',
        message: entry.content || entry.message || JSON.stringify(entry).slice(0, 200),
        metadata: {
          type: entry.type,
          role: entry.role,
          model: entry.model,
        },
      }
      this.emitLog(logEntry)
    } catch {
      // Skip files that can't be read
    }
  }

  private mapPriority(priority: string | number): 'debug' | 'info' | 'warn' | 'error' {
    const p = typeof priority === 'string' ? parseInt(priority) : priority
    if (p <= 3) return 'error'
    if (p <= 4) return 'warn'
    if (p <= 6) return 'info'
    return 'debug'
  }

  private emitLog(entry: LogEntry): void {
    if (this.mainWindow && this.active) {
      this.mainWindow.webContents.send('logs:stream', entry)
    }
  }
}

export const logStreamManager = new LogStreamManager()
