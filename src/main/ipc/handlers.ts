import { ipcMain, BrowserWindow, type WebContents, shell, dialog, app } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { spawn, ChildProcess } from 'child_process'
import { cpus, totalmem, freemem } from 'os'
import { spawnAsync, commandExists } from '../utils/spawn-async'
import { findClaudeProcesses, getChildren } from '../utils/process-utils'
import QdrantService from '../services/memory/qdrant.service'
import { glob } from 'glob'
import { memgraphService } from '../services/memgraph'
import { postgresService } from '../services/postgresql'
import { credentialService } from '../services/credentials'
import { auditService } from '../services/audit'
import { mcpProxyService } from '../services/mcp-proxy'
import { observabilityService } from '../services/observability'
import { treeSitterService } from '../services/treesitter'
import { wrapIPCHandler, createIPCContext } from '../utils/ipc-error-handler'
import { watchdogService } from '../services/watchdog'
import { predictiveContextService } from '../services/predictive-context'
import { planService } from '../services/plans'
import { branchService } from '../services/branches'
import { transcriptService, type ParseOptions, type TranscriptStats } from '../services/transcript'
import { workerPool } from '../services/workers'
import { messagePortStreamer } from '../services/streaming'
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  watch,
  FSWatcher,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { ipcSchemas, validate } from '../../shared/validation'
import type {
  SystemStatus,
  ResourceUsage,
  GPUUsage,
  ClaudeProject,
  MCPServer,
  Learning,
  ProfileSettings,
  ClaudeRule,
  ClaudeCodeProfile,
  TokenUsage,
  CompactionSettings,
  SessionSummary,
  SystemdService,
  PodmanContainer,
  LogEntry,
  OllamaModel,
  OllamaRunningModel,
  OllamaStatus,
  Agent,
  AgentType,
  SwarmInfo,
  HiveMindInfo,
  AppSettings,
  BudgetSettings,
  ExternalSession,
  SessionStats,
  SessionMessage,
  SessionProcessInfo,
  Bead,
  BeadStats,
  BeadCreateParams,
  BeadUpdateParams,
  BeadListFilter,
  BeadStatus,
  BeadType,
  BeadPriority,
  PgVectorStatus,
  PgVectorCollection,
  PgVectorSearchResult,
  PgVectorIndexConfig,
  PgVectorAutoEmbedConfig,
  VectorIndexType,
  FilePrediction,
  FileAccessPattern,
  PredictiveContextStats,
  PredictiveContextConfig,
  Plan,
  PlanCreateParams,
  PlanExecutionStats,
  ConversationBranch,
  ConversationMessage,
  BranchTree,
  BranchDiff,
  BranchMergeParams,
  BranchCreateParams,
  BranchStats,
} from '../../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// Input sanitization functions to prevent shell injection
function sanitizeServiceName(name: string): string {
  // Systemd service names: alphanumeric, hyphens, dots, underscores, at-signs
  return name.replace(/[^a-zA-Z0-9._@-]/g, '')
}

function sanitizeContainerId(id: string): string {
  // Container IDs are hex strings or alphanumeric names
  return id.replace(/[^a-zA-Z0-9._-]/g, '')
}

function sanitizeModelName(model: string): string {
  // Ollama model names: alphanumeric, colons (for tags), hyphens, dots, underscores, forward slashes (for namespaces)
  return model.replace(/[^a-zA-Z0-9._:/-]/g, '')
}

// Simple cache for expensive operations with automatic cleanup
class DataCache {
  private cache: Map<string, { data: unknown; expiry: number }> = new Map()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(cleanupIntervalMs = 60000) {
    // Periodically clean up expired entries to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key)
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs })
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
  }

  clear(): void {
    this.cache.clear()
  }
}

const dataCache = new DataCache()

/**
 * Validate IPC handler input against schema
 * Throws ValidationError if invalid
 */
function validateInput<T>(channel: string, args: Record<string, unknown>): T {
  const schema = ipcSchemas[channel]
  if (!schema) {
    return args as T
  }
  return validate<T>(args, schema, channel)
}

/**
 * Helper to safely get validated args from handler parameters
 */
function getValidatedArgs<T>(channel: string, argValues: unknown[], argNames: string[]): T {
  const args: Record<string, unknown> = {}
  argNames.forEach((name, i) => {
    args[name] = argValues[i]
  })
  return validateInput<T>(channel, args)
}

// Log stream manager for real-time log streaming
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

