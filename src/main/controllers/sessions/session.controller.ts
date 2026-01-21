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
import { existsSync, statSync, watch, FSWatcher } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { glob } from 'glob'
import { BrowserWindow } from 'electron'
import { findClaudeProcesses, getChildren, getProcessCwd } from '../../utils/process-utils'
import type {
  ExternalSession,
  SessionMessage,
  SessionStats,
  SessionProcessInfo,
} from '../../../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// Track already-warned large files to avoid log spam
const skippedFilesWarned = new Set<string>()

// ============================================================================
// Session Cache
// ============================================================================

interface CachedSession {
  session: ExternalSession
  mtime: number
}

class SessionCache {
  private cache = new Map<string, CachedSession>()
  private lastFullScan = 0
  private readonly CACHE_TTL = 10000 // 10 seconds between full scans

  shouldRefresh(): boolean {
    return Date.now() - this.lastFullScan > this.CACHE_TTL
  }

  markScanned(): void {
    this.lastFullScan = Date.now()
  }

  get(filePath: string, currentMtime: number): ExternalSession | null {
    const cached = this.cache.get(filePath)
    if (cached && cached.mtime === currentMtime) {
      return cached.session
    }
    return null
  }

  set(filePath: string, session: ExternalSession, mtime: number): void {
    this.cache.set(filePath, { session, mtime })
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath)
  }

  clear(): void {
    this.cache.clear()
    this.lastFullScan = 0
  }
}

