/**
 * Session Controller - Session Discovery and Management
 *
 * Type-safe tRPC controller for managing Claude Code external sessions.
 * Discovers sessions from ~/.claude/projects/ JSONL files.
 *
 * Migrated from handlers.ts (5 handlers):
 * - sessions:discover - discover all sessions
 * - sessions:get - get session by ID
 * - sessions:getMessages - get messages with optional limit
 * - sessions:watch - enable/disable watching
 * - sessions:getActive - get active sessions
 *
 * @module session.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { existsSync, readFileSync, statSync, watch, FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { glob } from 'glob'
import { BrowserWindow } from 'electron'
import { findClaudeProcesses, getChildren } from '../../utils/process-utils'
import type {
  ExternalSession,
  SessionMessage,
  SessionStats,
  SessionProcessInfo,
} from '../../../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// ============================================================================
// Schemas
// ============================================================================

const SessionIdSchema = z.object({
  sessionId: z.string().min(1, 'Session ID cannot be empty'),
})

const GetMessagesSchema = z.object({
  sessionId: z.string().min(1, 'Session ID cannot be empty'),
  limit: z.number().int().positive().optional().default(100),
})

const WatchSchema = z.object({
  enable: z.boolean(),
})

// ============================================================================
// Session Watch Manager
// ============================================================================

class SessionWatchManager {
  private mainWindow: BrowserWindow | null = null
  private watcher: FSWatcher | null = null
  private active = false

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  start(): boolean {
    if (this.active) return true
    this.active = true

    const projectsDir = join(CLAUDE_DIR, 'projects')
    if (!existsSync(projectsDir)) return false

    try {
      this.watcher = watch(projectsDir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl') && !filename.includes('subagents')) {
          const filePath = join(projectsDir, filename)
          this.handleSessionUpdate(filePath)
        }
      })
      return true
    } catch (error) {
      console.error('Failed to start session watcher:', error)
      return false
    }
  }

  stop(): boolean {
    this.active = false
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    return true
  }

  private handleSessionUpdate(filePath: string): void {
    try {
      const session = parseSessionFile(filePath)
      if (session && this.mainWindow) {
        this.mainWindow.webContents.send('session:updated', session)
      }
    } catch {
      // Ignore parse errors
    }
  }
}

export const sessionWatchManager = new SessionWatchManager()

// ============================================================================
// Helper Functions
// ============================================================================

interface ClaudeProcessInfo {
  pid: number
  tty: string
  cwd?: string
  args: string[]
  profile: string
  launchMode: 'new' | 'resume'
  permissionMode?: string
  wrapper?: string
  activeMcpServers: string[]
}

/**
 * Parse a single JSONL session file
 */