export function registerIpcHandlers(): void {
  // System handlers
  ipcMain.handle('system:status', async (): Promise<SystemStatus> => {
    return {
      claude: await getClaudeStatus(),
      mcp: await getMCPStatus(),
      memory: await getMemoryStatus(),
      ollama: await getOllamaServiceStatus(),
      resources: await getResourceUsage(),
    }
  })

  ipcMain.handle('system:resources', (): Promise<ResourceUsage> => {
    return getResourceUsage()
  })

  // Claude handlers
  ipcMain.handle('claude:version', async (): Promise<string> => {
    try {
      const result = await spawnAsync('claude', ['--version'], { timeout: 2000 })
      return result.trim()
    } catch {
      return 'unknown'
    }
  })

  ipcMain.handle('claude:projects', (): ClaudeProject[] => {
    return getClaudeProjects()
  })

  // MCP handlers
  ipcMain.handle('mcp:list', (): MCPServer[] => {
    return getMCPServers()
  })

  ipcMain.handle('mcp:toggle', (_event, name: string, enabled: boolean): boolean => {
    return wrapIPCHandler(
      () => {
        // Try mcp.json first (primary MCP config location)
        const mcpJsonPath = join(CLAUDE_DIR, 'mcp.json')
        if (existsSync(mcpJsonPath)) {
          const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'))
          if (mcpConfig.mcpServers?.[name]) {
            mcpConfig.mcpServers[name].disabled = !enabled
            writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2))
            return true
          }
        }

        // Fallback to settings.json
        const settingsPath = join(CLAUDE_DIR, 'settings.json')
        if (existsSync(settingsPath)) {
          const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
          if (settings.mcpServers?.[name]) {
            settings.mcpServers[name].disabled = !enabled
            writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
            return true
          }
        }

        return false
      },
      createIPCContext('mcp:toggle', 'toggle MCP server', { name, enabled }),
      false
    )
  })

  ipcMain.handle('mcp:getServer', (_event, name: string): MCPServer | null => {
    const servers = getMCPServers()
    return servers.find((s) => s.name === name) || null
  })

  ipcMain.handle('mcp:reload', (): boolean => {
    // Claude Code auto-reloads settings, but we can signal a refresh
    return true
  })

  ipcMain.handle('mcp:getConfig', (): string => {
    return wrapIPCHandler(
      () => {
        const settingsPath = join(CLAUDE_DIR, 'settings.json')
        if (existsSync(settingsPath)) {
          return readFileSync(settingsPath, 'utf-8')
        }
        // Return default config structure if file doesn't exist
        return JSON.stringify({ mcpServers: {} }, null, 2)
      },
      createIPCContext('mcp:getConfig', 'read MCP configuration'),
      JSON.stringify({ mcpServers: {} }, null, 2)
    )
  })

  ipcMain.handle('mcp:saveConfig', (_event, content: string): boolean => {
    // Validate content length and type
    const validated = getValidatedArgs<{ content: string }>(
      'mcp:saveConfig',
      [content],
      ['content']
    )
    return wrapIPCHandler(
      () => {
        const settingsPath = join(CLAUDE_DIR, 'settings.json')
        // Validate JSON before saving
        JSON.parse(validated.content)
        // Ensure .claude directory exists
        if (!existsSync(CLAUDE_DIR)) {
          mkdirSync(CLAUDE_DIR, { recursive: true })
        }
        writeFileSync(settingsPath, validated.content, 'utf-8')
        return true
      },
      createIPCContext('mcp:saveConfig', 'save MCP configuration'),
      false
    )
  })

  // MCP Proxy/Federation handlers (deploy-zebp)
  ipcMain.handle(
    'mcp:proxy:init',
    async (
      _event,
      config?: {
        loadBalancing?: 'round-robin' | 'least-connections' | 'capability-based'
        healthCheckInterval?: number
        connectionTimeout?: number
        retryAttempts?: number
        cacheToolsFor?: number
      }
    ): Promise<void> => {
      await mcpProxyService.initialize(config)
    }
  )

  ipcMain.handle('mcp:proxy:servers', () => {
    return mcpProxyService.getServers()
  })

  ipcMain.handle('mcp:proxy:connect', (_event, serverId: string): Promise<boolean> => {
    return mcpProxyService.connectServer(serverId)
  })

  ipcMain.handle('mcp:proxy:connectAll', async (): Promise<void> => {
    await mcpProxyService.connectAll()
  })

  ipcMain.handle('mcp:proxy:disconnect', (_event, serverId: string): void => {
    const server = mcpProxyService.getServer(serverId)
    if (server) {
      mcpProxyService.unregisterServer(serverId)
    }
  })

  ipcMain.handle('mcp:proxy:tools', () => {
    return mcpProxyService.getAllTools()
  })

  ipcMain.handle('mcp:proxy:resources', () => {
    return mcpProxyService.getAllResources()
  })

  ipcMain.handle('mcp:proxy:prompts', () => {
    return mcpProxyService.getAllPrompts()
  })

  ipcMain.handle(
    'mcp:proxy:callTool',
    (
      _event,
      toolName: string,
      args: Record<string, unknown>
    ): Promise<{ content: unknown; isError?: boolean }> => {
      return mcpProxyService.callTool(toolName, args)
    }
  )

  ipcMain.handle('mcp:proxy:stats', () => {
    return mcpProxyService.getStats()
  })

  ipcMain.handle('mcp:proxy:config', () => {
    return mcpProxyService.getConfig()
  })

  ipcMain.handle(
    'mcp:proxy:updateConfig',
    (
      _event,
      config: Partial<{
        loadBalancing: 'round-robin' | 'least-connections' | 'capability-based'
        healthCheckInterval: number
        connectionTimeout: number
        retryAttempts: number
        cacheToolsFor: number
      }>
    ): void => {
      mcpProxyService.updateConfig(config)
    }
  )

  // Memory handlers
  ipcMain.handle('memory:learnings', (_event, query?: string, limit = 50): Learning[] => {
    return queryLearnings(query, limit)
  })

  ipcMain.handle(
    'memory:stats',
    (): Promise<{
      postgresql: { count: number }
      memgraph: { nodes: number; edges: number }
      qdrant: { vectors: number }
    }> => {
      return getMemoryStats()
    }
  )

  ipcMain.handle(
    'memory:graph',
    (
      _event,
      query?: string,
      limit = 100
    ): Promise<{
      nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
      edges: Array<{
        id: string
        source: string
        target: string
        type: string
        properties: Record<string, unknown>
      }>
    }> => {
      return queryMemgraphGraph(query, limit)
    }
  )

  // Qdrant memory browser
  ipcMain.handle(
    'memory:qdrant:browse',
    (
      _event,
      collection = 'mem0_memories',
      limit = 50,
      offset?: string
    ): Promise<{
      points: Array<{ id: string; payload: Record<string, unknown>; created_at?: string }>
      nextOffset: string | null
    }> => {
      return browseQdrantMemories(collection, limit, offset)
    }
  )

  // Qdrant semantic search
  ipcMain.handle(
    'memory:qdrant:search',
    (
      _event,
      query: string,
      collection = 'mem0_memories',
      limit = 20
    ): Promise<{
      results: Array<{ id: string; score: number; payload: Record<string, unknown> }>
    }> => {
      return searchQdrantMemories(query, collection, limit)
    }
  )

  // Memgraph keyword search
  ipcMain.handle(
    'memory:memgraph:search',
    (
      _event,
      keyword: string,
      nodeType?: string,
      limit = 50
    ): Promise<{
      results: Array<{
        id: string
        label: string
        type: string
        properties: Record<string, unknown>
        score?: number
      }>
    }> => {
      return searchMemgraphNodes(keyword, nodeType, limit)
    }
  )

  // Raw query mode - execute queries directly
  ipcMain.handle(
    'memory:raw',
    (
      _event,
      source: 'postgresql' | 'memgraph' | 'qdrant',
      query: string
    ): Promise<{
      success: boolean
      data: unknown
      error?: string
      executionTime: number
    }> => {
      // Validate input
      const validated = getValidatedArgs<{ source: string; query: string }>(
        'memory:raw',
        [source, query],
        ['source', 'query']
      )
      return executeRawQuery(
        validated.source as 'postgresql' | 'memgraph' | 'qdrant',
        validated.query
      )
    }
  )

  // Unified federated search across all memory sources with RRF merging
  ipcMain.handle(
    'memory:unified-search',
    (
      _event,
      query: string,
      limit = 20
    ): Promise<{
      results: Array<{
        id: string
        source: 'postgresql' | 'memgraph' | 'qdrant'
        title: string
        content: string
        score: number
        metadata: Record<string, unknown>
      }>
      stats: {
        postgresql: number
        memgraph: number
        qdrant: number
        totalTime: number
      }
    }> => {
      return unifiedSearch(query, limit)
    }
  )

  // Profile handlers
  ipcMain.handle('profile:settings', () => {
    return getProfileSettings()
  })

  ipcMain.handle('profile:saveSettings', (_event, settings: ProfileSettings) => {
    return saveProfileSettings(settings)
  })

  ipcMain.handle('profile:claudemd', () => {
    return getClaudeMd()
  })

  ipcMain.handle('profile:saveClaudemd', (_event, content: string) => {
    return saveClaudeMd(content)
  })

  ipcMain.handle('profile:rules', () => {
    return getRules()
  })

  ipcMain.handle('profile:toggleRule', (_event, name: string, enabled: boolean) => {
    return toggleRule(name, enabled)
  })

  ipcMain.handle('profile:saveRule', (_event, path: string, content: string): boolean => {
    try {
      // Validate path and content - prevents path traversal attacks
      const validated = getValidatedArgs<{ path: string; content: string }>(
        'profile:saveRule',
        [path, content],
        ['path', 'content']
      )
      writeFileSync(validated.path, validated.content, 'utf-8')
      return true
    } catch (error) {
      console.error('Failed to save rule:', error)
      return false
    }
  })

  // Custom Profiles handlers (claude-eng, claude-sec, etc.)
  ipcMain.handle('profiles:list', (): ClaudeCodeProfile[] => {
    return listProfiles()
  })

  ipcMain.handle('profiles:get', (_event, id: string): ClaudeCodeProfile | null => {
    return getProfile(id)
  })

  ipcMain.handle(
    'profiles:create',
    (
      _event,
      profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>
    ): ClaudeCodeProfile | null => {
      return createProfile(profile)
    }
  )

  ipcMain.handle(
    'profiles:update',
    (_event, id: string, updates: Partial<ClaudeCodeProfile>): boolean => {
      return updateProfile(id, updates)
    }
  )

  ipcMain.handle('profiles:delete', (_event, id: string): boolean => {
    return deleteProfile(id)
  })

  ipcMain.handle('profiles:activate', (_event, id: string): boolean => {
    return activateProfile(id)
  })

  ipcMain.handle('profiles:getActive', (): string | null => {
    return getActiveProfileId()
  })

  ipcMain.handle(
    'profiles:launch',
    (_event, id: string, projectPath?: string): { success: boolean; error?: string } => {
      return launchProfile(id, projectPath)
    }
  )

  // Context handlers
  ipcMain.handle('context:tokenUsage', (): TokenUsage => {
    return getTokenUsage()
  })

  ipcMain.handle('context:compactionSettings', (): CompactionSettings => {
    return getCompactionSettings()
  })

  ipcMain.handle('context:sessions', (): SessionSummary[] => {
    return getRecentSessions()
  })

  ipcMain.handle('context:compact', (): boolean => {
    return triggerCompaction()
  })

  ipcMain.handle('context:setAutoCompact', (_event, enabled: boolean): boolean => {
    return setAutoCompact(enabled)
  })

  // Services handlers
  ipcMain.handle('services:systemd', (): SystemdService[] => {
    return getSystemdServices()
  })

  ipcMain.handle('services:podman', (): PodmanContainer[] => {
    return getPodmanContainers()
  })

  ipcMain.handle(
    'services:systemdAction',
    (_event, name: string, action: 'start' | 'stop' | 'restart'): boolean => {
      // Validate service name and action type
      const validated = getValidatedArgs<{ name: string; action: string }>(
        'services:systemdAction',
        [name, action],
        ['name', 'action']
      )
      return systemdAction(validated.name, validated.action as 'start' | 'stop' | 'restart')
    }
  )

  ipcMain.handle(
    'services:podmanAction',
    (_event, id: string, action: 'start' | 'stop' | 'restart'): boolean => {
      // Validate container ID and action type
      const validated = getValidatedArgs<{ id: string; action: string }>(
        'services:podmanAction',
        [id, action],
        ['id', 'action']
      )
      return podmanAction(validated.id, validated.action as 'start' | 'stop' | 'restart')
    }
  )

  // Logs handlers
  ipcMain.handle('logs:recent', (_event, limit = 200): LogEntry[] => {
    return getRecentLogs(limit)
  })

  ipcMain.handle('logs:stream', (_event, sources: string[]): boolean => {
    return startLogStream(sources)
  })

  ipcMain.handle('logs:stopStream', (): boolean => {
    return stopLogStream()
  })

  // Ollama handlers
  ipcMain.handle('ollama:status', (): OllamaStatus => {
    return getOllamaStatus()
  })

  ipcMain.handle('ollama:list', (): OllamaModel[] => {
    return getOllamaModels()
  })

  ipcMain.handle('ollama:running', (): OllamaRunningModel[] => {
    return getRunningModels()
  })

  ipcMain.handle('ollama:pull', (_event, model: string): boolean => {
    // Validate model name
    const validated = getValidatedArgs<{ model: string }>('ollama:pull', [model], ['model'])
    return pullOllamaModel(validated.model)
  })

  ipcMain.handle('ollama:delete', (_event, model: string): boolean => {
    // Validate model name
    const validated = getValidatedArgs<{ model: string }>('ollama:delete', [model], ['model'])
    return deleteOllamaModel(validated.model)
  })

  ipcMain.handle('ollama:run', (_event, model: string): boolean => {
    // Validate model name
    const validated = getValidatedArgs<{ model: string }>('ollama:run', [model], ['model'])
    return runOllamaModel(validated.model)
  })

  ipcMain.handle('ollama:stop', (_event, model: string): boolean => {
    // Validate model name
    const validated = getValidatedArgs<{ model: string }>('ollama:stop', [model], ['model'])
    return stopOllamaModel(validated.model)
  })

  // Agent handlers
  ipcMain.handle('agents:list', (): Agent[] => {
    return getAgentList()
  })

  ipcMain.handle('agents:spawn', (_event, type: AgentType, name: string): Agent | null => {
    return spawnAgent(type, name)
  })

  ipcMain.handle('agents:terminate', (_event, id: string): boolean => {
    return terminateAgent(id)
  })

  ipcMain.handle('agents:swarmStatus', (): SwarmInfo | null => {
    return getSwarmStatus()
  })

  ipcMain.handle('agents:hiveMindStatus', (): HiveMindInfo | null => {
    return getHiveMindStatus()
  })

  ipcMain.handle('agents:initSwarm', (_event, topology: string): boolean => {
    return initSwarm(topology)
  })

  ipcMain.handle('agents:shutdownSwarm', (): boolean => {
    return shutdownSwarm()
  })

  // Chat handlers
  ipcMain.handle(
    'chat:send',
    (event, projectPath: string, message: string, messageId: string): boolean => {
      return sendChatMessage(event.sender, projectPath, message, messageId)
    }
  )

  // Settings handlers
  ipcMain.handle('settings:get', (): AppSettings => {
    return getAppSettings()
  })

  ipcMain.handle('settings:save', (_event, settings: AppSettings): boolean => {
    return saveAppSettings(settings)
  })

  ipcMain.handle('settings:setBudget', (_event, budget: BudgetSettings): boolean => {
    const settings = getAppSettings()
    settings.budget = budget
    return saveAppSettings(settings)
  })

  // ==================== Credential Handlers (DEPRECATED) ====================
  // @deprecated Use trpc.credentials.* instead - Sprint 1 migration
  // DELETE AFTER: Frontend migration to tRPC complete
  // Uses wrapIPCHandler for consistent error logging and audit trail
  ipcMain.handle('credentials:store', (_event, key: string, value: string): boolean => {
    return wrapIPCHandler(
      () => credentialService.set(key, value),
      createIPCContext('credentials:store', 'store credential', { key }),
      false
    )
  })

  ipcMain.handle('credentials:retrieve', (_event, key: string): string | null => {
    return wrapIPCHandler(
      () => credentialService.retrieve(key),
      createIPCContext('credentials:retrieve', 'retrieve credential', { key }),
      null
    )
  })

  ipcMain.handle('credentials:delete', (_event, key: string): boolean => {
    return wrapIPCHandler(
      () => {
        credentialService.delete(key)
        return true
      },
      createIPCContext('credentials:delete', 'delete credential', { key }),
      false
    )
  })

  ipcMain.handle('credentials:has', (_event, key: string): boolean => {
    return wrapIPCHandler(
      () => credentialService.has(key),
      createIPCContext('credentials:has', 'check credential exists', { key }),
      false
    )
  })

  ipcMain.handle('credentials:list', (): string[] => {
    return wrapIPCHandler(
      () => credentialService.listKeys(),
      createIPCContext('credentials:list', 'list credential keys'),
      []
    )
  })

  ipcMain.handle('credentials:isEncryptionAvailable', (): boolean => {
    return credentialService.isEncryptionAvailable()
  })

  // ==================== Audit Handlers (DEPRECATED) ====================
  // @deprecated Use trpc.audit.* instead - Sprint 1 migration
  // DELETE AFTER: Frontend migration to tRPC complete
  ipcMain.handle(
    'audit:query',
    (
      _event,
      params?: {
        startTime?: number
        endTime?: number
        category?: string
        activity?: number
        targetType?: string
        limit?: number
        offset?: number
      }
    ) => {
      return auditService.query(params as Parameters<typeof auditService.query>[0])
    }
  )

  ipcMain.handle('audit:stats', () => {
    return auditService.getStats()
  })

  ipcMain.handle(
    'audit:export',
    (
      _event,
      format: 'json' | 'csv',
      params?: {
        startTime?: number
        endTime?: number
      }
    ) => {
      if (format === 'csv') {
        return auditService.exportCSV(params)
      }
      return auditService.exportJSON(params)
    }
  )

  // ==================== SIEM Log Shipping Handlers (DEPRECATED) ====================
  // @deprecated Use trpc.audit.siem.* instead - Sprint 1 migration
  // DELETE AFTER: Frontend migration to tRPC complete
  ipcMain.handle(
    'audit:siem:register',
    (
      _event,
      endpoint: {
        id: string
        name: string
        type: 'webhook' | 'syslog' | 'http'
        url?: string
        host?: string
        port?: number
        protocol?: 'tcp' | 'udp'
        apiKey?: string
        enabled: boolean
        batchSize: number
        flushInterval: number
        retryAttempts: number
        retryDelay: number
      }
    ) => {
      auditService.registerEndpoint(endpoint)
    }
  )

  ipcMain.handle('audit:siem:unregister', (_event, endpointId: string) => {
    auditService.unregisterEndpoint(endpointId)
  })

  ipcMain.handle('audit:siem:setEnabled', (_event, endpointId: string, enabled: boolean) => {
    auditService.setEndpointEnabled(endpointId, enabled)
  })

  ipcMain.handle('audit:siem:getEndpoints', () => {
    return auditService.getEndpoints()
  })

  ipcMain.handle('audit:siem:getStats', (_event, endpointId?: string) => {
    const stats = auditService.getShipperStats(endpointId)
    if (stats instanceof Map) {
      return Object.fromEntries(stats)
    }
    return stats
  })

  ipcMain.handle('audit:siem:flush', async (_event, endpointId?: string): Promise<boolean> => {
    if (endpointId) {
      return auditService.flushToEndpoint(endpointId)
    }
    await auditService.flushAll()
    return true
  })

  // ==================== Watchdog Handlers (DEPRECATED) ====================
  // @deprecated Use trpc.watchdog.* instead - Sprint 1 migration
  // DELETE AFTER: Frontend migration to tRPC complete
  ipcMain.handle('watchdog:start', (): boolean => {
    try {
      watchdogService.start()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('watchdog:stop', (): boolean => {
    try {
      watchdogService.stop()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('watchdog:isEnabled', (): boolean => {
    return watchdogService.isEnabled()
  })

  ipcMain.handle('watchdog:getHealth', () => {
    return watchdogService.getHealth()
  })

  ipcMain.handle('watchdog:getServiceHealth', (_event, serviceId: string) => {
    return watchdogService.getServiceHealth(serviceId)
  })

  ipcMain.handle('watchdog:getRecoveryHistory', (_event, limit?: number) => {
    return watchdogService.getRecoveryHistory(limit)
  })

  ipcMain.handle('watchdog:forceCheck', (_event, serviceId: string) => {
    return watchdogService.forceCheck(serviceId)
  })

  ipcMain.handle('watchdog:forceRestart', (_event, serviceId: string) => {
    return watchdogService.forceRestart(serviceId)
  })

  // System helpers
  ipcMain.handle('system:getHomePath', (): string => {
    return HOME
  })

  // Shell operations
  ipcMain.handle('shell:openPath', (_event, path: string): string => {
    // Validate input - prevents path traversal attacks
    const validated = getValidatedArgs<{ path: string }>('shell:openPath', [path], ['path'])
    return shell.openPath(validated.path)
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<void> => {
    // Validate URL format
    const validated = getValidatedArgs<{ url: string }>('shell:openExternal', [url], ['url'])
    await shell.openExternal(validated.url)
  })

  // Dialog operations
  ipcMain.handle('dialog:openDirectory', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // Terminal at specific path - sends message to renderer to open terminal at path
  ipcMain.handle('terminal:openAt', (event, path: string): boolean => {
    try {
      // Validate path - prevents path traversal attacks
      const validated = getValidatedArgs<{ path: string }>('terminal:openAt', [path], ['path'])
      // Get the webContents that sent this message
      const webContents = event.sender
      // Send message back to renderer to navigate to terminal and set cwd
      webContents.send('terminal:setCwd', validated.path)
      return true
    } catch {
      return false
    }
  })
}

async function getClaudeStatus() {
  // Return cached data if available (30 second cache - version rarely changes)
  type ClaudeStatus = { online: boolean; version?: string; lastCheck: number }
  const cached = dataCache.get<ClaudeStatus>('claudeStatus')
  if (cached) return cached

  try {
    // Use commandExists from spawn-async (no shell)
    const exists = await commandExists('claude')
    if (!exists) {
      const status = { online: false, lastCheck: Date.now() }
      dataCache.set('claudeStatus', status, 5000)
      return status
    }

    const version = await spawnAsync('claude', ['--version'], { timeout: 2000 })
    const status = { online: true, version: version.trim(), lastCheck: Date.now() }
    dataCache.set('claudeStatus', status, 30000) // 30s cache
    return status
  } catch {
    const status = { online: false, lastCheck: Date.now() }
    dataCache.set('claudeStatus', status, 5000) // 5s cache for offline
    return status
  }
}

async function getMCPStatus() {
  const servers = await getMCPServers()
  return {
    servers,
    totalActive: servers.filter((s) => s.status === 'online').length,
    totalDisabled: servers.filter((s) => s.config.disabled).length,
  }
}

async function getMemoryStatus() {
  // Return cached data if available (10 second cache)
  type MemStatus = {
    postgresql: { online: boolean }
    memgraph: { online: boolean }
    qdrant: { online: boolean }
  }
  const cached = dataCache.get<MemStatus>('memoryStatus')
  if (cached) return cached

  // Check all services in parallel using native clients (no shell commands)
  const [pgOnline, mgOnline, qdrantOnline] = await Promise.all([
    // PostgreSQL - use native pg driver
    postgresService.isConnected().catch(() => false),

    // Memgraph - use native neo4j driver
    memgraphService.isConnected().catch(() => false),

    // Qdrant - use native client
    QdrantService.getInstance()
      .healthCheck()
      .catch(() => false),
  ])

  const status = {
    postgresql: { online: pgOnline },
    memgraph: { online: mgOnline },
    qdrant: { online: qdrantOnline },
  }
  dataCache.set('memoryStatus', status, 10000) // 10s cache
  return status
}

async function getOllamaServiceStatus() {
  // Return cached data if available (10 second cache)
  const cached = dataCache.get<{ online: boolean; modelCount: number; runningModels: number }>(
    'ollamaStatus'
  )
  if (cached) return cached

  try {
    // Use native fetch instead of curl (no shell)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const [tagsResponse, psResponse] = await Promise.all([
      fetch('http://localhost:11434/api/tags', { signal: controller.signal }),
      fetch('http://localhost:11434/api/ps', { signal: controller.signal }).catch(() => null),
    ])

    clearTimeout(timeout)

    if (!tagsResponse.ok) {
      throw new Error('Ollama not responding')
    }

    const tagsData = (await tagsResponse.json()) as { models?: unknown[] }
    const modelCount = tagsData.models?.length || 0

    let runningModels = 0
    if (psResponse?.ok) {
      const psData = (await psResponse.json()) as { models?: unknown[] }
      runningModels = psData.models?.length || 0
    }

    const status = {
      online: true,
      modelCount,
      runningModels,
    }
    dataCache.set('ollamaStatus', status, 10000) // 10s cache
    return status
  } catch {
    const status = {
      online: false,
      modelCount: 0,
      runningModels: 0,
    }
    dataCache.set('ollamaStatus', status, 5000) // 5s cache for offline
    return status
  }
}

async function getResourceUsage(): Promise<ResourceUsage> {
  // Return cached data if available (5 second cache)
  const cached = dataCache.get<ResourceUsage>('resourceUsage')
  if (cached) return cached

  // Get CPU usage from Node.js os module (no shell command needed)
  let cpu = 0
  const cpuInfo = cpus()
  if (cpuInfo.length > 0) {
    const totalIdle = cpuInfo.reduce((acc, c) => acc + c.times.idle, 0)
    const totalTick = cpuInfo.reduce(
      (acc, c) => acc + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
      0
    )
    cpu = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0
  }

  // Get memory usage from Node.js os module (no shell command needed)
  const totalMem = totalmem()
  const freeMem = freemem()
  const memory = ((totalMem - freeMem) / totalMem) * 100

  // Get disk usage using spawnAsync (no shell pipes)
  const disk = { used: 0, total: 0, claudeData: 0 }
  try {
    const dfOutput = await spawnAsync('df', ['-B1', '/'], { timeout: 1000 })
    const lines = dfOutput.trim().split('\n')
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/)
      if (parts.length >= 4) {
        disk.total = parseInt(parts[1]) || 0
        disk.used = parseInt(parts[2]) || 0
      }
    }

    // Get Claude data size (cache for 30 seconds - expensive operation)
    const cachedClaudeData = dataCache.get<number>('claudeDataSize')
    if (cachedClaudeData !== null) {
      disk.claudeData = cachedClaudeData
    } else if (existsSync(CLAUDE_DIR)) {
      try {
        const duOutput = await spawnAsync('du', ['-sb', CLAUDE_DIR], { timeout: 5000 })
        disk.claudeData = parseInt(duOutput.split('\t')[0]) || 0
        dataCache.set('claudeDataSize', disk.claudeData, 30000) // 30s cache
      } catch {
        // Ignore du errors
      }
    }
  } catch {
    // Ignore disk errors
  }

  // Get GPU usage
  const gpu = await getGPUUsage()

  const result = { cpu, memory, disk, gpu }
  dataCache.set('resourceUsage', result, 5000) // 5s cache
  return result
}

// Get GPU usage with fallback for when nvidia-smi fails
async function getGPUUsage(): Promise<GPUUsage> {
  // Return cached data if available (5 second cache)
  const cached = dataCache.get<GPUUsage>('gpuUsage')
  if (cached) return cached

  const gpuInfo: GPUUsage = { available: false }

  // First try nvidia-smi using spawnAsync (no shell)
  try {
    const nvidiaSmi = await spawnAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,driver_version',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 3000 }
    )
    const parts = nvidiaSmi.trim().split(', ')
    if (parts.length >= 6) {
      gpuInfo.available = true
      gpuInfo.name = parts[0].trim()
      gpuInfo.memoryUsed = parseInt(parts[1]) * 1024 * 1024 // MiB to bytes
      gpuInfo.memoryTotal = parseInt(parts[2]) * 1024 * 1024 // MiB to bytes
      gpuInfo.utilization = parseInt(parts[3])
      gpuInfo.temperature = parseInt(parts[4])
      gpuInfo.driverVersion = parts[5].trim()
      dataCache.set('gpuUsage', gpuInfo, 5000) // 5s cache
      return gpuInfo
    }
  } catch (err) {
    // nvidia-smi failed - try fallback methods
    const errorMsg = err instanceof Error ? err.message : String(err)

    // Check if it's a driver mismatch error
    if (errorMsg.includes('version mismatch') || errorMsg.includes('NVML')) {
      gpuInfo.error = 'Driver version mismatch - reboot required'
    }
  }

  // Fallback: Try /proc/driver/nvidia/gpus for basic GPU info (sync file read is fine)
  try {
    const nvidiaGpusDir = '/proc/driver/nvidia/gpus'
    if (existsSync(nvidiaGpusDir)) {
      const gpuDirs = readdirSync(nvidiaGpusDir)
      if (gpuDirs.length > 0) {
        const infoPath = join(nvidiaGpusDir, gpuDirs[0], 'information')
        if (existsSync(infoPath)) {
          const info = readFileSync(infoPath, 'utf-8')
          // Parse GPU model from the info file
          const modelMatch = info.match(/Model:\s*(.+)/i)
          if (modelMatch) {
            gpuInfo.available = true
            gpuInfo.name = modelMatch[1].trim()
          }
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }

  // Fallback: Try lspci for GPU detection using spawnAsync (no shell)
  if (!gpuInfo.name) {
    try {
      const lspciOutput = await spawnAsync('lspci', [], { timeout: 2000 })
      const nvidiaLine = lspciOutput
        .split('\n')
        .find((line) => /vga|3d|display/i.test(line) && /nvidia/i.test(line))
      if (nvidiaLine) {
        gpuInfo.available = true
        const match = nvidiaLine.match(/NVIDIA[^[]+/i)
        gpuInfo.name = match ? match[0].trim() : 'NVIDIA GPU (detected via lspci)'
      }
    } catch {
      // lspci failed
    }
  }

  // Fallback: Get driver version from /sys (sync file read is fine)
  if (!gpuInfo.driverVersion) {
    try {
      if (existsSync('/sys/module/nvidia/version')) {
        gpuInfo.driverVersion = readFileSync('/sys/module/nvidia/version', 'utf-8').trim()
        if (!gpuInfo.error) {
          gpuInfo.error = 'nvidia-smi unavailable'
        }
      }
    } catch {
      // Ignore
    }
  }

  dataCache.set('gpuUsage', gpuInfo, 5000) // 5s cache
  return gpuInfo
}

function getClaudeProjects(): ClaudeProject[] {
  const projects: ClaudeProject[] = []
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) {
    return projects
  }

  // Scan project directories
  const entries = readdirSync(projectsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const projectPath = join(projectsDir, entry.name)
    const decodedPath = entry.name.replace(/-/g, '/')

    // Count session files
    const sessionFiles = readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'))

    // Check for CLAUDE.md
    const realPath = decodedPath.startsWith('/') ? decodedPath : join(HOME, decodedPath)
    const hasCLAUDEMD =
      existsSync(join(realPath, '.claude', 'CLAUDE.md')) || existsSync(join(realPath, 'CLAUDE.md'))

    // Check for Beads
    const hasBeads = existsSync(join(realPath, '.beads'))

    projects.push({
      path: realPath,
      name: realPath.split('/').pop() || entry.name,
      hasCLAUDEMD,
      hasBeads,
      sessionCount: sessionFiles.length,
    })
  }

  return projects
}

function getMCPServers(): MCPServer[] {
  const servers: MCPServer[] = []
  const seenNames = new Set<string>()

  // Helper to add servers from a config object
  const addServersFromConfig = (mcpServers: Record<string, unknown>) => {
    for (const [name, config] of Object.entries(mcpServers)) {
      if (seenNames.has(name)) continue
      seenNames.add(name)
      const serverConfig = config as MCPServer['config']
      servers.push({
        name,
        status: serverConfig.disabled ? 'offline' : 'online',
        config: serverConfig,
      })
    }
  }

  // 1. Read from dedicated mcp.json (primary source for Claude Code)
  const mcpJsonPath = join(CLAUDE_DIR, 'mcp.json')
  if (existsSync(mcpJsonPath)) {
    try {
      const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'))
      addServersFromConfig(mcpConfig.mcpServers || {})
    } catch {
      // Ignore parse errors
    }
  }

  // 2. Read from settings.json mcpServers (fallback/override)
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      addServersFromConfig(settings.mcpServers || {})
    } catch {
      // Ignore parse errors
    }
  }

  return servers
}

async function queryLearnings(query?: string, limit = 50): Promise<Learning[]> {
  try {
    // Ensure connection
    await postgresService.connect()

    // Validate limit
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 1000)

    interface LearningRow {
      id: number
      category: string | null
      topic: string | null
      content: string | null
      created_at: Date | string
      relevance: number | string
    }

    let rows: LearningRow[]

    if (query && query.trim()) {
      // Sanitize query: remove null bytes, limit length
      const searchQuery = query.replace(/\0/g, '').slice(0, 500)
      const likePattern = `%${searchQuery}%`

      // Enhanced search using PostgreSQL full-text search + pg_trgm fuzzy matching
      // Uses parameterized queries for security
      rows = await postgresService.query<LearningRow>(
        `
        WITH search_results AS (
          SELECT
            id, category, topic, content, created_at,
            -- Full-text search score (higher weight for exact phrase matches)
            COALESCE(ts_rank_cd(
              to_tsvector('english', COALESCE(content, '') || ' ' || COALESCE(topic, '') || ' ' || COALESCE(category, '')),
              plainto_tsquery('english', $1)
            ), 0) AS fts_score,
            -- Trigram similarity score for fuzzy matching
            GREATEST(
              COALESCE(similarity(content, $1), 0),
              COALESCE(similarity(topic, $1), 0),
              COALESCE(similarity(category, $1), 0)
            ) AS trgm_score
          FROM learnings
          WHERE
            -- Full-text search match
            to_tsvector('english', COALESCE(content, '') || ' ' || COALESCE(topic, '') || ' ' || COALESCE(category, ''))
              @@ plainto_tsquery('english', $1)
            -- OR trigram similarity match (fuzzy matching)
            OR content % $1
            OR topic % $1
            OR category % $1
            -- OR fallback to ILIKE for substring matches
            OR content ILIKE $2
            OR topic ILIKE $2
            OR category ILIKE $2
        )
        SELECT id, category, topic, content, created_at,
               ROUND((COALESCE(fts_score * 0.4, 0) + COALESCE(trgm_score * 0.6, 0))::numeric, 3) AS relevance
        FROM search_results
        ORDER BY relevance DESC, created_at DESC
        LIMIT $3
        `,
        [searchQuery, likePattern, safeLimit]
      )
    } else {
      rows = await postgresService.query<LearningRow>(
        `SELECT id, category, topic, content, created_at, 1.0 AS relevance
         FROM learnings ORDER BY created_at DESC LIMIT $1`,
        [safeLimit]
      )
    }

    return rows.map((row) => ({
      id: row.id,
      category: row.category || 'general',
      content: row.content || '',
      confidence:
        typeof row.relevance === 'string' ? parseFloat(row.relevance) : row.relevance || 1,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      source: row.topic || undefined,
    }))
  } catch (error) {
    console.error('Failed to query learnings:', error)
    // Fallback to simple ILIKE query if advanced search fails (pg_trgm might not be installed)
    return queryLearningsSimple(query, limit)
  }
}

// Fallback simple search without pg_trgm (in case extension is not installed)
async function queryLearningsSimple(query?: string, limit = 50): Promise<Learning[]> {
  try {
    // Ensure connection
    await postgresService.connect()

    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 1000)

    interface LearningRow {
      id: number
      category: string | null
      topic: string | null
      content: string | null
      created_at: Date | string
    }

    let rows: LearningRow[]

    if (query && query.trim()) {
      const searchQuery = query.replace(/\0/g, '').slice(0, 500)
      const likePattern = `%${searchQuery}%`

      rows = await postgresService.query<LearningRow>(
        `SELECT id, category, topic, content, created_at FROM learnings
         WHERE content ILIKE $1 OR topic ILIKE $1 OR category ILIKE $1
         ORDER BY created_at DESC LIMIT $2`,
        [likePattern, safeLimit]
      )
    } else {
      rows = await postgresService.query<LearningRow>(
        `SELECT id, category, topic, content, created_at FROM learnings
         ORDER BY created_at DESC LIMIT $1`,
        [safeLimit]
      )
    }

    return rows.map((row) => ({
      id: row.id,
      category: row.category || 'general',
      content: row.content || '',
      confidence: 1,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      source: row.topic || undefined,
    }))
  } catch (error) {
    console.error('Failed to query learnings (simple):', error)
    return []
  }
}

async function getMemoryStats(): Promise<{
  postgresql: { count: number }
  memgraph: { nodes: number; edges: number }
  qdrant: { vectors: number }
}> {
  const stats = {
    postgresql: { count: 0 },
    memgraph: { nodes: 0, edges: 0 },
    qdrant: { vectors: 0 },
  }

  // PostgreSQL count - native driver
  try {
    await postgresService.connect()
    const count = await postgresService.queryScalar<number>('SELECT COUNT(*) FROM learnings')
    stats.postgresql.count = count ?? 0
  } catch {
    // Ignore
  }

  // Memgraph counts - direct Bolt connection
  try {
    await memgraphService.connect()
    const memgraphStats = await memgraphService.getStats()
    stats.memgraph.nodes = memgraphStats.nodes
    stats.memgraph.edges = memgraphStats.edges
  } catch (error) {
    console.error('Failed to get Memgraph stats:', error)
  }

  // Qdrant count - sum across all collections using native client
  try {
    const qdrantService = QdrantService.getInstance()
    const collections = await qdrantService.listCollections()
    let totalVectors = 0

    for (const colName of collections) {
      try {
        const colStats = await qdrantService.getCollectionStats(
          colName as 'claude_memories' | 'mem0_memories'
        )
        totalVectors += colStats.pointsCount
      } catch {
        // Skip failed collection
      }
    }
    stats.qdrant.vectors = totalVectors
  } catch {
    // Ignore
  }

  return stats
}

// Parse mgconsole tabular output into array of objects
function _parseMgconsoleOutput(output: string): Array<Record<string, unknown>> {
  const lines = output.trim().split('\n')
  if (lines.length < 4) return [] // Need at least header separator, header, separator, and data

  const results: Array<Record<string, unknown>> = []

  // Find header line (second line after first +---+ separator)
  let headerLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|') && !lines[i].startsWith('+')) {
      headerLineIdx = i
      break
    }
  }
  if (headerLineIdx === -1) return []

  // Parse column names from header
  const headerLine = lines[headerLineIdx]
  const columns = headerLine
    .split('|')
    .filter((c) => c.trim())
    .map((c) => c.trim())

  // Parse data rows (skip header and separator lines)
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('+') || !line.startsWith('|')) continue

    const values = line
      .split('|')
      .filter((v) => v.trim() !== '')
      .map((v) => {
        const trimmed = v.trim()
        // Parse value types
        if (trimmed === 'Null' || trimmed === 'null') return null
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1) // Remove quotes
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            return JSON.parse(trimmed)
          } catch {
            return trimmed
          }
        }
        const num = Number(trimmed)
        if (!isNaN(num)) return num
        return trimmed
      })

    if (values.length === columns.length) {
      const row: Record<string, unknown> = {}
      columns.forEach((col, idx) => {
        row[col] = values[idx]
      })
      results.push(row)
    }
  }

  return results
}

