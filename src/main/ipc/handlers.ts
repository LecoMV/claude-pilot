import { ipcMain, BrowserWindow, type WebContents, shell, dialog } from 'electron'
import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync, watch, FSWatcher, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  SystemStatus,
  ResourceUsage,
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
  ExternalSession,
  SessionStats,
  SessionMessage,
} from '../../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// Simple cache for expensive operations
class DataCache {
  private cache: Map<string, { data: unknown; expiry: number }> = new Map()

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

  clear(): void {
    this.cache.clear()
  }
}

const dataCache = new DataCache()

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
        const lines = data.toString().split('\n').filter((l) => l.trim())
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

  ipcMain.handle('system:resources', async (): Promise<ResourceUsage> => {
    return getResourceUsage()
  })

  // Claude handlers
  ipcMain.handle('claude:version', async (): Promise<string> => {
    try {
      const result = execSync('claude --version', { encoding: 'utf-8' })
      return result.trim()
    } catch {
      return 'unknown'
    }
  })

  ipcMain.handle('claude:projects', async (): Promise<ClaudeProject[]> => {
    return getClaudeProjects()
  })

  // MCP handlers
  ipcMain.handle('mcp:list', async (): Promise<MCPServer[]> => {
    return getMCPServers()
  })

  ipcMain.handle('mcp:toggle', async (_event, name: string, enabled: boolean): Promise<boolean> => {
    try {
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
    } catch (error) {
      console.error('Failed to toggle MCP server:', error)
      return false
    }
  })

  ipcMain.handle('mcp:getServer', async (_event, name: string): Promise<MCPServer | null> => {
    const servers = getMCPServers()
    return servers.find((s) => s.name === name) || null
  })

  ipcMain.handle('mcp:reload', async (): Promise<boolean> => {
    // Claude Code auto-reloads settings, but we can signal a refresh
    return true
  })

  ipcMain.handle('mcp:getConfig', async (): Promise<string> => {
    const settingsPath = join(CLAUDE_DIR, 'settings.json')
    try {
      if (existsSync(settingsPath)) {
        const content = readFileSync(settingsPath, 'utf-8')
        return content
      }
      // Return default config structure if file doesn't exist
      return JSON.stringify({ mcpServers: {} }, null, 2)
    } catch (error) {
      console.error('Failed to read MCP config:', error)
      return JSON.stringify({ mcpServers: {} }, null, 2)
    }
  })

  ipcMain.handle('mcp:saveConfig', async (_event, content: string): Promise<boolean> => {
    const settingsPath = join(CLAUDE_DIR, 'settings.json')
    try {
      // Validate JSON before saving
      JSON.parse(content)
      // Ensure .claude directory exists
      if (!existsSync(CLAUDE_DIR)) {
        mkdirSync(CLAUDE_DIR, { recursive: true })
      }
      writeFileSync(settingsPath, content, 'utf-8')
      return true
    } catch (error) {
      console.error('Failed to save MCP config:', error)
      return false
    }
  })

  // Memory handlers
  ipcMain.handle('memory:learnings', async (_event, query?: string, limit = 50): Promise<Learning[]> => {
    return queryLearnings(query, limit)
  })

  ipcMain.handle('memory:stats', async (): Promise<{
    postgresql: { count: number }
    memgraph: { nodes: number; edges: number }
    qdrant: { vectors: number }
  }> => {
    return getMemoryStats()
  })

  ipcMain.handle('memory:graph', async (_event, query?: string, limit = 100): Promise<{
    nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
    edges: Array<{ id: string; source: string; target: string; type: string; properties: Record<string, unknown> }>
  }> => {
    return queryMemgraphGraph(query, limit)
  })

  // Qdrant memory browser
  ipcMain.handle('memory:qdrant:browse', async (_event, collection = 'mem0_memories', limit = 50, offset?: string): Promise<{
    points: Array<{ id: string; payload: Record<string, unknown>; created_at?: string }>
    nextOffset: string | null
  }> => {
    return browseQdrantMemories(collection, limit, offset)
  })

  // Qdrant semantic search
  ipcMain.handle('memory:qdrant:search', async (_event, query: string, collection = 'mem0_memories', limit = 20): Promise<{
    results: Array<{ id: string; score: number; payload: Record<string, unknown> }>
  }> => {
    return searchQdrantMemories(query, collection, limit)
  })

  // Memgraph keyword search
  ipcMain.handle('memory:memgraph:search', async (_event, keyword: string, nodeType?: string, limit = 50): Promise<{
    results: Array<{ id: string; label: string; type: string; properties: Record<string, unknown>; score?: number }>
  }> => {
    return searchMemgraphNodes(keyword, nodeType, limit)
  })

  // Raw query mode - execute queries directly
  ipcMain.handle('memory:raw', async (_event, source: 'postgresql' | 'memgraph' | 'qdrant', query: string): Promise<{
    success: boolean
    data: unknown
    error?: string
    executionTime: number
  }> => {
    return executeRawQuery(source, query)
  })

  // Profile handlers
  ipcMain.handle('profile:settings', async () => {
    return getProfileSettings()
  })

  ipcMain.handle('profile:saveSettings', async (_event, settings: ProfileSettings) => {
    return saveProfileSettings(settings)
  })

  ipcMain.handle('profile:claudemd', async () => {
    return getClaudeMd()
  })

  ipcMain.handle('profile:saveClaudemd', async (_event, content: string) => {
    return saveClaudeMd(content)
  })

  ipcMain.handle('profile:rules', async () => {
    return getRules()
  })

  ipcMain.handle('profile:toggleRule', async (_event, name: string, enabled: boolean) => {
    return toggleRule(name, enabled)
  })

  ipcMain.handle('profile:saveRule', async (_event, path: string, content: string): Promise<boolean> => {
    try {
      writeFileSync(path, content, 'utf-8')
      return true
    } catch (error) {
      console.error('Failed to save rule:', error)
      return false
    }
  })

  // Custom Profiles handlers (claude-eng, claude-sec, etc.)
  ipcMain.handle('profiles:list', async (): Promise<ClaudeCodeProfile[]> => {
    return listProfiles()
  })

  ipcMain.handle('profiles:get', async (_event, id: string): Promise<ClaudeCodeProfile | null> => {
    return getProfile(id)
  })

  ipcMain.handle(
    'profiles:create',
    async (
      _event,
      profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<ClaudeCodeProfile | null> => {
      return createProfile(profile)
    }
  )

  ipcMain.handle(
    'profiles:update',
    async (_event, id: string, updates: Partial<ClaudeCodeProfile>): Promise<boolean> => {
      return updateProfile(id, updates)
    }
  )

  ipcMain.handle('profiles:delete', async (_event, id: string): Promise<boolean> => {
    return deleteProfile(id)
  })

  ipcMain.handle('profiles:activate', async (_event, id: string): Promise<boolean> => {
    return activateProfile(id)
  })

  ipcMain.handle('profiles:getActive', async (): Promise<string | null> => {
    return getActiveProfileId()
  })

  // Context handlers
  ipcMain.handle('context:tokenUsage', async (): Promise<TokenUsage> => {
    return getTokenUsage()
  })

  ipcMain.handle('context:compactionSettings', async (): Promise<CompactionSettings> => {
    return getCompactionSettings()
  })

  ipcMain.handle('context:sessions', async (): Promise<SessionSummary[]> => {
    return getRecentSessions()
  })

  ipcMain.handle('context:compact', async (): Promise<boolean> => {
    return triggerCompaction()
  })

  ipcMain.handle('context:setAutoCompact', async (_event, enabled: boolean): Promise<boolean> => {
    return setAutoCompact(enabled)
  })

  // Services handlers
  ipcMain.handle('services:systemd', async (): Promise<SystemdService[]> => {
    return getSystemdServices()
  })

  ipcMain.handle('services:podman', async (): Promise<PodmanContainer[]> => {
    return getPodmanContainers()
  })

  ipcMain.handle('services:systemdAction', async (_event, name: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> => {
    return systemdAction(name, action)
  })

  ipcMain.handle('services:podmanAction', async (_event, id: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> => {
    return podmanAction(id, action)
  })

  // Logs handlers
  ipcMain.handle('logs:recent', async (_event, limit = 200): Promise<LogEntry[]> => {
    return getRecentLogs(limit)
  })

  ipcMain.handle('logs:stream', async (_event, sources: string[]): Promise<boolean> => {
    return startLogStream(sources)
  })

  ipcMain.handle('logs:stopStream', async (): Promise<boolean> => {
    return stopLogStream()
  })

  // Ollama handlers
  ipcMain.handle('ollama:status', async (): Promise<OllamaStatus> => {
    return getOllamaStatus()
  })

  ipcMain.handle('ollama:list', async (): Promise<OllamaModel[]> => {
    return getOllamaModels()
  })

  ipcMain.handle('ollama:running', async (): Promise<OllamaRunningModel[]> => {
    return getRunningModels()
  })

  ipcMain.handle('ollama:pull', async (_event, model: string): Promise<boolean> => {
    return pullOllamaModel(model)
  })

  ipcMain.handle('ollama:delete', async (_event, model: string): Promise<boolean> => {
    return deleteOllamaModel(model)
  })

  ipcMain.handle('ollama:run', async (_event, model: string): Promise<boolean> => {
    return runOllamaModel(model)
  })

  ipcMain.handle('ollama:stop', async (_event, model: string): Promise<boolean> => {
    return stopOllamaModel(model)
  })

  // Agent handlers
  ipcMain.handle('agents:list', async (): Promise<Agent[]> => {
    return getAgentList()
  })

  ipcMain.handle('agents:spawn', async (_event, type: AgentType, name: string): Promise<Agent | null> => {
    return spawnAgent(type, name)
  })

  ipcMain.handle('agents:terminate', async (_event, id: string): Promise<boolean> => {
    return terminateAgent(id)
  })

  ipcMain.handle('agents:swarmStatus', async (): Promise<SwarmInfo | null> => {
    return getSwarmStatus()
  })

  ipcMain.handle('agents:hiveMindStatus', async (): Promise<HiveMindInfo | null> => {
    return getHiveMindStatus()
  })

  ipcMain.handle('agents:initSwarm', async (_event, topology: string): Promise<boolean> => {
    return initSwarm(topology)
  })

  ipcMain.handle('agents:shutdownSwarm', async (): Promise<boolean> => {
    return shutdownSwarm()
  })

  // Chat handlers
  ipcMain.handle('chat:send', async (event, projectPath: string, message: string, messageId: string): Promise<boolean> => {
    return sendChatMessage(event.sender, projectPath, message, messageId)
  })

  // Settings handlers
  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    return getAppSettings()
  })

  ipcMain.handle('settings:save', async (_event, settings: AppSettings): Promise<boolean> => {
    return saveAppSettings(settings)
  })

  // System helpers
  ipcMain.handle('system:getHomePath', async (): Promise<string> => {
    return HOME
  })

  // Shell operations
  ipcMain.handle('shell:openPath', async (_event, path: string): Promise<string> => {
    return shell.openPath(path)
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<void> => {
    await shell.openExternal(url)
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
  ipcMain.handle('terminal:openAt', async (event, path: string): Promise<boolean> => {
    try {
      // Get the webContents that sent this message
      const webContents = event.sender
      // Send message back to renderer to navigate to terminal and set cwd
      webContents.send('terminal:setCwd', path)
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
    execSync('which claude', { encoding: 'utf-8', timeout: 1000 })
    const version = execSync('claude --version', { encoding: 'utf-8', timeout: 2000 }).trim()
    const status = { online: true, version, lastCheck: Date.now() }
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
    totalActive: servers.filter(s => s.status === 'online').length,
    totalDisabled: servers.filter(s => s.config.disabled).length,
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

  // Check PostgreSQL
  let postgresql = { online: false }
  try {
    execSync('pg_isready -h localhost -p 5433', { encoding: 'utf-8', timeout: 1000 })
    postgresql = { online: true }
  } catch {
    // PostgreSQL offline
  }

  // Check Memgraph via direct TCP port check (port 7687 - Bolt protocol)
  // Using network check instead of podman exec to avoid cgroup permission issues in Electron
  let memgraph = { online: false }
  try {
    execSync('nc -z localhost 7687', { encoding: 'utf-8', timeout: 1000 })
    memgraph = { online: true }
  } catch {
    // Memgraph offline
  }

  // Check Qdrant
  let qdrant = { online: false }
  try {
    const result = execSync('curl -s http://localhost:6333/collections', {
      encoding: 'utf-8',
      timeout: 2000,
    })
    if (result.includes('result')) {
      qdrant = { online: true }
    }
  } catch {
    // Qdrant offline
  }

  const status = { postgresql, memgraph, qdrant }
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
    const result = execSync('curl -s http://localhost:11434/api/tags', {
      encoding: 'utf-8',
      timeout: 2000,
    })
    const data = JSON.parse(result)
    const models = data.models || []

    // Check for running models
    let runningModels = 0
    try {
      const psResult = execSync('curl -s http://localhost:11434/api/ps', {
        encoding: 'utf-8',
        timeout: 2000,
      })
      const psData = JSON.parse(psResult)
      runningModels = psData.models?.length || 0
    } catch {
      // Ignore - just means no models running
    }

    const status = {
      online: true,
      modelCount: models.length,
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

  // Get CPU usage
  let cpu = 0
  try {
    const result = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", {
      encoding: 'utf-8',
      timeout: 2000,
    })
    cpu = parseFloat(result) || 0
  } catch {
    // Ignore
  }

  // Get memory usage
  let memory = 0
  try {
    const result = execSync("free | grep Mem | awk '{print $3/$2 * 100}'", {
      encoding: 'utf-8',
      timeout: 1000,
    })
    memory = parseFloat(result) || 0
  } catch {
    // Ignore
  }

  // Get disk usage
  let disk = { used: 0, total: 0, claudeData: 0 }
  try {
    const dfResult = execSync("df -B1 / | tail -1 | awk '{print $3, $2}'", {
      encoding: 'utf-8',
      timeout: 1000,
    })
    const [used, total] = dfResult.trim().split(' ').map(Number)
    disk.used = used
    disk.total = total

    // Get Claude data size (cache for 30 seconds - expensive operation)
    const cachedClaudeData = dataCache.get<number>('claudeDataSize')
    if (cachedClaudeData !== null) {
      disk.claudeData = cachedClaudeData
    } else if (existsSync(CLAUDE_DIR)) {
      const duResult = execSync(`du -sb ${CLAUDE_DIR} 2>/dev/null | cut -f1`, {
        encoding: 'utf-8',
        timeout: 5000,
      })
      disk.claudeData = parseInt(duResult.trim()) || 0
      dataCache.set('claudeDataSize', disk.claudeData, 30000) // 30s cache
    }
  } catch {
    // Ignore
  }

  const result = { cpu, memory, disk }
  dataCache.set('resourceUsage', result, 5000) // 5s cache
  return result
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
    const sessionFiles = readdirSync(projectPath).filter(f => f.endsWith('.jsonl'))

    // Check for CLAUDE.md
    const realPath = decodedPath.startsWith('/') ? decodedPath : join(HOME, decodedPath)
    const hasCLAUDEMD = existsSync(join(realPath, '.claude', 'CLAUDE.md')) ||
                        existsSync(join(realPath, 'CLAUDE.md'))

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
    // Sanitize and validate limit to prevent injection
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 1000)

    // Use parameterized query with safe escaping to prevent SQL injection
    let sql: string

    if (query && query.trim()) {
      // Sanitize query: remove null bytes, limit length, escape for shell
      const sanitizedQuery = query
        .replace(/\0/g, '') // Remove null bytes
        .slice(0, 500) // Limit query length
        .replace(/'/g, "''") // Escape single quotes for SQL
        .replace(/\\/g, '\\\\') // Escape backslashes

      // Use dollar-quoting for safer string handling in PostgreSQL
      sql = `SELECT id, category, topic, content, created_at FROM learnings WHERE content ILIKE $$%${sanitizedQuery}%$$ OR topic ILIKE $$%${sanitizedQuery}%$$ OR category ILIKE $$%${sanitizedQuery}%$$ ORDER BY created_at DESC LIMIT ${safeLimit}`
    } else {
      sql = `SELECT id, category, topic, content, created_at FROM learnings ORDER BY created_at DESC LIMIT ${safeLimit}`
    }

    // Execute query - use correct credentials for deploy user
    const result = execSync(
      `PGPASSWORD="claude_deploy_2024" psql -h localhost -p 5433 -U deploy -d claude_memory -t -A -F '|' -c '${sql.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8', timeout: 5000 }
    )

    if (!result.trim()) return []

    return result
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [id, category, topic, content, created_at] = line.split('|')
        return {
          id: parseInt(id, 10),
          category: category || 'general',
          content: content || '',
          confidence: 1,
          createdAt: created_at || new Date().toISOString(),
          source: topic || undefined,
        }
      })
  } catch (error) {
    console.error('Failed to query learnings:', error)
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

  // PostgreSQL count
  try {
    const pgResult = execSync(
      'PGPASSWORD="claude_deploy_2024" psql -h localhost -p 5433 -U deploy -d claude_memory -t -A -c "SELECT COUNT(*) FROM learnings"',
      { encoding: 'utf-8', timeout: 3000 }
    )
    stats.postgresql.count = parseInt(pgResult.trim(), 10) || 0
  } catch {
    // Ignore
  }

  // Memgraph counts - use bash -c to properly handle the pipe
  // Output format: +-----+\n| count(n) |\n+-----+\n| 12345 |\n+-----+
  // Data is on line 4
  try {
    const nodeResult = execSync(
      'bash -c \'echo "MATCH (n) RETURN count(n);" | podman exec -i memgraph mgconsole 2>/dev/null | sed -n "4p"\'',
      { encoding: 'utf-8', timeout: 5000, shell: '/bin/bash' }
    )
    // Parse the result - format is "| 12345 |"
    const nodeMatch = nodeResult.trim().match(/\d+/)
    stats.memgraph.nodes = nodeMatch ? parseInt(nodeMatch[0], 10) : 0

    const edgeResult = execSync(
      'bash -c \'echo "MATCH ()-[r]->() RETURN count(r);" | podman exec -i memgraph mgconsole 2>/dev/null | sed -n "4p"\'',
      { encoding: 'utf-8', timeout: 5000, shell: '/bin/bash' }
    )
    const edgeMatch = edgeResult.trim().match(/\d+/)
    stats.memgraph.edges = edgeMatch ? parseInt(edgeMatch[0], 10) : 0
  } catch {
    // Ignore
  }

  // Qdrant count - sum across all collections
  try {
    const collectionsResult = execSync(
      'curl -s http://localhost:6333/collections',
      { encoding: 'utf-8', timeout: 3000 }
    )
    const collections = JSON.parse(collectionsResult)
    let totalVectors = 0

    for (const col of collections.result?.collections || []) {
      try {
        const colResult = execSync(
          `curl -s http://localhost:6333/collections/${col.name}`,
          { encoding: 'utf-8', timeout: 2000 }
        )
        const colData = JSON.parse(colResult)
        totalVectors += colData.result?.points_count || 0
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
function parseMgconsoleOutput(output: string): Array<Record<string, unknown>> {
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
    .filter(c => c.trim())
    .map(c => c.trim())

  // Parse data rows (skip header and separator lines)
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('+') || !line.startsWith('|')) continue

    const values = line
      .split('|')
      .filter(v => v.trim() !== '')
      .map(v => {
        const trimmed = v.trim()
        // Parse value types
        if (trimmed === 'Null' || trimmed === 'null') return null
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1) // Remove quotes
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { return JSON.parse(trimmed) } catch { return trimmed }
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
function parseCypherNodeProps(value: unknown): Record<string, unknown> {
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
  edges: Array<{ id: string; source: string; target: string; type: string; properties: Record<string, unknown> }>
}> {
  const result = {
    nodes: [] as Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>,
    edges: [] as Array<{ id: string; source: string; target: string; type: string; properties: Record<string, unknown> }>,
  }

  try {
    // Build Cypher query - if no query provided, get sample of graph
    let cypherQuery: string
    if (query && query.trim()) {
      // Use provided Cypher query
      cypherQuery = query
    } else {
      // Default: get sample nodes and their relationships
      cypherQuery = `
        MATCH (n)
        WITH n LIMIT ${limit}
        OPTIONAL MATCH (n)-[r]->(m)
        WHERE m IS NOT NULL
        RETURN
          id(n) as sourceId, labels(n)[0] as sourceLabel, n as sourceProps,
          id(m) as targetId, labels(m)[0] as targetLabel, m as targetProps,
          id(r) as relId, type(r) as relType, r as relProps
        LIMIT ${limit * 2}
      `
    }

    // Execute query via mgconsole - use bash -c to properly handle the pipe
    const escapedQuery = cypherQuery.replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/'/g, "'\\''")
    const cmdResult = execSync(
      `bash -c 'echo "${escapedQuery}" | podman exec -i memgraph mgconsole 2>/dev/null'`,
      { encoding: 'utf-8', timeout: 10000, shell: '/bin/bash' }
    )

    if (!cmdResult.trim()) return result

    // Parse the tabular output
    const rows = parseMgconsoleOutput(cmdResult)
    const seenNodes = new Set<string>()
    const seenEdges = new Set<string>()

    for (const row of rows) {
      // Add source node
      if (row.sourceId !== undefined && row.sourceId !== null) {
        const nodeId = String(row.sourceId)
        if (!seenNodes.has(nodeId)) {
          seenNodes.add(nodeId)
          // Parse properties from Cypher node format if present
          const props = parseCypherNodeProps(row.sourceProps)
          result.nodes.push({
            id: nodeId,
            label: props.name || props.title || String(row.sourceLabel) || nodeId,
            type: String(row.sourceLabel) || 'Unknown',
            properties: props,
          })
        }
      }

      // Add target node
      if (row.targetId !== undefined && row.targetId !== null) {
        const nodeId = String(row.targetId)
        if (!seenNodes.has(nodeId)) {
          seenNodes.add(nodeId)
          const props = parseCypherNodeProps(row.targetProps)
          result.nodes.push({
            id: nodeId,
            label: props.name || props.title || String(row.targetLabel) || nodeId,
            type: String(row.targetLabel) || 'Unknown',
            properties: props,
          })
        }
      }

      // Add edge
      if (row.relId !== undefined && row.relId !== null && row.sourceId !== undefined && row.targetId !== undefined) {
        const edgeId = String(row.relId)
        if (!seenEdges.has(edgeId)) {
          seenEdges.add(edgeId)
          result.edges.push({
            id: edgeId,
            source: String(row.sourceId),
            target: String(row.targetId),
            type: String(row.relType) || 'RELATED',
            properties: parseCypherNodeProps(row.relProps),
          })
        }
      }
    }
  } catch (error) {
    console.error('Failed to query Memgraph:', error)
  }

  return result
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
        result.points = data.result.points.map((p: { id: string; payload: Record<string, unknown> }) => ({
          id: p.id,
          payload: p.payload,
          created_at: p.payload?.created_at as string | undefined,
        }))
      }
      result.nextOffset = data.result?.next_page_offset || null
    }
  } catch (error) {
    console.error('Failed to browse Qdrant:', error)
  }

  return result
}

// Qdrant search function (keyword-based since we don't have embeddings locally)
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
    // Use scroll and filter by payload data field containing query
    const response = await fetch(`http://localhost:6333/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: limit * 5, // Get more to filter
        with_payload: true,
        with_vector: false,
      }),
    })

    if (response.ok) {
      const data = await response.json()
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
            score: 1 - index * 0.01, // Pseudo score based on position
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

// Memgraph keyword search function
function searchMemgraphNodes(
  keyword: string,
  nodeType: string | undefined,
  limit: number
): {
  results: Array<{ id: string; label: string; type: string; properties: Record<string, unknown>; score?: number }>
} {
  const result = {
    results: [] as Array<{ id: string; label: string; type: string; properties: Record<string, unknown>; score?: number }>,
  }

  try {
    // Build Cypher query for keyword search
    const sanitizedKeyword = keyword.replace(/['"\\]/g, '')
    let cypherQuery: string

    if (nodeType && nodeType !== 'all') {
      cypherQuery = `
        MATCH (n:${nodeType})
        WHERE n.name CONTAINS '${sanitizedKeyword}'
           OR n.title CONTAINS '${sanitizedKeyword}'
           OR n.description CONTAINS '${sanitizedKeyword}'
        RETURN id(n) as id, labels(n)[0] as label, n as props
        LIMIT ${limit}
      `
    } else {
      cypherQuery = `
        MATCH (n)
        WHERE n.name CONTAINS '${sanitizedKeyword}'
           OR n.title CONTAINS '${sanitizedKeyword}'
           OR n.description CONTAINS '${sanitizedKeyword}'
        RETURN id(n) as id, labels(n)[0] as label, n as props
        LIMIT ${limit}
      `
    }

    const escapedQuery = cypherQuery.replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/'/g, "'\\''")
    const cmdResult = execSync(
      `bash -c 'echo "${escapedQuery}" | podman exec -i memgraph mgconsole 2>/dev/null'`,
      { encoding: 'utf-8', timeout: 10000, shell: '/bin/bash' }
    )

    if (cmdResult.trim()) {
      const rows = parseMgconsoleOutput(cmdResult)
      for (const row of rows) {
        if (row.id !== undefined) {
          const props = parseCypherNodeProps(row.props)
          result.results.push({
            id: String(row.id),
            label: props.name || props.title || String(row.label) || String(row.id),
            type: String(row.label) || 'Unknown',
            properties: props,
          })
        }
      }
    }
  } catch (error) {
    console.error('Failed to search Memgraph:', error)
  }

  return result
}

// Raw query execution function
function executeRawQuery(
  source: 'postgresql' | 'memgraph' | 'qdrant',
  query: string
): {
  success: boolean
  data: unknown
  error?: string
  executionTime: number
} {
  const startTime = Date.now()

  try {
    switch (source) {
      case 'postgresql': {
        const sanitizedQuery = query.replace(/'/g, "''")
        const cmdResult = execSync(
          `PGPASSWORD="claude_deploy_2024" psql -h localhost -p 5433 -U deploy -d claude_memory -t -A -F '|' -c '${sanitizedQuery}'`,
          { encoding: 'utf-8', timeout: 30000, shell: '/bin/bash' }
        )
        return {
          success: true,
          data: cmdResult.trim(),
          executionTime: Date.now() - startTime,
        }
      }

      case 'memgraph': {
        const escapedQuery = query.replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/'/g, "'\\''")
        const cmdResult = execSync(
          `bash -c 'echo "${escapedQuery}" | podman exec -i memgraph mgconsole 2>/dev/null'`,
          { encoding: 'utf-8', timeout: 30000, shell: '/bin/bash' }
        )
        // Parse tabular output into structured data
        const parsed = parseMgconsoleOutput(cmdResult)
        return {
          success: true,
          data: parsed.length === 0 ? cmdResult.trim() : parsed,
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
        const cmdParts = [`curl -s -X ${method.toUpperCase()}`]

        if (bodyStr) {
          cmdParts.push(`-H "Content-Type: application/json"`)
          cmdParts.push(`-d '${bodyStr}'`)
        }
        cmdParts.push(`http://localhost:6333${path}`)

        const cmdResult = execSync(cmdParts.join(' '), {
          encoding: 'utf-8',
          timeout: 30000,
          shell: '/bin/bash',
        })

        try {
          const parsed = JSON.parse(cmdResult)
          return {
            success: true,
            data: parsed,
            executionTime: Date.now() - startTime,
          }
        } catch {
          return {
            success: true,
            data: cmdResult.trim(),
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
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
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
const PROFILES_DIR = join(CLAUDE_DIR, 'profiles')
const ACTIVE_PROFILE_FILE = join(CLAUDE_DIR, 'active-profile')

function ensureProfilesDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true })
  }
}

function listProfiles(): ClaudeCodeProfile[] {
  ensureProfilesDir()
  const profiles: ClaudeCodeProfile[] = []

  try {
    const files = readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const content = readFileSync(join(PROFILES_DIR, file), 'utf-8')
        const profile = JSON.parse(content) as ClaudeCodeProfile
        profiles.push(profile)
      } catch {
        // Skip invalid profile files
      }
    }
  } catch (error) {
    console.error('Failed to list profiles:', error)
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name))
}