const sessionCache = new SessionCache()

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

  private async handleSessionUpdate(filePath: string): Promise<void> {
    try {
      // Invalidate cache for this file
      sessionCache.invalidate(filePath)
      const session = await parseSessionFile(filePath)
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
 * Decode a project folder name to an actual filesystem path.
 * The folder name "-home-deploy-projects-claude-command-center" encodes
 * "/home/deploy/projects/claude-command-center", but since dashes in
 * directory names can't be distinguished from path separators, we need
 * to try different interpretations and check which one exists.
 */
function decodeProjectPath(encoded: string): string {
  // Remove leading dash and split by dash
  const parts = encoded.replace(/^-/, '').split('-')

  // Try simple interpretation first (all dashes are slashes)
  const simplePath = '/' + parts.join('/')
  if (existsSync(simplePath)) return simplePath

  // Dynamic programming approach: try all possible segmentations
  // Build paths incrementally, checking at each step if the path exists
  function findValidPath(remainingParts: string[], basePath: string): string | null {
    if (remainingParts.length === 0) {
      return existsSync(basePath) ? basePath : null
    }

    // Try combining 1, 2, 3, ... parts as the next segment
    for (let segLen = 1; segLen <= remainingParts.length; segLen++) {
      const segment = remainingParts.slice(0, segLen).join('-')
      const newPath = basePath + '/' + segment
      const remaining = remainingParts.slice(segLen)

      // Check if this path exists and recurse
      if (existsSync(newPath)) {
        if (remaining.length === 0) {
          return newPath // Found complete valid path
        }

        // Try to complete the path with remaining parts
        const result = findValidPath(remaining, newPath)
        if (result) return result
      }
    }

    return null
  }

  // Start from root
  const result = findValidPath(parts, '')
  if (result) return result

  // Fallback: return simple interpretation (directory might have been deleted)
  return '/' + parts.join('/')
}

/**
 * Parse a single JSONL session file (async with cache support)
 */
async function parseSessionFile(filePath: string): Promise<ExternalSession | null> {
  try {
    if (!existsSync(filePath)) return null

    // Check cache first
    const stat = statSync(filePath)
    const cached = sessionCache.get(filePath, stat.mtimeMs)
    if (cached) {
      return cached
    }

    // Skip files larger than 50MB to prevent memory issues
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (stat.size > MAX_FILE_SIZE) {
      // Only warn once per file, and not during tests
      if (!process.env.VITEST && !skippedFilesWarned.has(filePath)) {
        skippedFilesWarned.add(filePath)
        console.warn(
          `Skipping large session file (${Math.round(stat.size / 1024 / 1024)}MB): ${filePath}`
        )
      }
      return null
    }

    const content = await readFile(filePath, 'utf-8')
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
    // The folder name like "-home-deploy-projects-claude-command-center" encodes
    // the path "/home/deploy/projects/claude-command-center". Since dashes in
    // directory names are indistinguishable from path separators, we try to
    // reconstruct the actual path by checking what exists on the filesystem.
    const projectsDir = join(CLAUDE_DIR, 'projects')
    const relativePath = filePath.replace(projectsDir + '/', '')
    const projectDir = relativePath.split('/')[0]
    const projectPath = decodeProjectPath(projectDir)
    const projectName = projectPath.split('/').pop() || projectDir

    // Extract session ID from filename
    const fileName = filePath.split('/').pop() || ''
    const sessionId = fileName.replace('.jsonl', '')

    // Check if session is active (file modified in last 5 minutes)
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

    // Cache the session
    sessionCache.set(filePath, session, stat.mtimeMs)

    return session
  } catch (error) {
    console.error('Failed to parse session file:', error)
    return null
  }
}

/**
 * Discover all external sessions (with caching and parallel processing)
 */
async function discoverExternalSessions(): Promise<ExternalSession[]> {
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) return []

  try {
    const files = await glob('**/*.jsonl', {
      cwd: projectsDir,
      ignore: '**/subagents/**',
      absolute: true,
    })

    // Limit to 100 files
    const limitedFiles = files.slice(0, 100)

    // Parse files in parallel (with concurrency limit to avoid overwhelming I/O)
    const BATCH_SIZE = 10
    const sessions: ExternalSession[] = []

    for (let i = 0; i < limitedFiles.length; i += BATCH_SIZE) {
      const batch = limitedFiles.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(batch.map((filePath) => parseSessionFile(filePath)))
      for (const session of results) {
        if (session) {
          sessions.push(session)
        }
      }
    }

    // Mark cache as scanned
    sessionCache.markScanned()

    // Sort by last activity (most recent first)
    sessions.sort((a, b) => b.lastActivity - a.lastActivity)

    return sessions
  } catch (error) {
    console.error('Failed to discover sessions:', error)
    return []
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

    const content = await readFile(filePath, 'utf-8')
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

      // Skip if not an actual Claude CLI process
      // The main Claude CLI process has proc.name === 'claude' (from /proc/pid/comm)
      // Exclude electron, esbuild, chrome, and other helper processes
      const isClaudeCli =
        proc.name === 'claude' ||
        (args[0] === 'claude' && args.includes('--settings')) ||
        (args[0] === 'claude' && args.includes('--permission-mode'))

      if (!isClaudeCli) continue

      // Also skip non-main processes
      const mainCmd = args[0] || ''
      if (mainCmd.includes('conmon') || mainCmd.includes('podman')) continue

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

      // Detect launch mode (--resume or --continue both mean resuming a session)
      const launchMode: 'new' | 'resume' =
        args.includes('--resume') || args.includes('--continue') ? 'resume' : 'new'

      // Detect permission mode
      const permIdx = args.indexOf('--permission-mode')
      const permissionMode = permIdx >= 0 ? args[permIdx + 1] : undefined

      // Get working directory - try /proc/pid/cwd first, then --project arg
      let cwd = getProcessCwd(proc.pid)
      if (!cwd) {
        // Fallback: extract from --project argument
        const projectIdx = args.indexOf('--project')
        if (projectIdx >= 0 && args[projectIdx + 1]) {
          cwd = args[projectIdx + 1]
        }
      }

      // Extract model from --model argument (for future use)
      let _model: string | undefined
      const modelIdx = args.indexOf('--model')
      if (modelIdx >= 0 && args[modelIdx + 1]) {
        _model = args[modelIdx + 1]
      }

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
        if (childCmd.includes('memory-keeper')) mcpServers.push('memory-keeper')
        if (childCmd.includes('beads')) mcpServers.push('beads')
        if (childCmd.includes('sequential-thinking')) mcpServers.push('sequential-thinking')
      }

      processes.push({
        pid: proc.pid,
        tty: proc.tty || 'background',
        cwd: cwd || undefined,
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
  // Use projectPath (derived from folder name) since workingDirectory (from JSONL cwd field)
  // is often not populated. projectPath is like "/home/deploy/projects/my-project"
  const sessionPath = session.projectPath || session.workingDirectory
  if (!sessionPath) return undefined

  // Normalize paths for comparison
  const normalizePath = (p: string) => p.replace(/\/+$/, '').toLowerCase()
  const normalizedSessionPath = normalizePath(sessionPath)

  for (const proc of processes) {
    // Skip processes without cwd
    if (!proc.cwd) continue

    const normalizedProcCwd = normalizePath(proc.cwd)

    // Check for exact match only - paths must be the same
    // We need strict matching to avoid false positives like /home/deploy matching
    // all sessions under /home/deploy/projects/*
    if (normalizedSessionPath === normalizedProcCwd) {
      return {
        pid: proc.pid,
        cwd: proc.cwd,
        profile: proc.profile,
        terminal: proc.tty,
        launchMode: proc.launchMode,
        permissionMode: proc.permissionMode,
        wrapper: proc.wrapper,
        activeMcpServers: proc.activeMcpServers,
      }
    }
  }

  // Secondary match: try to match by project name in the path
  const sessionProjectName = session.projectName?.toLowerCase()
  if (sessionProjectName) {
    for (const proc of processes) {
      if (proc.cwd && proc.cwd.toLowerCase().includes(sessionProjectName)) {
        return {
          pid: proc.pid,
          cwd: proc.cwd,
          profile: proc.profile,
          terminal: proc.tty,
          launchMode: proc.launchMode,
          permissionMode: proc.permissionMode,
          wrapper: proc.wrapper,
          activeMcpServers: proc.activeMcpServers,
        }
      }
    }
  }

  return undefined
}

/**
 * Get active sessions with process info
 * Only returns sessions that have a matching running Claude process
 */
async function getActiveSessions(): Promise<ExternalSession[]> {
  const sessions = await discoverExternalSessions()
  const processes = detectActiveClaudeProcesses()

  // Only return sessions that have a matching running process
  // Dedupe by projectPath - keep only the most recent session per project
  const sessionsByProject = new Map<string, ExternalSession>()

  for (const session of sessions) {
    const processInfo = matchSessionToProcess(session, processes)
    if (processInfo) {
      const projectKey = session.projectPath || session.projectName
      const existing = sessionsByProject.get(projectKey)

      // Keep the session with the most recent activity
      if (!existing || session.lastActivity > existing.lastActivity) {
        session.processInfo = processInfo
        session.isActive = true // Confirmed active via process detection
        sessionsByProject.set(projectKey, session)
      }
    }
  }

  return Array.from(sessionsByProject.values())
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

  /**
   * Detect ghost sessions - sessions without active processes that are stale
   * Ghost sessions are candidates for cleanup
   */
  detectGhosts: publicProcedure
    .input(
      z
        .object({
          staleThresholdDays: z.number().int().positive().default(7),
        })
        .optional()
    )
    .query(async ({ input }): Promise<GhostSessionInfo[]> => {
      const staleThresholdMs = (input?.staleThresholdDays ?? 7) * 24 * 60 * 60 * 1000
      const now = Date.now()

      const allSessions = await discoverExternalSessions()
      const activeSessions = await getActiveSessions()
      const activeIds = new Set(activeSessions.map((s) => s.id))

      const ghosts: GhostSessionInfo[] = []

      for (const session of allSessions) {
        // Skip if session has an active process
        if (activeIds.has(session.id)) continue

        const age = now - session.lastActivity
        const isStale = age > staleThresholdMs

        ghosts.push({
          session,
          isStale,
          daysSinceActivity: Math.floor(age / (24 * 60 * 60 * 1000)),
          sizeBytes: session.stats?.inputTokens
            ? (session.stats.inputTokens + session.stats.outputTokens) * 4
            : 0, // Rough estimate
          recommendation: isStale ? 'delete' : 'review',
        })
      }

      // Sort by staleness (oldest first)
      ghosts.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)

      return ghosts
    }),
})

// ============================================================================
// Types
// ============================================================================

interface GhostSessionInfo {
  session: ExternalSession
  isStale: boolean
  daysSinceActivity: number
  sizeBytes: number
  recommendation: 'delete' | 'review'
}

export type SessionRouter = typeof sessionRouter