// Parse Cypher node/relationship format: (:Label {prop: value, ...}) or [:TYPE {prop: value, ...}]
function _parseCypherNodeProps(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'string') return {}

  const str = String(value)
  // Match the properties portion inside curly braces
  const propsMatch = str.match(/\{([^}]*)\}/)
  if (!propsMatch) return {}

  const propsStr = propsMatch[1]
  const props: Record<string, unknown> = {}

  // Parse key: value pairs - handle quoted strings, numbers, etc.
  // Simple regex-based parser for common cases
  const pairRegex = /(\w+):\s*("(?:[^"\\]|\\.)*"|[^,}]+)/g
  let match
  while ((match = pairRegex.exec(propsStr)) !== null) {
    const key = match[1]
    let val: string | number | boolean | null = match[2].trim()

    // Parse value type
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n')
    } else if (val === 'true') {
      props[key] = true
      continue
    } else if (val === 'false') {
      props[key] = false
      continue
    } else if (val === 'null' || val === 'Null') {
      props[key] = null
      continue
    } else {
      const num = Number(val)
      if (!isNaN(num)) {
        props[key] = num
        continue
      }
    }
    props[key] = val
  }

  return props
}

async function queryMemgraphGraph(
  query?: string,
  limit = 100
): Promise<{
  nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
  edges: Array<{
    id: string
    source: string
    target: string
    type: string
    properties: Record<string, unknown>
  }>
}> {
  try {
    await memgraphService.connect()

    if (query && query.trim()) {
      // Execute custom Cypher query
      const results = await memgraphService.query(query)
      // For custom queries, try to extract nodes/edges from results
      const nodes: Array<{
        id: string
        label: string
        type: string
        properties: Record<string, unknown>
      }> = []
      const edges: Array<{
        id: string
        source: string
        target: string
        type: string
        properties: Record<string, unknown>
      }> = []

      for (const row of results) {
        // Look for node-like objects in results
        for (const value of Object.values(row)) {
          if (value && typeof value === 'object' && 'id' in value && 'labels' in value) {
            const node = value as {
              id: number
              labels: string[]
              properties: Record<string, unknown>
            }
            nodes.push({
              id: String(node.id),
              label: (node.properties.name || node.properties.title || `Node ${node.id}`) as string,
              type: node.labels[0] || 'Unknown',
              properties: node.properties,
            })
          }
        }
      }

      return { nodes, edges }
    }

    // Default: get sample graph
    return await memgraphService.getSampleGraph(limit)
  } catch (error) {
    console.error('Failed to query Memgraph:', error)
    return { nodes: [], edges: [] }
  }
}