function parseSessionFile(filePath: string): ExternalSession | null {
  try {
    if (!existsSync(filePath)) return null

    const content = readFileSync(filePath, 'utf-8')
    const lines = content
      .trim()
      .split('\n')
      .filter((l) => l.trim())

    if (lines.length === 0) return null

    // Parse first entry for session metadata
    let firstEntry: Record<string, unknown> | null = null
    let detectedModel: string | undefined

    const stats: SessionStats = {
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
    }

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        stats.messageCount++

        if (!firstEntry) {
          firstEntry = entry
        }

        const type = entry.type as string
        if (type === 'user' || (entry.message as Record<string, unknown>)?.role === 'user') {
          stats.userMessages++
        } else if (
          type === 'assistant' ||
          (entry.message as Record<string, unknown>)?.role === 'assistant'
        ) {
          stats.assistantMessages++
          // Try to detect model from assistant message
          const message = entry.message as Record<string, unknown> | undefined
          if (message?.model && !detectedModel) {
            detectedModel = message.model as string
          }
        } else if (type === 'tool_use' || type === 'tool-result') {
          stats.toolCalls++
        }

        // Extract token usage
        const message = entry.message as Record<string, unknown> | undefined
        if (message?.usage) {
          const usage = message.usage as Record<string, unknown>
          stats.inputTokens += (usage.input_tokens as number) || 0
          stats.outputTokens += (usage.output_tokens as number) || 0
          stats.cachedTokens += (usage.cache_read_input_tokens as number) || 0
          if (usage.service_tier && !stats.serviceTier) {
            stats.serviceTier = usage.service_tier as string
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (!firstEntry) return null

    // Extract project path from file path
    const projectsDir = join(CLAUDE_DIR, 'projects')
    const relativePath = filePath.replace(projectsDir + '/', '')
    const projectDir = relativePath.split('/')[0]
    const projectPath = projectDir.replace(/-/g, '/').replace(/^\//, '')
    const projectName = projectPath.split('/').pop() || projectDir

    // Extract session ID from filename
    const fileName = filePath.split('/').pop() || ''
    const sessionId = fileName.replace('.jsonl', '')

    // Check if session is active (file modified in last 5 minutes)
    const stat = statSync(filePath)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    const isActive = stat.mtimeMs > fiveMinutesAgo

    // Calculate estimated cost
    stats.estimatedCost = stats.inputTokens * 0.000003 + stats.outputTokens * 0.000015

    // Parse timestamps with validation
    const parseTimestamp = (ts: unknown, fallback: number): number => {
      if (!ts || typeof ts !== 'string') return fallback
      const parsed = new Date(ts).getTime()
      return isNaN(parsed) ? fallback : parsed
    }

    const lastActivity = stat.mtimeMs

    const session: ExternalSession = {
      id: sessionId,
      slug: firstEntry.slug as string | undefined,
      projectPath,
      projectName,
      filePath,
      startTime: parseTimestamp(firstEntry.timestamp, stat.birthtimeMs),
      lastActivity,
      isActive,
      model: detectedModel,
      version: firstEntry.version as string | undefined,
      gitBranch: firstEntry.gitBranch as string | undefined,
      stats,
      workingDirectory: firstEntry.cwd as string | undefined,
      userType: firstEntry.userType as string | undefined,
      isSubagent: (firstEntry.isSidechain as boolean) || false,
    }

    return session
  } catch (error) {
    console.error('Failed to parse session file:', error)
    return null
  }
}

/**
 * Discover all external sessions
 */
async function discoverExternalSessions(): Promise<ExternalSession[]> {
  const sessions: ExternalSession[] = []
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) return sessions

  try {
    const files = await glob('**/*.jsonl', {
      cwd: projectsDir,
      ignore: '**/subagents/**',
      absolute: true,
    })

    // Limit to 100 files
    const limitedFiles = files.slice(0, 100)

    for (const filePath of limitedFiles) {
      const session = parseSessionFile(filePath)
      if (session) {
        sessions.push(session)
      }
    }

    // Sort by last activity (most recent first)
    sessions.sort((a, b) => b.lastActivity - a.lastActivity)

    return sessions
  } catch (error) {
    console.error('Failed to discover sessions:', error)
    return sessions
  }
}

/**
 * Get messages from a session
 */
async function getSessionMessages(sessionId: string, limit = 100): Promise<SessionMessage[]> {
  const projectsDir = join(CLAUDE_DIR, 'projects')
  const messages: SessionMessage[] = []

  try {
    const files = await glob(`**/${sessionId}.jsonl`, {
      cwd: projectsDir,
      absolute: true,
    })

    const filePath = files[0]
    if (!filePath || !existsSync(filePath)) return messages

    const content = readFileSync(filePath, 'utf-8')
    const lines = content
      .trim()
      .split('\n')
      .filter((l) => l.trim())

    // Parse messages (take last N lines)
    const startIndex = Math.max(0, lines.length - limit)
    for (let i = startIndex; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]) as Record<string, unknown>
        const type = entry.type as SessionMessage['type']

        if (!['user', 'assistant', 'tool-result'].includes(type)) continue

        const message = entry.message as Record<string, unknown> | undefined

        // Extract content
        let messageContent: string | undefined
        const rawContent = message?.content ?? entry.content
        if (typeof rawContent === 'string') {
          messageContent = rawContent
        } else if (Array.isArray(rawContent)) {
          messageContent = rawContent
            .map((block: Record<string, unknown>) => {
              if (typeof block === 'string') return block
              if (block?.type === 'text' && block?.text) return block.text as string
              if (block?.type === 'tool_result' && block?.content) {
                return typeof block.content === 'string' ? block.content : '[Tool Result]'
              }
              if (block?.type === 'tool_use' && block?.name) {
                return `[Tool: ${block.name}]`
              }
              if (block?.type === 'thinking') {
                return '[Thinking...]'
              }
              return ''
            })
            .filter(Boolean)
            .join('\n')
        } else if (rawContent && typeof rawContent === 'object') {
          const obj = rawContent as Record<string, unknown>
          if (obj.text && typeof obj.text === 'string') {
            messageContent = obj.text
          } else {
            messageContent = JSON.stringify(rawContent)
          }
        }

        const sessionMessage: SessionMessage = {
          uuid: entry.uuid as string,
          parentUuid: entry.parentUuid as string | undefined,
          type,
          timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
          content: messageContent,
          model: message?.model as string | undefined,
          usage: message?.usage as SessionMessage['usage'],
        }

        // Handle tool results
        if (type === 'tool-result') {
          sessionMessage.toolName = entry.toolName as string
          sessionMessage.toolInput = entry.toolInput as Record<string, unknown>
          sessionMessage.toolOutput = entry.result as string
        }

        messages.push(sessionMessage)
      } catch {
        // Skip malformed entries
      }
    }

    return messages
  } catch (error) {
    console.error('Failed to get session messages:', error)
    return messages
  }
}

/**
 * Detect active Claude processes and extract their metadata
 */