function getProfile(id: string): ClaudeCodeProfile | null {
  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (!existsSync(profilePath)) return null
    const content = readFileSync(profilePath, 'utf-8')
    return JSON.parse(content) as ClaudeCodeProfile
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
  const id = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
      const disabledRules = allRules
        .filter((r) => !profile.enabledRules!.includes(r.name))
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
      console.log('Compaction output:', data.toString())
    })

    result.stderr?.on('data', (data: Buffer) => {
      console.error('Compaction stderr:', data.toString())
    })

    result.on('error', (error) => {
      console.error('Compaction process error:', error)
    })

    result.on('close', (code) => {
      if (code === 0) {
        console.log('Compaction completed successfully')
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
          const lines = content.trim().split('\n').filter((l) => l.trim())

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
        } catch (error) {
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
function getSystemdServices(): SystemdService[] {
  const services: SystemdService[] = []
  const importantServices = [
    'postgresql',
    'docker',
    'ssh',
    'nginx',
    'redis',
    'memcached',
    'cron',
  ]

  try {
    // Get list of services
    const result = execSync(
      'systemctl list-units --type=service --all --no-pager --plain | head -50',
      { encoding: 'utf-8', timeout: 5000 }
    )

    const lines = result.trim().split('\n').slice(1) // Skip header

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

function getPodmanContainers(): PodmanContainer[] {
  const containers: PodmanContainer[] = []

  try {
    const result = execSync(
      'podman ps -a --format json 2>/dev/null',
      { encoding: 'utf-8', timeout: 10000 }
    )

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

function systemdAction(name: string, action: 'start' | 'stop' | 'restart'): boolean {
  try {
    execSync(`sudo systemctl ${action} ${name}`, { encoding: 'utf-8', timeout: 30000 })
    return true
  } catch (error) {
    console.error(`Failed to ${action} service ${name}:`, error)
    return false
  }
}

function podmanAction(id: string, action: 'start' | 'stop' | 'restart'): boolean {
  try {
    execSync(`podman ${action} ${id}`, { encoding: 'utf-8', timeout: 30000 })
    return true
  } catch (error) {
    console.error(`Failed to ${action} container ${id}:`, error)
    return false
  }
}

// Logs functions
type LogSource = 'claude' | 'mcp' | 'system' | 'agent' | 'workflow'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function generateLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parseLogLevel(line: string): LogLevel {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error'
  if (lower.includes('warn') || lower.includes('warning')) return 'warn'
  if (lower.includes('debug')) return 'debug'
  return 'info'
}

function getRecentLogs(limit = 200): LogEntry[] {
  const logs: LogEntry[] = []

  // Read from journalctl for system logs
  try {
    const sysLogs = execSync(
      `journalctl --no-pager -n ${Math.floor(limit / 4)} -o short-iso 2>/dev/null | tail -${Math.floor(limit / 4)}`,
      { encoding: 'utf-8', timeout: 5000 }
    )

    for (const line of sysLogs.trim().split('\n').slice(-Math.floor(limit / 4))) {
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
    const mcpLogs = execSync(
      'journalctl --user -u "mcp-*" --no-pager -n 20 -o short-iso 2>/dev/null',
      { encoding: 'utf-8', timeout: 3000 }
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
  return logs
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit)
}

function startLogStream(sources: string[]): boolean {
  return logStreamManager.start(sources)
}

function stopLogStream(): boolean {
  return logStreamManager.stop()
}

// Ollama functions
const OLLAMA_API = 'http://localhost:11434'

function getOllamaStatus(): OllamaStatus {
  try {
    const result = execSync(`curl -s ${OLLAMA_API}/api/version`, {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const data = JSON.parse(result)
    return { online: true, version: data.version }
  } catch {
    return { online: false }
  }
}

function getOllamaModels(): OllamaModel[] {
  try {
    const result = execSync(`curl -s ${OLLAMA_API}/api/tags`, {
      encoding: 'utf-8',
      timeout: 10000,
    })
    const data = JSON.parse(result)
    if (!data.models) return []

    return data.models.map((m: {
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
    }) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
      details: m.details ? {
        format: m.details.format,
        family: m.details.family,
        parameterSize: m.details.parameter_size,
        quantizationLevel: m.details.quantization_level,
      } : undefined,
    }))
  } catch {
    return []
  }
}

function getRunningModels(): OllamaRunningModel[] {
  try {
    const result = execSync(`curl -s ${OLLAMA_API}/api/ps`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
    const data = JSON.parse(result)
    if (!data.models) return []

    return data.models.map((m: {
      name: string
      model: string
      size: number
      digest: string
      expires_at: string
    }) => ({
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

function pullOllamaModel(model: string): boolean {
  try {
    // Start pull in background (will stream progress)
    execSync(`ollama pull ${model}`, {
      encoding: 'utf-8',
      timeout: 600000, // 10 minutes max
      stdio: 'pipe',
    })
    return true
  } catch (error) {
    console.error('Failed to pull model:', error)
    return false
  }
}

function deleteOllamaModel(model: string): boolean {
  try {
    execSync(`ollama rm ${model}`, {
      encoding: 'utf-8',
      timeout: 30000,
    })
    return true
  } catch (error) {
    console.error('Failed to delete model:', error)
    return false
  }
}

function runOllamaModel(model: string): boolean {
  try {
    // Run model in background (just loads it into memory)
    const body = JSON.stringify({ model, keep_alive: '10m' })
    execSync(`curl -s -X POST ${OLLAMA_API}/api/generate -d '${body}'`, {
      encoding: 'utf-8',
      timeout: 60000,
    })
    return true
  } catch (error) {
    console.error('Failed to run model:', error)
    return false
  }
}

function stopOllamaModel(model: string): boolean {
  try {
    // Stop model by setting keep_alive to 0
    const body = JSON.stringify({ model, keep_alive: 0 })
    execSync(`curl -s -X POST ${OLLAMA_API}/api/generate -d '${body}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    })
    return true
  } catch (error) {
    console.error('Failed to stop model:', error)
    return false
  }
}

// Agent functions - local simulation (Claude Flow MCP integration removed for responsiveness)
// In-memory agent state
let agentState: {
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
function sendChatMessage(sender: WebContents, projectPath: string, message: string, messageId: string): boolean {
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
const APP_SETTINGS_PATH = join(HOME, '.config', 'claude-command-center', 'settings.json')

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
    const configDir = join(HOME, '.config', 'claude-command-center')
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
async function parseSessionFile(filePath: string): Promise<ExternalSession | null> {
  try {
    if (!existsSync(filePath)) return null

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter((l) => l.trim())
    if (lines.length === 0) return null

    // Parse first and last entries for metadata
    let firstEntry: Record<string, unknown> | null = null
    let lastEntry: Record<string, unknown> | null = null
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
        lastEntry = entry

        // Count messages and tokens
        const type = entry.type as string
        if (type === 'user') {
          stats.userMessages++
          stats.messageCount++
        } else if (type === 'assistant') {
          stats.assistantMessages++
          stats.messageCount++
        } else if (type === 'tool-result') {
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
    const { statSync } = require('fs')
    const stat = statSync(filePath)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    const isActive = stat.mtimeMs > fiveMinutesAgo

    // Calculate estimated cost (rough approximation)
    // Claude 3.5 Sonnet: ~$3/MTok input, ~$15/MTok output
    stats.estimatedCost =
      (stats.inputTokens * 0.000003) +
      (stats.outputTokens * 0.000015)

    const session: ExternalSession = {
      id: sessionId,
      slug: firstEntry.slug as string | undefined,
      projectPath,
      projectName,
      filePath,
      startTime: firstEntry.timestamp
        ? new Date(firstEntry.timestamp as string).getTime()
        : stat.birthtimeMs,
      lastActivity: lastEntry?.timestamp
        ? new Date(lastEntry.timestamp as string).getTime()
        : stat.mtimeMs,
      isActive,
      model: (firstEntry.message as Record<string, unknown>)?.model as string | undefined,
      version: firstEntry.version as string | undefined,
      gitBranch: firstEntry.gitBranch as string | undefined,
      stats,
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
    // Find all JSONL files (excluding subagents)
    const findResult = execSync(
      `find "${projectsDir}" -name "*.jsonl" -type f -not -path "*/subagents/*" 2>/dev/null | head -100`,
      { encoding: 'utf-8', timeout: 10000 }
    )

    const files = findResult.trim().split('\n').filter((f) => f.trim())

    // Parse each session file
    for (const filePath of files) {
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
    // Find the session file
    const findResult = execSync(
      `find "${projectsDir}" -name "${sessionId}.jsonl" -type f 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 5000 }
    )

    const filePath = findResult.trim()
    if (!filePath || !existsSync(filePath)) return messages

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter((l) => l.trim())

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
          timestamp: entry.timestamp
            ? new Date(entry.timestamp as string).getTime()
            : Date.now(),
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

// Get active sessions (modified in last 5 minutes)
async function getActiveSessions(): Promise<ExternalSession[]> {
  const sessions = await discoverExternalSessions()
  return sessions.filter((s) => s.isActive)
}

// IPC Handlers for External Sessions
ipcMain.handle('sessions:discover', async () => {
  return discoverExternalSessions()
})

ipcMain.handle('sessions:get', async (_event, sessionId: string) => {
  const sessions = await discoverExternalSessions()
  return sessions.find((s) => s.id === sessionId) || null
})

ipcMain.handle('sessions:getMessages', async (_event, sessionId: string, limit?: number) => {
  return getSessionMessages(sessionId, limit)
})

ipcMain.handle('sessions:watch', async (_event, enable: boolean) => {
  if (enable) {
    return sessionWatchManager.start()
  } else {
    return sessionWatchManager.stop()
  }
})

ipcMain.handle('sessions:getActive', async () => {
  return getActiveSessions()
})