// Qdrant browsing function
async function browseQdrantMemories(
  collection: string,
  limit: number,
  offset?: string
): Promise<{
  points: Array<{ id: string; payload: Record<string, unknown>; created_at?: string }>
  nextOffset: string | null
}> {
  const result = {
    points: [] as Array<{ id: string; payload: Record<string, unknown>; created_at?: string }>,
    nextOffset: null as string | null,
  }

  try {
    const body: Record<string, unknown> = {
      limit,
      with_payload: true,
      with_vector: false,
    }
    if (offset) {
      body.offset = offset
    }

    const response = await fetch(`http://localhost:6333/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.result?.points) {
        result.points = data.result.points.map(
          (p: { id: string; payload: Record<string, unknown> }) => ({
            id: p.id,
            payload: p.payload,
            created_at: p.payload?.created_at as string | undefined,
          })
        )
      }
      result.nextOffset = data.result?.next_page_offset || null
    }
  } catch (error) {
    console.error('Failed to browse Qdrant:', error)
  }

  return result
}

// Generate embeddings using Ollama's nomic-embed-text model
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest',
        prompt: text,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.embedding || null
    }
  } catch (error) {
    console.error('Failed to generate embedding with Ollama:', error)
  }
  return null
}

// Qdrant semantic search function using Ollama embeddings
// Falls back to keyword search if Ollama is unavailable
async function searchQdrantMemories(
  query: string,
  collection: string,
  limit: number
): Promise<{
  results: Array<{ id: string; score: number; payload: Record<string, unknown> }>
}> {
  const result = {
    results: [] as Array<{ id: string; score: number; payload: Record<string, unknown> }>,
  }

  try {
    // Try semantic search first using Ollama embeddings
    const embedding = await generateEmbedding(query)

    if (embedding && embedding.length > 0) {
      // Use vector similarity search with Qdrant
      const searchResponse = await fetch(
        `http://localhost:6333/collections/${collection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embedding,
            limit,
            with_payload: true,
            with_vector: false,
            score_threshold: 0.3, // Minimum similarity threshold
          }),
        }
      )

      if (searchResponse.ok) {
        const data = await searchResponse.json()
        if (data.result) {
          result.results = data.result.map(
            (p: { id: string; score: number; payload: Record<string, unknown> }) => ({
              id: p.id,
              score: p.score,
              payload: p.payload,
            })
          )
          return result
        }
      }
    }

    // Fallback to keyword-based search if embedding fails or Ollama unavailable
    console.info('[Qdrant] Falling back to keyword search')
    const scrollResponse = await fetch(
      `http://localhost:6333/collections/${collection}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: limit * 5, // Get more to filter
          with_payload: true,
          with_vector: false,
        }),
      }
    )

    if (scrollResponse.ok) {
      const data = await scrollResponse.json()
      const queryLower = query.toLowerCase()

      if (data.result?.points) {
        // Filter points whose data contains the query
        const filtered = data.result.points
          .filter((p: { payload: Record<string, unknown> }) => {
            const dataStr = String(p.payload?.data || '').toLowerCase()
            return dataStr.includes(queryLower)
          })
          .slice(0, limit)
          .map((p: { id: string; payload: Record<string, unknown> }, index: number) => ({
            id: p.id,
            score: 0.5 - index * 0.01, // Lower pseudo score to indicate keyword match
            payload: p.payload,
          }))

        result.results = filtered
      }
    }
  } catch (error) {
    console.error('Failed to search Qdrant:', error)
  }

  return result
}

// Unified federated search across all memory sources
// Uses Reciprocal Rank Fusion (RRF) to merge results from different sources
async function unifiedSearch(
  query: string,
  limit: number
): Promise<{
  results: Array<{
    id: string
    source: 'postgresql' | 'memgraph' | 'qdrant'
    title: string
    content: string
    score: number
    metadata: Record<string, unknown>
  }>
  stats: {
    postgresql: number
    memgraph: number
    qdrant: number
    totalTime: number
  }
}> {
  const startTime = Date.now()
  const k = 60 // RRF constant (standard value from research papers)

  interface RankedResult {
    id: string
    source: 'postgresql' | 'memgraph' | 'qdrant'
    title: string
    content: string
    originalScore: number
    rank: number
    metadata: Record<string, unknown>
  }

  // Search all sources in parallel
  const [pgResults, mgResults, qdResults] = await Promise.all([
    queryLearnings(query, limit * 2),
    searchMemgraphNodes(query, undefined, limit * 2),
    searchQdrantMemories(query, 'mem0_memories', limit * 2),
  ])

  // Convert PostgreSQL results
  const pgRanked: RankedResult[] = pgResults.map((learning, index) => ({
    id: `pg-${learning.id}`,
    source: 'postgresql' as const,
    title: learning.source || learning.category,
    content: learning.content.slice(0, 300) + (learning.content.length > 300 ? '...' : ''),
    originalScore: learning.confidence,
    rank: index + 1,
    metadata: {
      category: learning.category,
      createdAt: learning.createdAt,
      fullContent: learning.content,
    },
  }))

  // Convert Memgraph results
  const mgRanked: RankedResult[] = mgResults.results.map((node, index) => ({
    id: `mg-${node.id}`,
    source: 'memgraph' as const,
    title: node.label,
    content: String(
      node.properties.instruction || node.properties.description || node.properties.output || ''
    ).slice(0, 300),
    originalScore: node.score || 0.5,
    rank: index + 1,
    metadata: {
      type: node.type,
      properties: node.properties,
    },
  }))

  // Convert Qdrant results
  const qdRanked: RankedResult[] = qdResults.results.map((point, index) => ({
    id: `qd-${point.id}`,
    source: 'qdrant' as const,
    title: String(point.payload?.user_id || 'Memory'),
    content:
      String(point.payload?.data || '').slice(0, 300) +
      (String(point.payload?.data || '').length > 300 ? '...' : ''),
    originalScore: point.score,
    rank: index + 1,
    metadata: {
      payload: point.payload,
      createdAt: point.payload?.created_at,
    },
  }))

  // Apply Reciprocal Rank Fusion (RRF) scoring
  // RRF score = sum(1 / (k + rank_i)) for each ranking list
  const rrfScores = new Map<string, { result: RankedResult; rrfScore: number }>()

  // Helper to add RRF score
  const addRRFScore = (results: RankedResult[]) => {
    for (const result of results) {
      const existing = rrfScores.get(result.id)
      const rrfContribution = 1 / (k + result.rank)

      if (existing) {
        existing.rrfScore += rrfContribution
      } else {
        rrfScores.set(result.id, {
          result,
          rrfScore: rrfContribution,
        })
      }
    }
  }

  addRRFScore(pgRanked)
  addRRFScore(mgRanked)
  addRRFScore(qdRanked)

  // Sort by RRF score and take top results
  const sortedResults = Array.from(rrfScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ result, rrfScore }) => ({
      id: result.id,
      source: result.source,
      title: result.title,
      content: result.content,
      score: Math.round(rrfScore * 1000) / 1000, // Normalized RRF score
      metadata: result.metadata,
    }))

  return {
    results: sortedResults,
    stats: {
      postgresql: pgResults.length,
      memgraph: mgResults.results.length,
      qdrant: qdResults.results.length,
      totalTime: Date.now() - startTime,
    },
  }
}

// Memgraph keyword search function
// Uses text indexes for fast search on CyberTechnique nodes (1.7M+ records)
async function searchMemgraphNodes(
  keyword: string,
  nodeType: string | undefined,
  limit: number
): Promise<{
  results: Array<{
    id: string
    label: string
    type: string
    properties: Record<string, unknown>
    score?: number
  }>
}> {
  try {
    await memgraphService.connect()

    // Use text index search for better performance
    const searchResults = await memgraphService.textSearch(
      keyword,
      nodeType === 'all' ? undefined : nodeType,
      limit
    )

    return {
      results: searchResults.map((r) => ({
        id: String(r.id),
        label: r.label,
        type: r.type,
        properties: r.properties,
        score: r.score,
      })),
    }
  } catch (error) {
    console.error('Failed to search Memgraph:', error)
    return { results: [] }
  }
}

// Valid Cypher keywords that can start a query
const VALID_CYPHER_STARTS = [
  'MATCH',
  'RETURN',
  'CREATE',
  'MERGE',
  'DELETE',
  'DETACH',
  'SET',
  'REMOVE',
  'WITH',
  'UNWIND',
  'CALL',
  'SHOW',
  'OPTIONAL',
  'EXPLAIN',
  'PROFILE',
  'LOAD',
  'FOREACH',
  'USING',
  'DROP',
  'ALTER',
  'GRANT',
  'REVOKE',
  'DENY',
]

// Validate Cypher query syntax before sending to Memgraph
function validateCypherQuery(query: string): {
  valid: boolean
  error?: string
  suggestion?: string
} {
  const trimmed = query.trim()
  if (!trimmed) {
    return { valid: false, error: 'Query is empty' }
  }

  // Get first word
  const firstWord = trimmed.split(/[\s(]/)[0].toUpperCase()

  // Check if it starts with a valid Cypher keyword
  if (!VALID_CYPHER_STARTS.includes(firstWord)) {
    const suggestions: Record<string, string> = {
      SELECT: 'Cypher uses MATCH/RETURN instead of SELECT. Try: MATCH (n) RETURN n LIMIT 10',
      FROM: 'Cypher uses MATCH instead of FROM. Try: MATCH (n:NodeType) RETURN n',
      WHERE: 'WHERE must follow MATCH. Try: MATCH (n) WHERE n.name = "value" RETURN n',
      INSERT: 'Cypher uses CREATE instead of INSERT. Try: CREATE (n:Label {prop: "value"})',
      UPDATE: 'Cypher uses SET instead of UPDATE. Try: MATCH (n) SET n.prop = "value"',
    }

    return {
      valid: false,
      error: `Invalid Cypher syntax: "${firstWord}" is not a valid starting keyword`,
      suggestion:
        suggestions[firstWord] ||
        `Valid Cypher queries start with: ${VALID_CYPHER_STARTS.slice(0, 8).join(', ')}...\nExample: MATCH (n:CyberTechnique) RETURN n LIMIT 10`,
    }
  }

  return { valid: true }
}

// Parse Memgraph errors into user-friendly messages
function parseMemgraphError(error: Error): string {
  const msg = error.message

  // Parse common error patterns
  if (msg.includes('mismatched input')) {
    const match = msg.match(/mismatched input '([^']+)'/)
    if (match) {
      return `Syntax error: Unexpected "${match[1]}". Check your Cypher syntax.`
    }
  }

  if (msg.includes('Unknown exception')) {
    return 'Query execution failed. This may be a bug in text_search - try regex_search instead.'
  }

  if (msg.includes('not found') || msg.includes("doesn't exist")) {
    return 'Function or procedure not found. Check the name and available procedures.'
  }

  if (msg.includes('Invalid input')) {
    return 'Invalid input in query. Check property names and values.'
  }

  // Return cleaned error
  return msg.replace(/\{[^}]+\}/g, '').trim() || 'Query execution failed'
}

// Raw query execution function
async function executeRawQuery(
  source: 'postgresql' | 'memgraph' | 'qdrant',
  query: string
): Promise<{
  success: boolean
  data: unknown
  error?: string
  suggestion?: string
  executionTime: number
}> {
  const startTime = Date.now()

  try {
    switch (source) {
      case 'postgresql': {
        // Native pg driver - queryRaw handles dangerous operation validation
        await postgresService.connect()
        const result = await postgresService.queryRaw(query)
        return {
          success: true,
          data: { rows: result.rows, rowCount: result.rowCount, fields: result.fields },
          executionTime: Date.now() - startTime,
        }
      }

      case 'memgraph': {
        // Validate Cypher query before sending
        const validation = validateCypherQuery(query)
        if (!validation.valid) {
          return {
            success: false,
            data: null,
            error: validation.error,
            suggestion: validation.suggestion,
            executionTime: Date.now() - startTime,
          }
        }

        // Use direct Bolt connection instead of podman exec
        await memgraphService.connect()
        const results = await memgraphService.query(query)
        return {
          success: true,
          data: results,
          executionTime: Date.now() - startTime,
        }
      }

      case 'qdrant': {
        // Parse the query as a Qdrant API endpoint
        // Format: METHOD /path [body]
        const match = query.match(/^(GET|POST|PUT|DELETE)\s+(\S+)(?:\s+(.+))?$/i)
        if (!match) {
          return {
            success: false,
            data: null,
            error: 'Invalid Qdrant query format. Use: METHOD /path [JSON body]',
            executionTime: Date.now() - startTime,
          }
        }

        const [, method, path, bodyStr] = match

        // Use native fetch instead of curl (no shell)
        const fetchOptions: RequestInit = {
          method: method.toUpperCase(),
          headers: bodyStr ? { 'Content-Type': 'application/json' } : undefined,
          body: bodyStr || undefined,
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000)

        const response = await fetch(`http://localhost:6333${path}`, {
          ...fetchOptions,
          signal: controller.signal,
        })
        clearTimeout(timeout)

        const responseText = await response.text()

        try {
          const parsed = JSON.parse(responseText)
          return {
            success: true,
            data: parsed,
            executionTime: Date.now() - startTime,
          }
        } catch {
          return {
            success: true,
            data: responseText.trim(),
            executionTime: Date.now() - startTime,
          }
        }
      }

      default:
        return {
          success: false,
          data: null,
          error: `Unknown source: ${source}`,
          executionTime: Date.now() - startTime,
        }
    }
  } catch (error) {
    // Parse error based on source for better user messages
    let errorMessage = error instanceof Error ? error.message : 'Unknown error'
    let suggestion: string | undefined

    if (source === 'memgraph' && error instanceof Error) {
      errorMessage = parseMemgraphError(error)
      // Add helpful suggestion for common errors
      if (errorMessage.includes('Syntax error')) {
        suggestion = 'Tip: Use MATCH (n:Label) RETURN n LIMIT 10 for basic queries'
      }
    }

    return {
      success: false,
      data: null,
      error: errorMessage,
      suggestion,
      executionTime: Date.now() - startTime,
    }
  }
}

// Profile functions
function getProfileSettings(): ProfileSettings {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    if (!existsSync(settingsPath)) {
      return {}
    }
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    return {
      model: settings.model,
      maxTokens: settings.max_tokens,
      thinkingEnabled: settings.thinking?.type === 'enabled',
      thinkingBudget: settings.thinking?.budget_tokens,
    }
  } catch (error) {
    console.error('Failed to read profile settings:', error)
    return {}
  }
}

function saveProfileSettings(newSettings: ProfileSettings): boolean {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }

    if (newSettings.model) {
      settings.model = newSettings.model
    }
    if (newSettings.maxTokens) {
      settings.max_tokens = newSettings.maxTokens
    }
    if (newSettings.thinkingEnabled !== undefined) {
      settings.thinking = {
        type: newSettings.thinkingEnabled ? 'enabled' : 'disabled',
        budget_tokens: newSettings.thinkingBudget || 32000,
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save profile settings:', error)
    return false
  }
}

function getClaudeMd(): string {
  const claudeMdPath = join(CLAUDE_DIR, 'CLAUDE.md')
  try {
    if (!existsSync(claudeMdPath)) {
      return ''
    }
    return readFileSync(claudeMdPath, 'utf-8')
  } catch (error) {
    console.error('Failed to read CLAUDE.md:', error)
    return ''
  }
}

function saveClaudeMd(content: string): boolean {
  const claudeMdPath = join(CLAUDE_DIR, 'CLAUDE.md')
  try {
    writeFileSync(claudeMdPath, content)
    return true
  } catch (error) {
    console.error('Failed to save CLAUDE.md:', error)
    return false
  }
}

function getRules(): ClaudeRule[] {
  const rulesDir = join(CLAUDE_DIR, 'rules')
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  const rules: ClaudeRule[] = []

  // Read disabled rules from settings
  let disabledRules: string[] = []
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      disabledRules = settings.disabledRules || []
    }
  } catch {
    // Ignore settings read errors
  }

  try {
    if (!existsSync(rulesDir)) {
      return rules
    }

    const entries = readdirSync(rulesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue

      const rulePath = join(rulesDir, entry.name)
      const ruleName = entry.name.replace('.md', '')
      const isEnabled = !disabledRules.includes(ruleName)

      try {
        const content = readFileSync(rulePath, 'utf-8')
        rules.push({
          name: ruleName,
          path: rulePath,
          enabled: isEnabled,
          content,
        })
      } catch {
        rules.push({
          name: ruleName,
          path: rulePath,
          enabled: isEnabled,
        })
      }
    }
  } catch (error) {
    console.error('Failed to read rules:', error)
  }

  return rules
}

function toggleRule(name: string, enabled: boolean): boolean {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  const rulesDir = join(CLAUDE_DIR, 'rules')
  const rulePath = join(rulesDir, `${name}.md`)

  try {
    // Check if rule file exists
    if (!existsSync(rulePath)) {
      console.error(`Rule file not found: ${rulePath}`)
      return false
    }

    // Read or create settings
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }

    // Initialize disabledRules array if it doesn't exist
    if (!settings.disabledRules) {
      settings.disabledRules = []
    }
    const disabledRules = settings.disabledRules as string[]

    if (enabled) {
      // Remove from disabled list
      const index = disabledRules.indexOf(name)
      if (index >= 0) {
        disabledRules.splice(index, 1)
      }
    } else {
      // Add to disabled list
      if (!disabledRules.includes(name)) {
        disabledRules.push(name)
      }
    }

    settings.disabledRules = disabledRules
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to toggle rule:', error)
    return false
  }
}

// Custom Profiles functions (claude-eng, claude-sec, etc.)
// Profiles are stored as directories in ~/.claude-profiles/
// Each profile directory contains: mcp.json, settings.json, CLAUDE.md, .env
const PROFILES_DIR = join(homedir(), '.claude-profiles')
const ACTIVE_PROFILE_FILE = join(CLAUDE_DIR, 'active-profile')

function ensureProfilesDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true })
  }
}

function listProfiles(): ClaudeCodeProfile[] {
  const profiles: ClaudeCodeProfile[] = []

  try {
    if (!existsSync(PROFILES_DIR)) {
      return profiles
    }

    // Get all directories in the profiles folder
    const entries = readdirSync(PROFILES_DIR, { withFileTypes: true })
    const profileDirs = entries.filter((e) => e.isDirectory())

    for (const dir of profileDirs) {
      const profilePath = join(PROFILES_DIR, dir.name)
      try {
        // Read profile components
        const settingsPath = join(profilePath, 'settings.json')
        const mcpPath = join(profilePath, 'mcp.json')
        const claudeMdPath = join(profilePath, 'CLAUDE.md')

        // Parse settings if exists
        let settings: ClaudeCodeProfile['settings'] = {}
        if (existsSync(settingsPath)) {
          const settingsContent = JSON.parse(readFileSync(settingsPath, 'utf-8'))
          settings = {
            model: settingsContent.model,
            maxTokens: settingsContent.max_tokens,
            thinkingEnabled: settingsContent.thinking?.type === 'enabled',
            thinkingBudget: settingsContent.thinking?.budget_tokens,
          }
        }

        // Read CLAUDE.md if exists
        let claudeMd: string | undefined
        if (existsSync(claudeMdPath)) {
          claudeMd = readFileSync(claudeMdPath, 'utf-8')
        }

        // Check if mcp.json exists (for validation)
        const hasMcp = existsSync(mcpPath)

        // Get directory stats for timestamps
        const stats = statSync(profilePath)

        const profile: ClaudeCodeProfile = {
          id: dir.name,
          name: dir.name,
          description: `Profile at ${profilePath}`,
          settings,
          claudeMd,
          hasMcpConfig: hasMcp,
          profilePath,
          createdAt: stats.birthtime.getTime(),
          updatedAt: stats.mtime.getTime(),
        }

        profiles.push(profile)
      } catch (err) {
        console.error(`[Profiles] Failed to load profile ${dir.name}:`, err)
      }
    }
  } catch (error) {
    console.error('[Profiles] Failed to list profiles:', error)
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name))
}

function getProfile(id: string): ClaudeCodeProfile | null {
  // Profile is a directory, not a JSON file
  const profilePath = join(PROFILES_DIR, id)
  try {
    if (!existsSync(profilePath)) return null

    const settingsPath = join(profilePath, 'settings.json')
    const mcpPath = join(profilePath, 'mcp.json')
    const claudeMdPath = join(profilePath, 'CLAUDE.md')

    // Parse settings if exists
    let settings: ClaudeCodeProfile['settings'] = {}
    if (existsSync(settingsPath)) {
      const settingsContent = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      settings = {
        model: settingsContent.model,
        maxTokens: settingsContent.max_tokens,
        thinkingEnabled: settingsContent.thinking?.type === 'enabled',
        thinkingBudget: settingsContent.thinking?.budget_tokens,
      }
    }

    // Read CLAUDE.md if exists
    let claudeMd: string | undefined
    if (existsSync(claudeMdPath)) {
      claudeMd = readFileSync(claudeMdPath, 'utf-8')
    }

    const hasMcp = existsSync(mcpPath)
    const stats = statSync(profilePath)

    return {
      id,
      name: id,
      description: `Profile at ${profilePath}`,
      settings,
      claudeMd,
      hasMcpConfig: hasMcp,
      profilePath,
      createdAt: stats.birthtime.getTime(),
      updatedAt: stats.mtime.getTime(),
    }
  } catch (error) {
    console.error('Failed to get profile:', error)
    return null
  }
}

function createProfile(
  profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>
): ClaudeCodeProfile | null {
  ensureProfilesDir()

  // Generate ID from name (slugified)
  const id = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const now = Date.now()

  const newProfile: ClaudeCodeProfile = {
    ...profile,
    id,
    createdAt: now,
    updatedAt: now,
  }

  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (existsSync(profilePath)) {
      console.error('Profile with this name already exists')
      return null
    }
    writeFileSync(profilePath, JSON.stringify(newProfile, null, 2))
    return newProfile
  } catch (error) {
    console.error('Failed to create profile:', error)
    return null
  }
}

function updateProfile(id: string, updates: Partial<ClaudeCodeProfile>): boolean {
  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (!existsSync(profilePath)) return false

    const existing = JSON.parse(readFileSync(profilePath, 'utf-8')) as ClaudeCodeProfile
    const updated: ClaudeCodeProfile = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID changes
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: Date.now(),
    }

    writeFileSync(profilePath, JSON.stringify(updated, null, 2))
    return true
  } catch (error) {
    console.error('Failed to update profile:', error)
    return false
  }
}