function detectActiveClaudeProcesses(): ClaudeProcessInfo[] {
  const processes: ClaudeProcessInfo[] = []

  try {
    const claudeProcs = findClaudeProcesses()

    for (const proc of claudeProcs) {
      const cmdLine = proc.cmdline
      const args = cmdLine.split(/\s+/)

      // Skip if not a main claude process
      const mainCmd = args[0] || ''
      if (!mainCmd.includes('claude') || mainCmd.includes('conmon') || mainCmd.includes('podman'))
        continue

      // Determine profile from --settings path
      let profile = 'default'
      const settingsIdx = args.indexOf('--settings')
      if (settingsIdx >= 0 && args[settingsIdx + 1]) {
        const settingsPath = args[settingsIdx + 1]
        const profileMatch = settingsPath.match(/\.claude-profiles\/([^/]+)\//)
        if (profileMatch) {
          profile = profileMatch[1]
        }
      }

      // Detect wrapper from command
      let wrapper: string | undefined
      if (cmdLine.includes('claude+')) wrapper = 'claude+'
      else if (cmdLine.includes('claude-eng')) wrapper = 'claude-eng'
      else if (cmdLine.includes('claude-sec')) wrapper = 'claude-sec'

      // Detect launch mode
      const launchMode: 'new' | 'resume' = args.includes('--resume') ? 'resume' : 'new'

      // Detect permission mode
      const permIdx = args.indexOf('--permission-mode')
      const permissionMode = permIdx >= 0 ? args[permIdx + 1] : undefined

      // Detect active MCP servers by looking at child processes
      const mcpServers: string[] = []
      const childProcs = getChildren(proc.pid)
      for (const child of childProcs) {
        const childCmd = child.cmdline
        if (childCmd.includes('claude-flow')) mcpServers.push('claude-flow')
        if (childCmd.includes('mcp-server-postgres')) mcpServers.push('postgres')
        if (childCmd.includes('mcp-server-filesystem')) mcpServers.push('filesystem')
        if (childCmd.includes('context7')) mcpServers.push('context7')
        if (childCmd.includes('playwright')) mcpServers.push('playwright')
        if (childCmd.includes('--claude-in-chrome-mcp')) mcpServers.push('chrome')
      }

      processes.push({
        pid: proc.pid,
        tty: proc.tty || 'background',
        args,
        profile,
        launchMode,
        permissionMode,
        wrapper,
        activeMcpServers: [...new Set(mcpServers)],
      })
    }
  } catch {
    // Process detection failed
  }

  return processes
}

/**
 * Match a session to its running process by working directory
 */
function matchSessionToProcess(
  session: ExternalSession,
  processes: ClaudeProcessInfo[]
): SessionProcessInfo | undefined {
  const sessionCwd = session.workingDirectory
  if (!sessionCwd) return undefined

  for (const proc of processes) {
    if (session.projectPath && sessionCwd.includes(session.projectName)) {
      return {
        pid: proc.pid,
        profile: proc.profile,
        terminal: proc.tty,
        launchMode: proc.launchMode,
        permissionMode: proc.permissionMode,
        wrapper: proc.wrapper,
        activeMcpServers: proc.activeMcpServers,
      }
    }
  }

  // Fallback: if there's only one active process, match it to any active session
  if (processes.length === 1) {
    const proc = processes[0]
    return {
      pid: proc.pid,
      profile: proc.profile,
      terminal: proc.tty,
      launchMode: proc.launchMode,
      permissionMode: proc.permissionMode,
      wrapper: proc.wrapper,
      activeMcpServers: proc.activeMcpServers,
    }
  }

  return undefined
}

/**
 * Get active sessions with process info
 */
async function getActiveSessions(): Promise<ExternalSession[]> {
  const sessions = await discoverExternalSessions()
  const activeSessions = sessions.filter((s) => s.isActive)

  const processes = detectActiveClaudeProcesses()

  for (const session of activeSessions) {
    const processInfo = matchSessionToProcess(session, processes)
    if (processInfo) {
      session.processInfo = processInfo
    }
  }

  return activeSessions
}

// ============================================================================
// Router
// ============================================================================

export const sessionRouter = router({
  /**
   * Discover all external sessions
   */
  discover: publicProcedure.query((): Promise<ExternalSession[]> => {
    return discoverExternalSessions()
  }),

  /**
   * Get a session by ID
   */
  get: publicProcedure
    .input(SessionIdSchema)
    .query(async ({ input }): Promise<ExternalSession | null> => {
      const sessions = await discoverExternalSessions()
      return sessions.find((s) => s.id === input.sessionId) || null
    }),

  /**
   * Get messages from a session
   */
  getMessages: publicProcedure
    .input(GetMessagesSchema)
    .query(({ input }): Promise<SessionMessage[]> => {
      return getSessionMessages(input.sessionId, input.limit)
    }),

  /**
   * Enable/disable session watching
   */
  watch: auditedProcedure.input(WatchSchema).mutation(({ input }): boolean => {
    if (input.enable) {
      return sessionWatchManager.start()
    } else {
      return sessionWatchManager.stop()
    }
  }),

  /**
   * Get active sessions with process info
   */
  getActive: publicProcedure.query((): Promise<ExternalSession[]> => {
    return getActiveSessions()
  }),
})

export type SessionRouter = typeof sessionRouter