function deleteProfile(id: string): boolean {
  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (!existsSync(profilePath)) return false
    unlinkSync(profilePath)

    // If this was the active profile, clear it
    if (getActiveProfileId() === id) {
      if (existsSync(ACTIVE_PROFILE_FILE)) {
        unlinkSync(ACTIVE_PROFILE_FILE)
      }
    }
    return true
  } catch (error) {
    console.error('Failed to delete profile:', error)
    return false
  }
}

function activateProfile(id: string): boolean {
  const profile = getProfile(id)
  if (!profile) return false

  try {
    // Save active profile ID
    writeFileSync(ACTIVE_PROFILE_FILE, id)

    // Apply profile settings to Claude
    if (profile.settings) {
      saveProfileSettings(profile.settings)
    }

    // Apply CLAUDE.md if specified
    if (profile.claudeMd) {
      saveClaudeMd(profile.claudeMd)
    }

    // Apply enabled rules
    if (profile.enabledRules) {
      const allRules = getRules()
      const settingsPath = join(CLAUDE_DIR, 'settings.json')
      let settings: Record<string, unknown> = {}

      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      }

      // Disable all rules not in the enabled list
      const enabledRules = profile.enabledRules ?? []
      const disabledRules = allRules
        .filter((r) => !enabledRules.includes(r.name))
        .map((r) => r.name)

      settings.disabledRules = disabledRules
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    }

    return true
  } catch (error) {
    console.error('Failed to activate profile:', error)
    return false
  }
}

function getActiveProfileId(): string | null {
  try {
    if (!existsSync(ACTIVE_PROFILE_FILE)) return null
    return readFileSync(ACTIVE_PROFILE_FILE, 'utf-8').trim()
  } catch {
    return null
  }
}

function launchProfile(id: string, projectPath?: string): { success: boolean; error?: string } {
  const profile = getProfile(id)
  if (!profile) {
    return { success: false, error: 'Profile not found' }
  }

  try {
    // Check for launcher script at ~/bin/claude-{profileName}
    const binDir = join(homedir(), 'bin')
    const launcherScript = join(binDir, `claude-${id}`)
    const hasLauncher = existsSync(launcherScript)

    let command: string

    if (hasLauncher) {
      // Use the custom launcher script
      command = launcherScript
      if (projectPath) {
        command += ` "${projectPath}"`
      }
    } else if (profile.profilePath && profile.hasMcpConfig) {
      // Build command from profile directory structure
      const mcpConfig = join(profile.profilePath, 'mcp.json')
      const settingsJson = join(profile.profilePath, 'settings.json')
      const claudeMd = join(profile.profilePath, 'CLAUDE.md')

      const args: string[] = ['claude']

      // Add MCP config if exists
      if (existsSync(mcpConfig)) {
        args.push(`--mcp-config "${mcpConfig}"`)
      }

      // Add settings if exists
      if (existsSync(settingsJson)) {
        args.push(`--settings "${settingsJson}"`)
      }

      // Add CLAUDE.md as system prompt if exists
      if (existsSync(claudeMd)) {
        args.push(`--append-system-prompt "${claudeMd}"`)
      }

      // Add model if specified
      if (profile.settings.model) {
        args.push(`--model ${profile.settings.model}`)
      }

      // Add project path if provided
      if (projectPath) {
        args.push(`"${projectPath}"`)
      }

      command = args.join(' ')
    } else {
      // Fallback: just run claude with model
      const args: string[] = ['claude']
      if (profile.settings.model) {
        args.push(`--model ${profile.settings.model}`)
      }
      if (projectPath) {
        args.push(`"${projectPath}"`)
      }
      command = args.join(' ')
    }

    // Open a new terminal with the command
    // Use x-terminal-emulator on Linux, or fallback to common terminals
    const terminals = [
      'x-terminal-emulator',
      'gnome-terminal',
      'konsole',
      'xfce4-terminal',
      'alacritty',
      'kitty',
      'terminator',
      'xterm',
    ]

    // Use commandExists from spawn-async (no shell)
    let terminalCmd: string | null = null
    for (const term of terminals) {
      if (await commandExists(term)) {
        terminalCmd = term
        break
      }
    }

    if (!terminalCmd) {
      return { success: false, error: 'No terminal emulator found' }
    }

    // Build the terminal command
    let fullCommand: string
    if (terminalCmd === 'gnome-terminal' || terminalCmd === 'x-terminal-emulator') {
      fullCommand = `${terminalCmd} -- bash -c '${command}; exec bash'`
    } else if (terminalCmd === 'konsole') {
      fullCommand = `${terminalCmd} -e bash -c '${command}; exec bash'`
    } else if (terminalCmd === 'alacritty' || terminalCmd === 'kitty') {
      fullCommand = `${terminalCmd} -e bash -c '${command}; exec bash'`
    } else {
      fullCommand = `${terminalCmd} -e bash -c '${command}; exec bash'`
    }

    // Spawn the terminal in the background
    const child = spawn('bash', ['-c', fullCommand], {
      detached: true,
      stdio: 'ignore',
      cwd: projectPath || homedir(),
    })
    child.unref()

    return { success: true }
  } catch (error) {
    console.error('Failed to launch profile:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to launch profile',
    }
  }
}

// Context functions
function getTokenUsage(): TokenUsage {
  // Estimate token usage from recent checkpoints
  const checkpointsDir = join(CLAUDE_DIR, 'checkpoints')
  let current = 0
  const max = 200000 // Default max context

  try {
    if (existsSync(checkpointsDir)) {
      const files = readdirSync(checkpointsDir).filter((f) => f.endsWith('.json'))
      if (files.length > 0) {
        // Get most recent checkpoint
        const sorted = files.sort().reverse()
        const latestPath = join(checkpointsDir, sorted[0])
        const checkpoint = JSON.parse(readFileSync(latestPath, 'utf-8'))
        current = checkpoint.tokenCount || checkpoint.tokens || 0
      }
    }
  } catch (error) {
    console.error('Failed to read checkpoints:', error)
  }

  // Also check compaction checkpoints
  const compactionDir = join(CLAUDE_DIR, 'compaction-checkpoints')
  let lastCompaction: number | undefined

  try {
    if (existsSync(compactionDir)) {
      const files = readdirSync(compactionDir).filter((f) => f.endsWith('.json'))
      if (files.length > 0) {
        const sorted = files.sort().reverse()
        const match = sorted[0].match(/checkpoint-(\d+)-(\d+)\.json/)
        if (match) {
          const dateStr = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`
          const timeStr = `${match[2].slice(0, 2)}:${match[2].slice(2, 4)}:${match[2].slice(4, 6)}`
          lastCompaction = new Date(`${dateStr}T${timeStr}`).getTime()
        }
      }
    }
  } catch (error) {
    console.error('Failed to read compaction checkpoints:', error)
  }

  return {
    current,
    max,
    percentage: (current / max) * 100,
    lastCompaction,
  }
}

function getCompactionSettings(): CompactionSettings {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return {
        autoCompact: settings.autoCompact ?? true,
        threshold: settings.compactThreshold || 80,
      }
    }
  } catch (error) {
    console.error('Failed to read compaction settings:', error)
  }
  return { autoCompact: true, threshold: 80 }
}

function setAutoCompact(enabled: boolean): boolean {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }
    settings.autoCompact = enabled
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save auto-compact setting:', error)
    return false
  }
}

function triggerCompaction(): boolean {
  try {
    // Trigger Claude's context compaction via the claude CLI
    // The /compact command is used to manually compact the conversation context
    // We use --print to run non-interactively and capture output
    const result = spawn('claude', ['--print', '-p', '/compact'], {
      shell: true,
      stdio: 'pipe',
    })

    result.stdout?.on('data', (data: Buffer) => {
      console.info('Compaction output:', data.toString())
    })

    result.stderr?.on('data', (data: Buffer) => {
      console.error('Compaction stderr:', data.toString())
    })

    result.on('error', (error) => {
      console.error('Compaction process error:', error)
    })

    result.on('close', (code) => {
      if (code === 0) {
        console.info('Compaction completed successfully')
      } else {
        console.error(`Compaction exited with code ${code}`)
      }
    })

    return true
  } catch (error) {
    console.error('Failed to trigger compaction:', error)
    return false
  }
}

function getRecentSessions(): SessionSummary[] {
  const sessions: SessionSummary[] = []
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) {
    return sessions
  }

  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const projectDir = join(projectsDir, entry.name)
      const decodedPath = entry.name.replace(/-/g, '/')
      const realPath = decodedPath.startsWith('/') ? decodedPath : join(HOME, decodedPath)
      const projectName = realPath.split('/').pop() || entry.name

      // Find session files
      const sessionFiles = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))

      for (const sessionFile of sessionFiles) {
        const sessionPath = join(projectDir, sessionFile)
        const sessionId = sessionFile.replace('.jsonl', '')

        try {
          const content = readFileSync(sessionPath, 'utf-8')
          const lines = content
            .trim()
            .split('\n')
            .filter((l) => l.trim())

          if (lines.length === 0) continue

          let messageCount = 0
          let toolCalls = 0
          let tokenCount = 0
          let model: string | undefined
          let startTime = 0
          let endTime = 0

          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              if (entry.type === 'message' || entry.role) {
                messageCount++
                if (entry.timestamp) {
                  const ts = new Date(entry.timestamp).getTime()
                  if (!startTime || ts < startTime) startTime = ts
                  if (ts > endTime) endTime = ts
                }
                if (entry.model) model = entry.model
                if (entry.usage?.input_tokens) tokenCount += entry.usage.input_tokens
                if (entry.usage?.output_tokens) tokenCount += entry.usage.output_tokens
              }
              // Extract model from assistant messages (Claude Code format)
              if (entry.type === 'assistant' && entry.message?.model && !model) {
                model = entry.message.model
              }
              // Count messages for Claude Code format
              if (entry.type === 'user' || entry.type === 'assistant') {
                if (entry.type === 'user') messageCount++
                if (entry.type === 'assistant') messageCount++
                if (entry.timestamp) {
                  const ts = new Date(entry.timestamp).getTime()
                  if (!startTime || ts < startTime) startTime = ts
                  if (ts > endTime) endTime = ts
                }
                // Token usage from message.usage
                if (entry.message?.usage) {
                  tokenCount += entry.message.usage.input_tokens || 0
                  tokenCount += entry.message.usage.output_tokens || 0
                }
              }
              if (entry.type === 'tool_use' || entry.tool_calls) {
                toolCalls++
              }
            } catch {
              // Skip invalid JSON lines
            }
          }

          // Only add sessions with actual data
          if (messageCount > 0) {
            sessions.push({
              id: sessionId,
              projectPath: realPath,
              projectName,
              startTime: startTime || Date.now(),
              endTime: endTime || undefined,
              messageCount,
              tokenCount,
              toolCalls,
              model,
            })
          }
        } catch {
          // Skip sessions that can't be read
        }
      }
    }

    // Sort by start time descending
    sessions.sort((a, b) => b.startTime - a.startTime)

    // Return only the 20 most recent
    return sessions.slice(0, 20)
  } catch (error) {
    console.error('Failed to read sessions:', error)
    return []
  }
}

// Services functions
async function getSystemdServices(): Promise<SystemdService[]> {
  const services: SystemdService[] = []
  const importantServices = ['postgresql', 'docker', 'ssh', 'nginx', 'redis', 'memcached', 'cron']

  try {
    // Use spawnAsync with args array (no shell pipes)
    const result = await spawnAsync(
      'systemctl',
      ['list-units', '--type=service', '--all', '--no-pager', '--plain'],
      { timeout: 5000 }
    )

    const lines = result.trim().split('\n').slice(1, 51) // Skip header, limit to 50

    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue

      const name = parts[0].replace('.service', '')
      const load = parts[1]
      const active = parts[2]
      const sub = parts[3]
      const description = parts.slice(4).join(' ')

      // Only include important or running services
      if (!importantServices.some((s) => name.includes(s)) && active !== 'active') {
        continue
      }

      let status: SystemdService['status'] = 'inactive'
      if (active === 'active') status = 'running'
      else if (active === 'failed') status = 'failed'
      else if (active === 'inactive') status = 'stopped'

      services.push({
        name,
        description: description || name,
        status,
        enabled: load === 'loaded',
        activeState: active,
        subState: sub,
      })
    }
  } catch (error) {
    console.error('Failed to get systemd services:', error)
  }

  return services.slice(0, 20)
}

async function getPodmanContainers(): Promise<PodmanContainer[]> {
  const containers: PodmanContainer[] = []

  try {
    const result = await spawnAsync('podman', ['ps', '-a', '--format', 'json'], { timeout: 10000 })

    if (!result.trim()) return containers

    const data = JSON.parse(result)

    for (const c of data) {
      let status: PodmanContainer['status'] = 'stopped'
      const state = (c.State || '').toLowerCase()
      if (state === 'running') status = 'running'
      else if (state === 'paused') status = 'paused'
      else if (state === 'exited') status = 'exited'

      const ports: string[] = []
      if (c.Ports) {
        for (const p of c.Ports) {
          if (p.hostPort && p.containerPort) {
            ports.push(`${p.hostPort}:${p.containerPort}`)
          }
        }
      }

      containers.push({
        id: c.Id || c.ID || '',
        name: (c.Names && c.Names[0]) || c.Name || '',
        image: c.Image || '',
        status,
        created: c.Created || c.CreatedAt || '',
        ports,
        state: c.State || '',
        health: c.Status || undefined,
      })
    }
  } catch (error) {
    console.error('Failed to get podman containers:', error)
  }

  return containers
}

async function systemdAction(name: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> {
  try {
    const safeName = sanitizeServiceName(name)
    if (!safeName) {
      console.error('Invalid service name:', name)
      return false
    }
    // Use spawnAsync with args array (SECURITY: no shell, arguments are literals)
    await spawnAsync('systemctl', ['--user', action, safeName], { timeout: 30000 })
    return true
  } catch (error) {
    console.error(`Failed to ${action} service ${name}:`, error)
    return false
  }
}

async function podmanAction(id: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> {
  try {
    const safeId = sanitizeContainerId(id)
    if (!safeId) {
      console.error('Invalid container ID:', id)
      return false
    }
    // Use spawnAsync with args array (SECURITY: no shell, arguments are literals)
    await spawnAsync('podman', [action, safeId], { timeout: 30000 })
    return true
  } catch (error) {
    console.error(`Failed to ${action} container ${id}:`, error)
    return false
  }
}

// Logs functions
// LogSource defined for future use when log filtering is implemented
type _LogSource = 'claude' | 'mcp' | 'system' | 'agent' | 'workflow'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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

  // Read from journalctl for system logs using spawnAsync
  try {
    const sysLogs = await spawnAsync(
      'journalctl',
      ['--no-pager', '-n', String(logCount), '-o', 'short-iso'],
      { timeout: 5000 }
    )

    for (const line of sysLogs.trim().split('\n').slice(-logCount)) {
      if (!line.trim()) continue
      // Parse journalctl format: 2024-01-15T12:34:56+00:00 hostname process[pid]: message
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

  // Read Claude Code logs from recent session transcripts (sync file reads are fine)
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

  // Read MCP server logs using spawnAsync
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

function startLogStream(sources: string[]): boolean {
  return logStreamManager.start(sources)
}

function stopLogStream(): boolean {
  return logStreamManager.stop()
}

// Ollama functions - All using native fetch (no curl execSync)
const OLLAMA_API = 'http://localhost:11434'

async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${OLLAMA_API}/api/version`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return { online: false }
    const data = (await response.json()) as { version: string }
    return { online: true, version: data.version }
  } catch {
    return { online: false }
  }
}

async function getOllamaModels(): Promise<OllamaModel[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(`${OLLAMA_API}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return []
    const data = (await response.json()) as {
      models?: Array<{
        name: string
        size: number
        digest: string
        modified_at: string
        details?: {
          format?: string
          family?: string
          parameter_size?: string
          quantization_level?: string
        }
      }>
    }
    if (!data.models) return []

    return data.models.map((m) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
      details: m.details
        ? {
            format: m.details.format,
            family: m.details.family,
            parameterSize: m.details.parameter_size,
            quantizationLevel: m.details.quantization_level,
          }
        : undefined,
    }))
  } catch {
    return []
  }
}

async function getRunningModels(): Promise<OllamaRunningModel[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`${OLLAMA_API}/api/ps`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return []
    const data = (await response.json()) as {
      models?: Array<{
        name: string
        model: string
        size: number
        digest: string
        expires_at: string
      }>
    }
    if (!data.models) return []

    return data.models.map((m) => ({
      name: m.name,
      model: m.model,
      size: m.size,
      digest: m.digest,
      expiresAt: m.expires_at,
    }))
  } catch {
    return []
  }
}

async function pullOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('Invalid model name:', model)
      return false
    }
    // Use spawnAsync with args array (SECURITY: no shell, 10 minute timeout)
    await spawnAsync('ollama', ['pull', safeModel], { timeout: 600000 })
    return true
  } catch (error) {
    console.error('Failed to pull model:', error)
    return false
  }
}

async function deleteOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('Invalid model name:', model)
      return false
    }
    // Use spawnAsync with args array (SECURITY: no shell)
    await spawnAsync('ollama', ['rm', safeModel], { timeout: 30000 })
    return true
  } catch (error) {
    console.error('Failed to delete model:', error)
    return false
  }
}

async function runOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('Invalid model name:', model)
      return false
    }
    // Use native fetch instead of curl (no shell)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const response = await fetch(`${OLLAMA_API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: safeModel, keep_alive: '10m' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    console.error('Failed to run model:', error)
    return false
  }
}

async function stopOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('Invalid model name:', model)
      return false
    }
    // Use native fetch instead of curl (no shell)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(`${OLLAMA_API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: safeModel, keep_alive: 0 }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    console.error('Failed to stop model:', error)
    return false
  }
}

// Agent functions - local simulation (Claude Flow MCP integration removed for responsiveness)
// In-memory agent state
const agentState: {
  agents: Agent[]
  swarm: SwarmInfo | null
  hiveMind: HiveMindInfo | null
} = {
  agents: [],
  swarm: null,
  hiveMind: null,
}

function generateAgentId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function getAgentList(): Agent[] {
  // Update agent statuses randomly for demo purposes
  agentState.agents.forEach((agent) => {
    if (agent.status !== 'terminated') {
      // Randomly update health slightly
      agent.health = Math.min(1, Math.max(0.1, agent.health + (Math.random() - 0.5) * 0.1))
      // Randomly toggle between idle/active/busy
      const rand = Math.random()
      if (rand < 0.1 && agent.status === 'active') agent.status = 'busy'
      else if (rand < 0.2 && agent.status === 'busy') agent.status = 'active'
    }
  })
  return agentState.agents
}

function spawnAgent(type: AgentType, name: string): Agent | null {
  // Create agent locally
  const agent: Agent = {
    id: generateAgentId(),
    name,
    type,
    status: 'idle',
    taskCount: 0,
    health: 1.0,
  }
  agentState.agents.push(agent)

  // Simulate agent becoming active after spawn
  setTimeout(() => {
    const idx = agentState.agents.findIndex((a) => a.id === agent.id)
    if (idx >= 0 && agentState.agents[idx].status === 'idle') {
      agentState.agents[idx].status = 'active'
    }
  }, 1000)

  return agent
}

function terminateAgent(id: string): boolean {
  const index = agentState.agents.findIndex((a) => a.id === id)
  if (index >= 0) {
    agentState.agents[index].status = 'terminated'
    // Remove after a short delay
    setTimeout(() => {
      agentState.agents = agentState.agents.filter((a) => a.id !== id)
    }, 500)
    return true
  }
  return false
}

function getSwarmStatus(): SwarmInfo | null {
  return agentState.swarm
}

function getHiveMindStatus(): HiveMindInfo | null {
  return agentState.hiveMind
}

function initSwarm(topology: string): boolean {
  agentState.swarm = {
    id: `swarm-${Date.now()}`,
    topology,
    agents: agentState.agents.map((a) => a.id),
    status: 'active',
    createdAt: Date.now(),
  }
  return true
}

function shutdownSwarm(): boolean {
  agentState.swarm = null
  return true
}

// Chat functions
function sendChatMessage(
  sender: WebContents,
  projectPath: string,
  message: string,
  messageId: string
): boolean {
  try {
    // Run claude command in background and stream output
    const claude = spawn('claude', ['--print', '-p', message], {
      cwd: projectPath,
      shell: true,
    })

    let fullResponse = ''

    claude.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      fullResponse += chunk
      sender.send('chat:response', {
        type: 'chunk',
        messageId,
        content: fullResponse,
      })
    })

    claude.stderr.on('data', (data: Buffer) => {
      console.error('Claude stderr:', data.toString())
    })

    claude.on('close', (code: number) => {
      if (code === 0) {
        sender.send('chat:response', {
          type: 'done',
          messageId,
          content: fullResponse,
        })
      } else {
        sender.send('chat:response', {
          type: 'error',
          messageId,
          error: `Claude exited with code ${code}`,
        })
      }
    })

    claude.on('error', (error: Error) => {
      sender.send('chat:response', {
        type: 'error',
        messageId,
        error: error.message,
      })
    })

    return true
  } catch (error) {
    console.error('Failed to send chat message:', error)
    sender.send('chat:response', {
      type: 'error',
      messageId,
      error: 'Failed to start Claude process',
    })
    return false
  }
}

// App settings file path
const APP_SETTINGS_PATH = join(HOME, '.config', 'claude-pilot', 'settings.json')

const defaultAppSettings: AppSettings = {
  theme: 'dark',
  accentColor: 'purple',
  sidebarCollapsed: false,
  terminalFont: 'jetbrains',
  terminalFontSize: 14,
  terminalScrollback: 10000,
  postgresHost: 'localhost',
  postgresPort: 5433,
  memgraphHost: 'localhost',
  memgraphPort: 7687,
  systemNotifications: true,
  soundEnabled: false,
  autoLock: false,
  clearOnExit: true,
}

function getAppSettings(): AppSettings {
  try {
    if (existsSync(APP_SETTINGS_PATH)) {
      const content = readFileSync(APP_SETTINGS_PATH, 'utf-8')
      const saved = JSON.parse(content)
      return { ...defaultAppSettings, ...saved }
    }
  } catch (error) {
    console.error('Failed to load app settings:', error)
  }
  return { ...defaultAppSettings }
}

function saveAppSettings(settings: AppSettings): boolean {
  try {
    // Ensure config directory exists
    const configDir = join(HOME, '.config', 'claude-pilot')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    writeFileSync(APP_SETTINGS_PATH, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save app settings:', error)
    return false
  }
}

// =============================================================================
// External Session Management
// =============================================================================

// Session watcher for real-time monitoring
class SessionWatchManager {
  private mainWindow: BrowserWindow | null = null
  private watcher: FSWatcher | null = null
  private sessionCache: Map<string, { mtime: number; session: ExternalSession }> = new Map()
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
      const session = await parseSessionFile(filePath)
      if (session && this.mainWindow) {
        this.mainWindow.webContents.send('session:updated', session)
      }
    } catch {
      // Ignore parse errors
    }
  }
}

const sessionWatchManager = new SessionWatchManager()

// Parse a single JSONL session file
function parseSessionFile(filePath: string): ExternalSession | null {
  try {
    if (!existsSync(filePath)) return null

    const content = readFileSync(filePath, 'utf-8')
    const lines = content
      .trim()
      .split('\n')
      .filter((l) => l.trim())
    if (lines.length === 0) return null

    // Parse first and last entries for metadata
    let firstEntry: Record<string, unknown> | null = null
    let _lastEntry: Record<string, unknown> | null = null
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
        if (!firstEntry) firstEntry = entry
        // Track last entry for potential future use (e.g., model detection)
        _lastEntry = entry

        // Count messages and tokens
        const type = entry.type as string
        if (type === 'user') {
          stats.userMessages++
          stats.messageCount++
        } else if (type === 'assistant') {
          stats.assistantMessages++
          stats.messageCount++

          // Extract model from assistant message (where it's actually stored)
          const message = entry.message as Record<string, unknown> | undefined
          if (message?.model && !detectedModel) {
            detectedModel = message.model as string
          }

          // Count tool_use blocks inside assistant message content
          const content = message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block &&
                typeof block === 'object' &&
                (block as Record<string, unknown>).type === 'tool_use'
              ) {
                stats.toolCalls++
              }
            }
          }
        } else if (type === 'tool-result') {
          // Also count standalone tool-result entries (legacy format)
          stats.toolCalls++
        }

        // Extract token usage and service tier
        const message = entry.message as Record<string, unknown> | undefined
        if (message?.usage) {
          const usage = message.usage as Record<string, unknown>
          stats.inputTokens += (usage.input_tokens as number) || 0
          stats.outputTokens += (usage.output_tokens as number) || 0
          stats.cachedTokens += (usage.cache_read_input_tokens as number) || 0
          // Extract service tier (standard, scale, pro, etc.)
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

    // Calculate estimated cost (rough approximation)
    // Claude 3.5 Sonnet: ~$3/MTok input, ~$15/MTok output
    stats.estimatedCost = stats.inputTokens * 0.000003 + stats.outputTokens * 0.000015

    // Parse timestamps with validation - fall back to file stats if invalid
    const parseTimestamp = (ts: unknown, fallback: number): number => {
      if (!ts || typeof ts !== 'string') return fallback
      const parsed = new Date(ts).getTime()
      return isNaN(parsed) ? fallback : parsed
    }

    // Use file modification time as primary source for lastActivity
    // This is more reliable than JSONL timestamps which may be missing or malformed
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
      // Enhanced metadata from JSONL
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

// Discover all external sessions
async function discoverExternalSessions(): Promise<ExternalSession[]> {
  const sessions: ExternalSession[] = []
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) return sessions

  try {
    // Use glob instead of find (pure JavaScript, no shell)
    const files = await glob('**/*.jsonl', {
      cwd: projectsDir,
      ignore: '**/subagents/**',
      absolute: true,
    })

    // Limit to 100 files
    const limitedFiles = files.slice(0, 100)

    // Parse each session file
    for (const filePath of limitedFiles) {
      const session = await parseSessionFile(filePath)
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

// Get messages from a session
async function getSessionMessages(sessionId: string, limit = 100): Promise<SessionMessage[]> {
  const projectsDir = join(CLAUDE_DIR, 'projects')
  const messages: SessionMessage[] = []

  try {
    // Use glob instead of find (pure JavaScript, no shell)
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

        // Extract content - could be string, array, or object
        let content: string | undefined
        const rawContent = message?.content ?? entry.content
        if (typeof rawContent === 'string') {
          content = rawContent
        } else if (Array.isArray(rawContent)) {
          // Extract text from content blocks
          content = rawContent
            .map((block: Record<string, unknown>) => {
              if (typeof block === 'string') return block
              if (block?.type === 'text' && block?.text) return block.text as string
              if (block?.type === 'tool_result' && block?.content) {
                return typeof block.content === 'string' ? block.content : '[Tool Result]'
              }
              if (block?.type === 'tool_use' && block?.name) {
                // Show tool invocation
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
            content = obj.text
          } else {
            content = JSON.stringify(rawContent)
          }
        }

        const sessionMessage: SessionMessage = {
          uuid: entry.uuid as string,
          parentUuid: entry.parentUuid as string | undefined,
          type,
          timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
          content,
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

// Detect active Claude processes and extract their metadata
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

function detectActiveClaudeProcesses(): ClaudeProcessInfo[] {
  const processes: ClaudeProcessInfo[] = []

  try {
    // Use findClaudeProcesses from process-utils (reads /proc, no shell)
    const claudeProcs = findClaudeProcesses()

    for (const proc of claudeProcs) {
      const cmdLine = proc.cmdline
      const args = cmdLine.split(/\s+/)

      // Skip if not a main claude process (filter out wrappers and subprocesses)
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

      // Detect active MCP servers by looking at child processes using process-utils
      const mcpServers: string[] = []
      const childProcs = getChildren(proc.pid)
      for (const child of childProcs) {
        const childCmd = child.cmdline
        // Extract MCP server names from process commands
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
        activeMcpServers: [...new Set(mcpServers)], // Dedupe
      })
    }
  } catch {
    // Process detection failed
  }

  return processes
}

// Match a session to its running process by working directory
function matchSessionToProcess(
  session: ExternalSession,
  processes: ClaudeProcessInfo[]
): SessionProcessInfo | undefined {
  // Try to match by working directory
  const sessionCwd = session.workingDirectory
  if (!sessionCwd) return undefined

  // Look for a process whose cwd or project path matches
  for (const proc of processes) {
    // Check if process is working on this project
    // The session's workingDirectory should match where the process was launched
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

// Get active sessions (modified in last 5 minutes) with process info
async function getActiveSessions(): Promise<ExternalSession[]> {
  const sessions = await discoverExternalSessions()
  const activeSessions = sessions.filter((s) => s.isActive)

  // Detect running Claude processes
  const processes = detectActiveClaudeProcesses()

  // Enrich active sessions with process info
  for (const session of activeSessions) {
    const processInfo = matchSessionToProcess(session, processes)
    if (processInfo) {
      session.processInfo = processInfo
    }
  }

  return activeSessions
}

// IPC Handlers for External Sessions
ipcMain.handle('sessions:discover', () => {
  return discoverExternalSessions()
})

ipcMain.handle('sessions:get', async (_event, sessionId: string) => {
  const sessions = await discoverExternalSessions()
  return sessions.find((s) => s.id === sessionId) || null
})

ipcMain.handle('sessions:getMessages', (_event, sessionId: string, limit?: number) => {
  return getSessionMessages(sessionId, limit)
})

ipcMain.handle('sessions:watch', (_event, enable: boolean) => {
  if (enable) {
    return sessionWatchManager.start()
  } else {
    return sessionWatchManager.stop()
  }
})

ipcMain.handle('sessions:getActive', () => {
  return getActiveSessions()
})

// Transcript handlers - streaming transcript parser
ipcMain.handle('transcript:parse', async (_event, filePath: string, options?: ParseOptions) => {
  try {
    return await transcriptService.parseAll(filePath, options)
  } catch (error) {
    console.error('Failed to parse transcript:', error)
    return []
  }
})

ipcMain.handle('transcript:stats', async (_event, filePath: string): Promise<TranscriptStats> => {
  try {
    return await transcriptService.getStats(filePath)
  } catch (error) {
    console.error('Failed to get transcript stats:', error)
    return {
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      fileSize: 0,
      parseTime: 0,
    }
  }
})

ipcMain.handle('transcript:last', async (_event, filePath: string, count: number) => {
  try {
    return await transcriptService.getLastMessages(filePath, count)
  } catch (error) {
    console.error('Failed to get last messages:', error)
    return []
  }
})

ipcMain.handle('transcript:watch', (_event, filePath: string, enable: boolean) => {
  if (enable) {
    transcriptService.watchTranscript(filePath)
    return true
  } else {
    transcriptService.unwatchTranscript(filePath)
    return true
  }
})

// ============================================================================
// BEADS WORK TRACKING HANDLERS
// ============================================================================

/**
 * Parse bd list output into Bead objects
 * Format: deploy-xxxx [P0] [type] status - title
 */
function parseBeadListOutput(output: string): Bead[] {
  const beads: Bead[] = []
  const lines = output.split('\n').filter((line) => line.trim())

  for (const line of lines) {
    // Match: deploy-xxxx [P0] [type] status - title
    const match = line.match(/^(\S+)\s+\[P(\d)\]\s+\[(\w+)\]\s+(\w+)\s+-\s+(.+)$/)
    if (match) {
      const [, id, priority, type, status, title] = match
      beads.push({
        id,
        title: title.trim(),
        status: status as BeadStatus,
        priority: parseInt(priority) as BeadPriority,
        type: type as BeadType,
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
      })
    }
  }

  return beads
}

/**
 * Parse bd show output for a single bead
 */
function parseBeadShowOutput(output: string): Bead | null {
  const lines = output.split('\n').filter((line) => line.trim())
  if (lines.length === 0) return null

  // First line: id: title
  const titleMatch = lines[0].match(/^(\S+):\s+(.+)$/)
  if (!titleMatch) return null

  const [, id, title] = titleMatch

  // Parse remaining lines
  let status: BeadStatus = 'open'
  let priority: BeadPriority = 2
  let type: BeadType = 'task'
  let created = new Date().toISOString().split('T')[0]
  let updated = new Date().toISOString().split('T')[0]
  let description: string | undefined
  let assignee: string | undefined
  const blockedBy: string[] = []
  const blocks: string[] = []

  for (const line of lines.slice(1)) {
    if (line.startsWith('Status:')) {
      status = line.replace('Status:', '').trim() as BeadStatus
    } else if (line.startsWith('Priority:')) {
      const p = line.replace('Priority:', '').trim()
      priority = parseInt(p.replace('P', '')) as BeadPriority
    } else if (line.startsWith('Type:')) {
      type = line.replace('Type:', '').trim() as BeadType
    } else if (line.startsWith('Created:')) {
      created = line.replace('Created:', '').trim().split(' ')[0]
    } else if (line.startsWith('Updated:')) {
      updated = line.replace('Updated:', '').trim().split(' ')[0]
    } else if (line.startsWith('Assignee:')) {
      assignee = line.replace('Assignee:', '').trim()
    } else if (line.startsWith('Description:')) {
      description = line.replace('Description:', '').trim()
    } else if (line.startsWith('Blocked by:')) {
      const deps = line.replace('Blocked by:', '').trim()
      blockedBy.push(
        ...deps
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      )
    } else if (line.startsWith('Blocks:')) {
      const deps = line.replace('Blocks:', '').trim()
      blocks.push(
        ...deps
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      )
    }
  }

  return {
    id,
    title,
    status,
    priority,
    type,
    created,
    updated,
    description,
    assignee,
    blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    blocks: blocks.length > 0 ? blocks : undefined,
  }
}

/**
 * Parse bd stats output
 */
function parseBeadStatsOutput(output: string): BeadStats {
  const stats: BeadStats = {
    total: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
    blocked: 0,
    ready: 0,
  }

  const lines = output.split('\n')
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(\d+(?:\.\d+)?)\s*(\w*)/)
    if (match) {
      const [, key, value] = match
      const cleanKey = key.toLowerCase().trim()
      const numValue = parseFloat(value)

      if (cleanKey.includes('total')) stats.total = numValue
      else if (cleanKey.includes('open')) stats.open = numValue
      else if (cleanKey.includes('in progress')) stats.inProgress = numValue
      else if (cleanKey.includes('closed')) stats.closed = numValue
      else if (cleanKey.includes('blocked')) stats.blocked = numValue
      else if (cleanKey.includes('ready')) stats.ready = numValue
      else if (cleanKey.includes('avg lead')) stats.avgLeadTime = numValue
    }
  }

  return stats
}

/**
 * Execute bd command safely
 */
function executeBdCommand(args: string[], cwd?: string): string {
  return new Promise((resolve, reject) => {
    const bdProcess = spawn('bd', args, {
      cwd: cwd || HOME,
      env: process.env,
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    bdProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    bdProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    bdProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `bd command failed with code ${code}`))
      }
    })

    bdProcess.on('error', (err) => {
      reject(err)
    })
  })
}

// Beads IPC Handlers
ipcMain.handle('beads:list', async (_event, filter?: BeadListFilter) => {
  try {
    const args = ['list']

    // Add status filter
    if (filter?.status && filter.status !== 'all') {
      args.push(`--status=${filter.status}`)
    }

    const output = await executeBdCommand(args)
    let beads = parseBeadListOutput(output)

    // Apply additional filters client-side
    if (filter?.priority && filter.priority !== 'all') {
      beads = beads.filter((b) => b.priority === filter.priority)
    }
    if (filter?.type && filter.type !== 'all') {
      beads = beads.filter((b) => b.type === filter.type)
    }
    if (filter?.search) {
      const search = filter.search.toLowerCase()
      beads = beads.filter(
        (b) => b.title.toLowerCase().includes(search) || b.id.toLowerCase().includes(search)
      )
    }
    if (filter?.limit) {
      beads = beads.slice(0, filter.limit)
    }

    return beads
  } catch (error) {
    console.error('Failed to list beads:', error)
    return []
  }
})

ipcMain.handle('beads:get', async (_event, id: string) => {
  try {
    // Sanitize id
    const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '')
    const output = await executeBdCommand(['show', safeId])
    return parseBeadShowOutput(output)
  } catch (error) {
    console.error('Failed to get bead:', error)
    return null
  }
})

ipcMain.handle('beads:stats', async () => {
  try {
    const output = await executeBdCommand(['stats'])
    return parseBeadStatsOutput(output)
  } catch (error) {
    console.error('Failed to get beads stats:', error)
    return {
      total: 0,
      open: 0,
      inProgress: 0,
      closed: 0,
      blocked: 0,
      ready: 0,
    }
  }
})

ipcMain.handle('beads:create', async (_event, params: BeadCreateParams) => {
  try {
    const args = ['create']

    // Sanitize and add parameters
    args.push(`--title="${params.title.replace(/"/g, '\\"')}"`)
    args.push(`--type=${params.type}`)
    args.push(`--priority=${params.priority}`)

    if (params.description) {
      args.push(`--description="${params.description.replace(/"/g, '\\"')}"`)
    }
    if (params.assignee) {
      args.push(`--assignee=${params.assignee.replace(/[^a-zA-Z0-9._-]/g, '')}`)
    }

    const output = await executeBdCommand(args)

    // Parse created bead id from output
    const idMatch = output.match(/Created:\s*(\S+)/)
    if (idMatch) {
      return parseBeadShowOutput(await executeBdCommand(['show', idMatch[1]]))
    }

    return null
  } catch (error) {
    console.error('Failed to create bead:', error)
    return null
  }
})

ipcMain.handle('beads:update', async (_event, id: string, params: BeadUpdateParams) => {
  try {
    const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '')
    const args = ['update', safeId]

    if (params.status) {
      args.push(`--status=${params.status}`)
    }
    if (params.priority !== undefined) {
      args.push(`--priority=${params.priority}`)
    }
    if (params.assignee) {
      args.push(`--assignee=${params.assignee.replace(/[^a-zA-Z0-9._-]/g, '')}`)
    }

    await executeBdCommand(args)
    return true
  } catch (error) {
    console.error('Failed to update bead:', error)
    return false
  }
})

ipcMain.handle('beads:close', async (_event, id: string, reason?: string) => {
  try {
    const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '')
    const args = ['close', safeId]

    if (reason) {
      args.push(`--reason="${reason.replace(/"/g, '\\"')}"`)
    }

    await executeBdCommand(args)
    return true
  } catch (error) {
    console.error('Failed to close bead:', error)
    return false
  }
})

ipcMain.handle('beads:ready', async () => {
  try {
    const output = await executeBdCommand(['ready'])
    return parseBeadListOutput(output)
  } catch (error) {
    console.error('Failed to get ready beads:', error)
    return []
  }
})

ipcMain.handle('beads:blocked', async () => {
  try {
    const output = await executeBdCommand(['blocked'])
    return parseBeadListOutput(output)
  } catch (error) {
    console.error('Failed to get blocked beads:', error)
    return []
  }
})

ipcMain.handle('beads:hasBeads', (_event, projectPath: string) => {
  try {
    // Check if .beads directory exists in project
    const beadsPath = join(projectPath, '.beads')
    return existsSync(beadsPath)
  } catch {
    return false
  }
})

// ============================================================================
// PGVECTOR EMBEDDINGS HANDLERS
// ============================================================================

// Default pgvector config stored in ~/.config/claude-pilot/pgvector.json
const PGVECTOR_CONFIG_PATH = join(HOME, '.config', 'claude-pilot', 'pgvector.json')

const defaultPgVectorConfig: PgVectorAutoEmbedConfig = {
  enableLearnings: true,
  enableSessions: false,
  enableCode: false,
  enableCommits: false,
  embeddingModel: 'nomic-embed-text',
  batchSize: 10,
  concurrentRequests: 2,
  rateLimit: 100, // requests per minute
}

function getPgVectorConfig(): PgVectorAutoEmbedConfig {
  try {
    if (existsSync(PGVECTOR_CONFIG_PATH)) {
      return {
        ...defaultPgVectorConfig,
        ...JSON.parse(readFileSync(PGVECTOR_CONFIG_PATH, 'utf-8')),
      }
    }
  } catch (error) {
    console.error('Failed to load pgvector config:', error)
  }
  return { ...defaultPgVectorConfig }
}

function savePgVectorConfig(config: PgVectorAutoEmbedConfig): boolean {
  try {
    const configDir = join(HOME, '.config', 'claude-pilot')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(PGVECTOR_CONFIG_PATH, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save pgvector config:', error)
    return false
  }
}

// Check if pgvector extension is enabled
async function checkPgVectorStatus(): Promise<PgVectorStatus> {
  const config = getPgVectorConfig()
  const status: PgVectorStatus = {
    enabled: false,
    defaultDimensions: 768, // nomic-embed-text dimensions
    embeddingModel: config.embeddingModel,
    collections: [],
  }

  try {
    await postgresService.connect()

    // Check if pgvector extension exists
    const extResult = await postgresService.query<{ version: string }>(
      `SELECT extversion as version FROM pg_extension WHERE extname = 'vector'`
    )

    if (extResult.length > 0) {
      status.enabled = true
      status.version = extResult[0].version
    }

    // Get all tables with vector columns
    if (status.enabled) {
      const tableResult = await postgresService.query<{
        table_name: string
        column_name: string
        dimensions: number
      }>(
        `SELECT c.relname as table_name, a.attname as column_name,
                CASE WHEN typname = 'vector' THEN atttypmod ELSE 0 END as dimensions
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid
         JOIN pg_type t ON t.oid = a.atttypid
         WHERE t.typname = 'vector' AND c.relkind = 'r'
         ORDER BY c.relname`
      )

      for (const row of tableResult) {
        // Get count and size for each table
        const countResult = await postgresService.queryScalar<number>(
          `SELECT COUNT(*) FROM "${row.table_name}"`
        )

        const sizeResult = await postgresService.queryScalar<string>(
          `SELECT pg_size_pretty(pg_table_size($1))`,
          [row.table_name]
        )

        // Check for index
        const indexResult = await postgresService.query<{
          indexname: string
          indexdef: string
        }>(
          `SELECT indexname, indexdef FROM pg_indexes
           WHERE tablename = $1 AND indexdef LIKE '%vector%'`,
          [row.table_name]
        )

        let indexType: VectorIndexType = 'none'
        let indexName: string | undefined
        if (indexResult.length > 0) {
          indexName = indexResult[0].indexname
          if (indexResult[0].indexdef.toLowerCase().includes('hnsw')) {
            indexType = 'hnsw'
          } else if (indexResult[0].indexdef.toLowerCase().includes('ivfflat')) {
            indexType = 'ivfflat'
          }
        }

        status.collections.push({
          name: row.table_name,
          tableName: row.table_name,
          vectorCount: countResult || 0,
          dimensions: row.dimensions || 768,
          indexType,
          indexName,
          sizeBytes: parseInt(sizeResult?.replace(/[^\d]/g, '') || '0') * 1024, // rough estimate
        })
      }
    }
  } catch (error) {
    console.error('Failed to check pgvector status:', error)
  }

  return status
}

// Search vectors using pgvector
async function searchPgVectors(
  query: string,
  tableName?: string,
  limit = 10,
  threshold = 0.5
): Promise<PgVectorSearchResult[]> {
  const results: PgVectorSearchResult[] = []

  try {
    // Generate embedding using Ollama
    const embedding = await generateEmbedding(query)
    if (!embedding || embedding.length === 0) {
      console.info('[pgvector] No embedding generated, falling back to text search')
      return results
    }

    await postgresService.connect()

    // If no table specified, search all tables with vectors
    let tables: string[] = []
    if (tableName) {
      tables = [tableName]
    } else {
      const tablesResult = await postgresService.query<{ table_name: string }>(
        `SELECT DISTINCT c.relname as table_name
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid
         JOIN pg_type t ON t.oid = a.atttypid
         WHERE t.typname = 'vector' AND c.relkind = 'r'`
      )
      tables = tablesResult.map((r) => r.table_name)
    }

    for (const table of tables) {
      try {
        // Find the vector column and content column
        const colsResult = await postgresService.query<{
          column_name: string
          data_type: string
        }>(
          `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_name = $1`,
          [table]
        )

        const vectorCol =
          colsResult.find((c) => c.data_type === 'USER-DEFINED')?.column_name || 'embedding'
        const contentCol =
          colsResult.find((c) => c.column_name === 'content' || c.column_name === 'text')
            ?.column_name || 'content'
        const idCol = colsResult.find((c) => c.column_name === 'id')?.column_name || 'id'

        // Cosine similarity search
        const embeddingStr = `[${embedding.join(',')}]`
        const searchResult = await postgresService.query<{
          id: string | number
          content: string
          similarity: number
        }>(
          `SELECT ${idCol} as id, ${contentCol} as content,
                  1 - (${vectorCol} <=> $1::vector) as similarity
           FROM "${table}"
           WHERE ${vectorCol} IS NOT NULL
           ORDER BY ${vectorCol} <=> $1::vector
           LIMIT $2`,
          [embeddingStr, limit]
        )

        for (const row of searchResult) {
          if (row.similarity >= threshold) {
            results.push({
              id: row.id,
              content: row.content,
              similarity: Math.round(row.similarity * 1000) / 1000,
              tableName: table,
            })
          }
        }
      } catch (error) {
        console.error(`[pgvector] Failed to search table ${table}:`, error)
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity)
    return results.slice(0, limit)
  } catch (error) {
    console.error('[pgvector] Search failed:', error)
    return results
  }
}

// Create or rebuild index on a vector table
async function createPgVectorIndex(
  tableName: string,
  config: PgVectorIndexConfig
): Promise<boolean> {
  try {
    await postgresService.connect()

    // Find the vector column
    const colsResult = await postgresService.query<{ column_name: string }>(
      `SELECT a.attname as column_name
       FROM pg_class c
       JOIN pg_attribute a ON a.attrelid = c.oid
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE c.relname = $1 AND t.typname = 'vector'`,
      [tableName]
    )

    if (colsResult.length === 0) {
      console.error('[pgvector] No vector column found in table:', tableName)
      return false
    }

    const vectorCol = colsResult[0].column_name
    const indexName = `idx_${tableName}_${vectorCol}_${config.type}`

    // Drop existing index if any
    await postgresService.queryRaw(`DROP INDEX IF EXISTS "${indexName}"`)

    if (config.type === 'none') {
      return true // Just dropped the index
    }

    // Build index creation query
    let indexSql: string
    if (config.type === 'hnsw') {
      const m = config.m || 16
      const efConstruction = config.efConstruction || 64
      indexSql = `CREATE INDEX "${indexName}" ON "${tableName}"
                  USING hnsw ("${vectorCol}" vector_cosine_ops)
                  WITH (m = ${m}, ef_construction = ${efConstruction})`
    } else {
      const lists = config.lists || 100
      indexSql = `CREATE INDEX "${indexName}" ON "${tableName}"
                  USING ivfflat ("${vectorCol}" vector_cosine_ops)
                  WITH (lists = ${lists})`
    }

    await postgresService.queryRaw(indexSql)
    return true
  } catch (error) {
    console.error('[pgvector] Failed to create index:', error)
    return false
  }
}

// Vacuum analyze a table for optimal performance
async function vacuumPgVectorTable(tableName: string): Promise<boolean> {
  try {
    await postgresService.connect()
    // VACUUM cannot be run in a transaction, so we use a raw query
    await postgresService.queryRaw(`VACUUM ANALYZE "${tableName}"`)
    return true
  } catch (error) {
    console.error('[pgvector] Failed to vacuum table:', error)
    return false
  }
}

// IPC Handlers for pgvector
ipcMain.handle('pgvector:status', (): PgVectorStatus => {
  return checkPgVectorStatus()
})

ipcMain.handle(
  'pgvector:search',
  (
    _event,
    query: string,
    table?: string,
    limit?: number,
    threshold?: number
  ): Promise<PgVectorSearchResult[]> => {
    return searchPgVectors(query, table, limit || 10, threshold || 0.5)
  }
)

ipcMain.handle('pgvector:embed', (_event, text: string): number[] | null => {
  return generateEmbedding(text)
})

ipcMain.handle('pgvector:collections', async (): Promise<PgVectorCollection[]> => {
  const status = await checkPgVectorStatus()
  return status.collections
})

ipcMain.handle(
  'pgvector:createIndex',
  (_event, table: string, config: PgVectorIndexConfig): Promise<boolean> => {
    return createPgVectorIndex(table, config)
  }
)

ipcMain.handle('pgvector:rebuildIndex', async (_event, table: string): Promise<boolean> => {
  // Get current index config and rebuild
  const status = await checkPgVectorStatus()
  const collection = status.collections.find((c) => c.tableName === table)
  if (!collection || collection.indexType === 'none') {
    return false
  }
  return createPgVectorIndex(table, { type: collection.indexType })
})

ipcMain.handle('pgvector:vacuum', (_event, table: string): boolean => {
  return vacuumPgVectorTable(table)
})

ipcMain.handle('pgvector:getAutoConfig', (): PgVectorAutoEmbedConfig => {
  return getPgVectorConfig()
})

ipcMain.handle(
  'pgvector:setAutoConfig',
  (_event, config: PgVectorAutoEmbedConfig): Promise<boolean> => {
    return savePgVectorConfig(config)
  }
)

// ============================================================================
// PREDICTIVE CONTEXT HANDLERS
// ============================================================================

ipcMain.handle(
  'context:predict',
  (_event, prompt: string, projectPath: string): Promise<FilePrediction[]> => {
    return predictiveContextService.predict(prompt, projectPath)
  }
)

ipcMain.handle('context:patterns', (_event, projectPath: string): Promise<FileAccessPattern[]> => {
  return predictiveContextService.getPatterns(projectPath)
})

ipcMain.handle('context:stats', (): PredictiveContextStats => {
  return predictiveContextService.getStats()
})

ipcMain.handle(
  'context:recordAccess',
  (_event, path: string, keywords: string[]): Promise<void> => {
    predictiveContextService.recordAccess(path, keywords)
  }
)

ipcMain.handle('context:getConfig', (): PredictiveContextConfig => {
  return predictiveContextService.getConfig()
})

ipcMain.handle('context:setConfig', (_event, config: PredictiveContextConfig): Promise<boolean> => {
  return predictiveContextService.setConfig(config)
})

ipcMain.handle('context:clearCache', (): boolean => {
  return predictiveContextService.clearCache()
})

// ============================================================================
// PLAN HANDLERS (Autonomous execution)
// ============================================================================

ipcMain.handle('plans:list', (_event, projectPath?: string): Plan[] => {
  return planService.list(projectPath)
})

ipcMain.handle('plans:get', (_event, id: string): Plan | null => {
  return planService.get(id)
})

ipcMain.handle('plans:create', (_event, params: PlanCreateParams): Plan => {
  return planService.create(params)
})

ipcMain.handle('plans:update', (_event, id: string, updates: Partial<Plan>): boolean => {
  return planService.update(id, updates)
})

ipcMain.handle('plans:delete', (_event, id: string): boolean => {
  return planService.delete(id)
})

ipcMain.handle('plans:execute', (_event, id: string): boolean => {
  return planService.execute(id)
})

ipcMain.handle('plans:pause', (_event, id: string): boolean => {
  return planService.pause(id)
})

ipcMain.handle('plans:resume', (_event, id: string): boolean => {
  return planService.resume(id)
})

ipcMain.handle('plans:cancel', (_event, id: string): boolean => {
  return planService.cancel(id)
})

ipcMain.handle(
  'plans:stepComplete',
  (_event, planId: string, stepId: string, output?: string): Promise<boolean> => {
    return planService.stepComplete(planId, stepId, output)
  }
)

ipcMain.handle(
  'plans:stepFail',
  (_event, planId: string, stepId: string, error: string): Promise<boolean> => {
    return planService.stepFail(planId, stepId, error)
  }
)

ipcMain.handle('plans:stats', (): PlanExecutionStats => {
  return planService.getStats()
})

// ============================================================================
// CONVERSATION BRANCHING - Git-like branching for conversations
// ============================================================================

ipcMain.handle('branches:list', (_event, sessionId: string): ConversationBranch[] => {
  return branchService.list(sessionId)
})

ipcMain.handle('branches:get', (_event, branchId: string): ConversationBranch | null => {
  return branchService.get(branchId)
})

ipcMain.handle('branches:getTree', (_event, sessionId: string): BranchTree | null => {
  return branchService.getTree(sessionId)
})

ipcMain.handle(
  'branches:create',
  (_event, params: BranchCreateParams): ConversationBranch | null => {
    return branchService.create(params)
  }
)

ipcMain.handle('branches:delete', (_event, branchId: string): boolean => {
  return branchService.delete(branchId)
})

ipcMain.handle('branches:rename', (_event, branchId: string, name: string): boolean => {
  return branchService.rename(branchId, name)
})

ipcMain.handle('branches:switch', (_event, branchId: string): boolean => {
  return branchService.switch(branchId)
})

ipcMain.handle(
  'branches:addMessage',
  (_event, branchId: string, message: ConversationMessage): Promise<boolean> => {
    return branchService.addMessage(branchId, message)
  }
)

ipcMain.handle(
  'branches:diff',
  (_event, branchA: string, branchB: string): Promise<BranchDiff | null> => {
    return branchService.diff(branchA, branchB)
  }
)

ipcMain.handle('branches:merge', (_event, params: BranchMergeParams): boolean => {
  return branchService.merge(params)
})

ipcMain.handle('branches:abandon', (_event, branchId: string): boolean => {
  return branchService.abandon(branchId)
})

ipcMain.handle('branches:stats', (_event, sessionId?: string): BranchStats => {
  return branchService.stats(sessionId)
})

ipcMain.handle('branches:getActiveBranch', (_event, sessionId: string): string | null => {
  return branchService.getActiveBranch(sessionId)
})

// ============================================================================
// AUTO-UPDATE - electron-updater handlers
// ============================================================================

// Track update state
const updateState = {
  checking: false,
  downloading: false,
  downloadProgress: 0,
  updateAvailable: false,
  updateDownloaded: false,
  latestVersion: undefined as string | undefined,
  error: undefined as string | undefined,
}

ipcMain.handle(
  'update:check',
  async (): Promise<{
    updateAvailable: boolean
    updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string | null }
    error?: string
  }> => {
    try {
      updateState.checking = true
      updateState.error = undefined
      const result = await autoUpdater.checkForUpdates()

      if (result?.updateInfo) {
        updateState.updateAvailable = true
        updateState.latestVersion = result.updateInfo.version
        return {
          updateAvailable: true,
          updateInfo: {
            version: result.updateInfo.version,
            releaseDate: result.updateInfo.releaseDate,
            releaseNotes:
              typeof result.updateInfo.releaseNotes === 'string'
                ? result.updateInfo.releaseNotes
                : null,
          },
        }
      }

      return { updateAvailable: false }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed'
      updateState.error = message
      console.error('[AutoUpdate] Check failed:', message)
      return { updateAvailable: false, error: message }
    } finally {
      updateState.checking = false
    }
  }
)

ipcMain.handle('update:download', async (): Promise<boolean> => {
  try {
    updateState.downloading = true
    updateState.downloadProgress = 0
    updateState.error = undefined

    // Set up progress listener
    autoUpdater.on('download-progress', (progress) => {
      updateState.downloadProgress = progress.percent
      // Notify renderer of progress
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('update:progress', {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        })
      })
    })

    await autoUpdater.downloadUpdate()
    updateState.updateDownloaded = true
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed'
    updateState.error = message
    console.error('[AutoUpdate] Download failed:', message)
    return false
  } finally {
    updateState.downloading = false
  }
})

ipcMain.handle('update:install', (): void => {
  // Quit and install the update
  autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle(
  'update:getStatus',
  (): {
    checking: boolean
    downloading: boolean
    downloadProgress?: number
    updateAvailable: boolean
    updateDownloaded: boolean
    currentVersion: string
    latestVersion?: string
    error?: string
  } => {
    return {
      ...updateState,
      currentVersion: app.getVersion(),
    }
  }
)

// Observability - OpenTelemetry handlers (deploy-rjvh)
ipcMain.handle(
  'observability:init',
  async (
    _event,
    config?: {
      serviceName?: string
      serviceVersion?: string
      environment?: string
      sampleRate?: number
      enableAutoInstrumentation?: boolean
      maxSpansPerTrace?: number
      maxAttributeLength?: number
      enabledInstrumentations?: string[]
    }
  ): Promise<void> => {
    await observabilityService.initialize(config)
  }
)

ipcMain.handle(
  'observability:startTrace',
  (
    _event,
    name: string,
    attributes?: Record<string, string | number | boolean | string[] | number[] | boolean[]>
  ) => {
    return observabilityService.startTrace(name, attributes)
  }
)

ipcMain.handle(
  'observability:startSpan',
  (
    _event,
    name: string,
    kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer' = 'internal',
    attributes?: Record<string, string | number | boolean | string[] | number[] | boolean[]>
  ): string => {
    return observabilityService.startSpan(name, kind, undefined, attributes)
  }
)

ipcMain.handle(
  'observability:endSpan',
  (
    _event,
    spanId: string,
    status?: { code: 'unset' | 'ok' | 'error'; message?: string },
    attributes?: Record<string, string | number | boolean | string[] | number[] | boolean[]>
  ): void => {
    observabilityService.endSpan(spanId, status, attributes)
  }
)

ipcMain.handle(
  'observability:recordException',
  (_event, spanId: string, error: { name: string; message: string; stack?: string }): void => {
    const err = new Error(error.message)
    err.name = error.name
    if (error.stack) err.stack = error.stack
    observabilityService.recordException(spanId, err)
  }
)

ipcMain.handle(
  'observability:addEvent',
  (
    _event,
    spanId: string,
    name: string,
    attributes?: Record<string, string | number | boolean | string[] | number[] | boolean[]>
  ): void => {
    observabilityService.addSpanEvent(spanId, name, attributes)
  }
)

ipcMain.handle('observability:getMetrics', () => {
  return observabilityService.getMetrics()
})

ipcMain.handle('observability:getStats', () => {
  return observabilityService.getStats()
})

ipcMain.handle('observability:getConfig', () => {
  return observabilityService.getConfig()
})

ipcMain.handle(
  'observability:updateConfig',
  (
    _event,
    config: Partial<{
      serviceName: string
      serviceVersion: string
      environment: string
      sampleRate: number
      enableAutoInstrumentation: boolean
      maxSpansPerTrace: number
      maxAttributeLength: number
      enabledInstrumentations: string[]
    }>
  ): void => {
    observabilityService.updateConfig(config)
  }
)

ipcMain.handle(
  'observability:recordMetric',
  (
    _event,
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'histogram',
    attributes?: Record<string, string>
  ): void => {
    switch (type) {
      case 'counter':
        observabilityService.incrementCounter(name, attributes, value)
        break
      case 'gauge':
        observabilityService.setGauge(name, value, attributes)
        break
      case 'histogram':
        observabilityService.recordHistogram(name, value, attributes)
        break
      default:
        // Unknown metric type - ignore
        break
    }
  }
)

ipcMain.handle('observability:getActiveSpans', () => {
  return observabilityService.getActiveSpans()
})

ipcMain.handle('observability:getRecentSpans', (_event, limit?: number) => {
  return observabilityService.getRecentSpans(limit)
})

// Tree-sitter - Code parsing handlers (deploy-4u2e)
ipcMain.handle(
  'treesitter:init',
  async (
    _event,
    config?: {
      maxFileSize?: number
      excludePatterns?: string[]
      includeExtensions?: string[]
      maxDepth?: number
      parallelParsing?: boolean
      cacheResults?: boolean
    }
  ): Promise<void> => {
    await treeSitterService.initialize(config)
  }
)

ipcMain.handle('treesitter:parseFile', (_event, filePath: string) => {
  return treeSitterService.parseFile(filePath)
})

ipcMain.handle('treesitter:indexCodebase', async (_event, rootPath: string) => {
  const index = await treeSitterService.indexCodebase(rootPath)
  return index.stats
})

ipcMain.handle(
  'treesitter:searchSymbols',
  (
    _event,
    query: string,
    options?: {
      kind?: string
      rootPath?: string
      limit?: number
      caseSensitive?: boolean
    }
  ) => {
    return treeSitterService.searchSymbols(
      query,
      options as Parameters<typeof treeSitterService.searchSymbols>[1]
    )
  }
)

ipcMain.handle('treesitter:findDefinition', (_event, symbolName: string, rootPath?: string) => {
  return treeSitterService.findDefinition(symbolName, rootPath)
})

ipcMain.handle('treesitter:findReferences', (_event, symbolName: string, rootPath?: string) => {
  return treeSitterService.findReferences(symbolName, rootPath)
})

ipcMain.handle('treesitter:getFileOutline', (_event, filePath: string) => {
  return treeSitterService.getFileOutline(filePath)
})

ipcMain.handle('treesitter:getCodebaseStructure', (_event, rootPath: string) => {
  return treeSitterService.getCodebaseStructure(rootPath)
})

ipcMain.handle('treesitter:clearCache', (_event, filePath?: string) => {
  treeSitterService.clearCache(filePath)
})

ipcMain.handle('treesitter:clearIndex', (_event, rootPath: string) => {
  treeSitterService.clearIndex(rootPath)
})

ipcMain.handle('treesitter:getStats', () => {
  return treeSitterService.getStats()
})

ipcMain.handle('treesitter:getConfig', () => {
  return treeSitterService.getConfig()
})

ipcMain.handle(
  'treesitter:updateConfig',
  (
    _event,
    config: Partial<{
      maxFileSize: number
      excludePatterns: string[]
      includeExtensions: string[]
      maxDepth: number
      parallelParsing: boolean
      cacheResults: boolean
    }>
  ): void => {
    treeSitterService.updateConfig(config)
  }
)

// ============================================================================
// AUTO-EMBEDDING PIPELINE HANDLERS
// ============================================================================

import {
  getEmbeddingManager,
  initializeEmbeddingManager,
  shutdownEmbeddingManager,
  type EmbeddingManagerStatus,
} from '../services/embeddings'
import type {
  PipelineMetrics,
  SearchResult,
  SearchOptions,
  ContentType,
  ChunkMetadata,
  DeadLetterItem,
  OllamaConfig,
} from '../services/embeddings/types'

// Initialize embedding manager on startup
let embeddingManagerInitialized = false

async function ensureEmbeddingManager() {
  if (!embeddingManagerInitialized) {
    await initializeEmbeddingManager({
      pgvectorUrl: 'postgresql://localhost:5433/claude_memory',
      qdrantUrl: 'http://localhost:6333',
      autoStart: false, // Don't auto-start, let user control
    })
    embeddingManagerInitialized = true
  }
  return getEmbeddingManager()
}

ipcMain.handle('embedding:status', async (): Promise<EmbeddingManagerStatus> => {
  const manager = await ensureEmbeddingManager()
  return manager.getStatus()
})

ipcMain.handle('embedding:metrics', async (): Promise<PipelineMetrics> => {
  const manager = await ensureEmbeddingManager()
  return manager.getMetrics()
})

ipcMain.handle('embedding:startAutoEmbed', async (): Promise<boolean> => {
  const manager = await ensureEmbeddingManager()
  return manager.startAutoEmbedding()
})

ipcMain.handle('embedding:stopAutoEmbed', async (): Promise<void> => {
  const manager = await ensureEmbeddingManager()
  await manager.stopAutoEmbedding()
})

ipcMain.handle(
  'embedding:search',
  async (_event, query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    const manager = await ensureEmbeddingManager()
    return manager.search(query, options)
  }
)

ipcMain.handle(
  'embedding:embedAndStore',
  async (
    _event,
    content: string,
    contentType: ContentType,
    metadata: Partial<ChunkMetadata>
  ): Promise<number> => {
    const manager = await ensureEmbeddingManager()
    return manager.embedAndStore(content, contentType, metadata)
  }
)

ipcMain.handle('embedding:embed', async (_event, text: string): Promise<number[] | null> => {
  const manager = await ensureEmbeddingManager()
  const result = await manager.embed(text)
  return result?.embedding || null
})

ipcMain.handle('embedding:cacheStats', async () => {
  const manager = await ensureEmbeddingManager()
  return manager.getCacheStats()
})

ipcMain.handle('embedding:vectorStoreStats', async () => {
  const manager = await ensureEmbeddingManager()
  return manager.getVectorStoreStats()
})

ipcMain.handle('embedding:resetMetrics', async (): Promise<void> => {
  const manager = await ensureEmbeddingManager()
  manager.resetMetrics()
})

ipcMain.handle('embedding:deadLetterQueue', async (): Promise<DeadLetterItem[]> => {
  const manager = await ensureEmbeddingManager()
  return manager.getDeadLetterQueue()
})

ipcMain.handle('embedding:retryDeadLetterQueue', async (): Promise<number> => {
  const manager = await ensureEmbeddingManager()
  return manager.retryDeadLetterQueue()
})

ipcMain.handle('embedding:clearDeadLetterQueue', async (): Promise<number> => {
  const manager = await ensureEmbeddingManager()
  return manager.clearDeadLetterQueue()
})

ipcMain.handle('embedding:warmupModel', async (): Promise<boolean> => {
  const manager = await ensureEmbeddingManager()
  return manager.warmupModel()
})

ipcMain.handle('embedding:unloadModel', async (): Promise<boolean> => {
  const manager = await ensureEmbeddingManager()
  return manager.unloadModel()
})

ipcMain.handle(
  'embedding:updateOllamaConfig',
  async (_event, config: Partial<OllamaConfig>): Promise<void> => {
    const manager = await ensureEmbeddingManager()
    await manager.updateOllamaConfig(config)
  }
)

ipcMain.handle(
  'embedding:pruneCache',
  async (_event, maxEntries?: number, maxAge?: number): Promise<number> => {
    const manager = await ensureEmbeddingManager()
    return manager.pruneCache(maxEntries, maxAge)
  }
)

ipcMain.handle('embedding:clearCache', async (): Promise<number> => {
  const manager = await ensureEmbeddingManager()
  return manager.clearCache()
})

ipcMain.handle('embedding:processSession', async (_event, filePath: string): Promise<number> => {
  const manager = await ensureEmbeddingManager()
  return manager.processSessionFile(filePath)
})

ipcMain.handle(
  'embedding:resetSessionPosition',
  async (_event, filePath: string): Promise<void> => {
    const manager = await ensureEmbeddingManager()
    manager.resetSessionPosition(filePath)
  }
)

ipcMain.handle('embedding:resetAllSessionPositions', async (): Promise<void> => {
  const manager = await ensureEmbeddingManager()
  manager.resetAllSessionPositions()
})

ipcMain.handle(
  'embedding:deleteSessionEmbeddings',
  async (_event, sessionId: string): Promise<number> => {
    const manager = await ensureEmbeddingManager()
    return manager.deleteSessionEmbeddings(sessionId)
  }
)

// =============================================================================
// Worker Pool Handlers (deploy-scb9)
// =============================================================================

ipcMain.handle('workers:stats', () => {
  return workerPool.getStats()
})

ipcMain.handle('workers:isReady', () => {
  return workerPool.isInitialized()
})

ipcMain.handle('workers:getConfig', () => {
  return workerPool.getConfig()
})

ipcMain.handle(
  'workers:runInteractive',
  (_event, taskName: string, data: unknown, transferList?: Transferable[]) => {
    return workerPool.runInteractive(taskName, data, transferList)
  }
)

ipcMain.handle(
  'workers:runBackground',
  (_event, taskName: string, data: unknown, transferList?: Transferable[]) => {
    return workerPool.runBackground(taskName, data, transferList)
  }
)

// =============================================================================
// MessagePort Streaming Handlers (deploy-482i)
// =============================================================================
// Note: Most streaming is handled via MessagePorts (zero-copy)
// These handlers are for stream management and stats

ipcMain.handle('stream:stats', () => {
  return messagePortStreamer.getStats()
})

ipcMain.handle('stream:list', () => {
  return messagePortStreamer.listStreams()
})

ipcMain.handle('stream:getStatus', (_event, streamId: string) => {
  return messagePortStreamer.getStreamStatus(streamId)
})

ipcMain.handle('stream:close', (_event, streamId: string) => {
  return messagePortStreamer.closeStream(streamId)
})

// Shutdown handler for graceful cleanup
app.on('before-quit', async () => {
  if (embeddingManagerInitialized) {
    await shutdownEmbeddingManager()
  }

  // Shutdown worker pools
  if (workerPool.isInitialized()) {
    await workerPool.shutdown()
  }

  // Close all active streams
  messagePortStreamer.closeAll()
})
