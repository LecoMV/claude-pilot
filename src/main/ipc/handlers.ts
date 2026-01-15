import { ipcMain } from 'electron'
import { execSync, spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
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
} from '../../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

export function registerIpcHandlers(): void {
  // System handlers
  ipcMain.handle('system:status', async (): Promise<SystemStatus> => {
    return {
      claude: await getClaudeStatus(),
      mcp: await getMCPStatus(),
      memory: await getMemoryStatus(),
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
    const settingsPath = join(CLAUDE_DIR, 'settings.json')
    try {
      if (!existsSync(settingsPath)) return false

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (!settings.mcpServers?.[name]) return false

      // Toggle disabled state
      settings.mcpServers[name].disabled = !enabled
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2))

      return true
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
}

async function getClaudeStatus() {
  try {
    execSync('which claude', { encoding: 'utf-8' })
    const version = execSync('claude --version', { encoding: 'utf-8' }).trim()
    return { online: true, version, lastCheck: Date.now() }
  } catch {
    return { online: false, lastCheck: Date.now() }
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
  // Check PostgreSQL
  let postgresql = { online: false }
  try {
    execSync('pg_isready -h localhost -p 5433', { encoding: 'utf-8' })
    postgresql = { online: true }
  } catch {
    // PostgreSQL offline
  }

  // Check Memgraph
  let memgraph = { online: false }
  try {
    execSync('podman exec memgraph mgconsole -c "RETURN 1"', { encoding: 'utf-8', timeout: 5000 })
    memgraph = { online: true }
  } catch {
    // Memgraph offline
  }

  // Check Qdrant
  let qdrant = { online: false }
  try {
    const result = execSync('curl -s http://localhost:6333/collections', { encoding: 'utf-8', timeout: 3000 })
    if (result.includes('result')) {
      qdrant = { online: true }
    }
  } catch {
    // Qdrant offline
  }

  return { postgresql, memgraph, qdrant }
}

async function getResourceUsage(): Promise<ResourceUsage> {
  // Get CPU usage
  let cpu = 0
  try {
    const result = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", { encoding: 'utf-8' })
    cpu = parseFloat(result) || 0
  } catch {
    // Ignore
  }

  // Get memory usage
  let memory = 0
  try {
    const result = execSync("free | grep Mem | awk '{print $3/$2 * 100}'", { encoding: 'utf-8' })
    memory = parseFloat(result) || 0
  } catch {
    // Ignore
  }

  // Get disk usage
  let disk = { used: 0, total: 0, claudeData: 0 }
  try {
    const dfResult = execSync("df -B1 / | tail -1 | awk '{print $3, $2}'", { encoding: 'utf-8' })
    const [used, total] = dfResult.trim().split(' ').map(Number)
    disk.used = used
    disk.total = total

    // Get Claude data size
    if (existsSync(CLAUDE_DIR)) {
      const duResult = execSync(`du -sb ${CLAUDE_DIR} 2>/dev/null | cut -f1`, { encoding: 'utf-8' })
      disk.claudeData = parseInt(duResult.trim()) || 0
    }
  } catch {
    // Ignore
  }

  return { cpu, memory, disk }
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

  // Read from Claude settings
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const mcpServers = settings.mcpServers || {}

      for (const [name, config] of Object.entries(mcpServers)) {
        const serverConfig = config as MCPServer['config']
        servers.push({
          name,
          status: serverConfig.disabled ? 'offline' : 'online',
          config: serverConfig,
        })
      }
    } catch {
      // Ignore parse errors
    }
  }

  return servers
}

async function queryLearnings(query?: string, limit = 50): Promise<Learning[]> {
  try {
    // Use psql to query PostgreSQL
    const whereClause = query
      ? `WHERE content ILIKE '%${query.replace(/'/g, "''")}%' OR topic ILIKE '%${query.replace(/'/g, "''")}%' OR category ILIKE '%${query.replace(/'/g, "''")}%'`
      : ''

    const sql = `SELECT id, category, topic, content, created_at FROM learnings ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`

    const result = execSync(
      `PGPASSWORD="" psql -h localhost -p 5433 -U postgres -d claude_memory -t -A -F '|' -c "${sql}"`,
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
      'PGPASSWORD="" psql -h localhost -p 5433 -U postgres -d claude_memory -t -A -c "SELECT COUNT(*) FROM learnings"',
      { encoding: 'utf-8', timeout: 3000 }
    )
    stats.postgresql.count = parseInt(pgResult.trim(), 10) || 0
  } catch {
    // Ignore
  }

  // Memgraph counts
  try {
    const nodeResult = execSync(
      'echo "MATCH (n) RETURN count(n);" | podman exec -i memgraph mgconsole 2>/dev/null | tail -1',
      { encoding: 'utf-8', timeout: 5000 }
    )
    stats.memgraph.nodes = parseInt(nodeResult.trim(), 10) || 0

    const edgeResult = execSync(
      'echo "MATCH ()-[r]->() RETURN count(r);" | podman exec -i memgraph mgconsole 2>/dev/null | tail -1',
      { encoding: 'utf-8', timeout: 5000 }
    )
    stats.memgraph.edges = parseInt(edgeResult.trim(), 10) || 0
  } catch {
    // Ignore
  }

  // Qdrant count
  try {
    const qdrantResult = execSync(
      'curl -s http://localhost:6333/collections/claude_memories | grep -o \'"points_count":[0-9]*\' | cut -d: -f2',
      { encoding: 'utf-8', timeout: 3000 }
    )
    stats.qdrant.vectors = parseInt(qdrantResult.trim(), 10) || 0
  } catch {
    // Ignore
  }

  return stats
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
  const rules: ClaudeRule[] = []

  try {
    if (!existsSync(rulesDir)) {
      return rules
    }

    const entries = readdirSync(rulesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue

      const rulePath = join(rulesDir, entry.name)
      const ruleName = entry.name.replace('.md', '')

      try {
        const content = readFileSync(rulePath, 'utf-8')
        rules.push({
          name: ruleName,
          path: rulePath,
          enabled: true, // Rules are enabled by default if they exist
          content,
        })
      } catch {
        rules.push({
          name: ruleName,
          path: rulePath,
          enabled: true,
        })
      }
    }
  } catch (error) {
    console.error('Failed to read rules:', error)
  }

  return rules
}

function toggleRule(name: string, enabled: boolean): boolean {
  // For now, rules are always enabled if the file exists
  // A more complex implementation would track enabled/disabled state in settings.json
  console.log(`Toggle rule ${name} to ${enabled}`)
  return true
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
  // This would trigger claude's compaction - for now just log
  console.log('Compaction triggered')
  return true
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

// Streaming log state
let logStreamActive = false

function startLogStream(_sources: string[]): boolean {
  // In a real implementation, this would set up real-time log tailing
  // For now, we'll simulate with the recent logs fetcher
  logStreamActive = true
  return true
}

function stopLogStream(): boolean {
  logStreamActive = false
  return true
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

// Agent functions - using Claude Flow MCP
const CLAUDE_FLOW_API = 'http://localhost:3456'

// In-memory agent state (would normally come from Claude Flow)
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
  // Try to get from Claude Flow MCP
  try {
    const result = execSync(`curl -s ${CLAUDE_FLOW_API}/api/agents`, {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const data = JSON.parse(result)
    if (data.agents) {
      agentState.agents = data.agents
      return data.agents
    }
  } catch {
    // Fall back to in-memory state
  }
  return agentState.agents
}

function spawnAgent(type: AgentType, name: string): Agent | null {
  // Try to spawn via Claude Flow MCP
  try {
    const body = JSON.stringify({ agentType: type, agentId: name })
    const result = execSync(
      `curl -s -X POST ${CLAUDE_FLOW_API}/api/agents/spawn -H "Content-Type: application/json" -d '${body}'`,
      { encoding: 'utf-8', timeout: 10000 }
    )
    const data = JSON.parse(result)
    if (data.agent) {
      return data.agent
    }
  } catch {
    // Fall back to local simulation
  }

  // Simulate agent spawn locally
  const agent: Agent = {
    id: generateAgentId(),
    name,
    type,
    status: 'idle',
    taskCount: 0,
    health: 1.0,
  }
  agentState.agents.push(agent)
  return agent
}

function terminateAgent(id: string): boolean {
  // Try to terminate via Claude Flow MCP
  try {
    execSync(
      `curl -s -X POST ${CLAUDE_FLOW_API}/api/agents/${id}/terminate`,
      { encoding: 'utf-8', timeout: 5000 }
    )
    agentState.agents = agentState.agents.filter((a) => a.id !== id)
    return true
  } catch {
    // Fall back to local simulation
  }

  const index = agentState.agents.findIndex((a) => a.id === id)
  if (index >= 0) {
    agentState.agents.splice(index, 1)
    return true
  }
  return false
}

function getSwarmStatus(): SwarmInfo | null {
  try {
    const result = execSync(`curl -s ${CLAUDE_FLOW_API}/api/swarm/status`, {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const data = JSON.parse(result)
    if (data.swarm) {
      agentState.swarm = data.swarm
      return data.swarm
    }
  } catch {
    // Fall back to in-memory state
  }
  return agentState.swarm
}

function getHiveMindStatus(): HiveMindInfo | null {
  try {
    const result = execSync(`curl -s ${CLAUDE_FLOW_API}/api/hive-mind/status`, {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const data = JSON.parse(result)
    if (data.hiveMind) {
      agentState.hiveMind = data.hiveMind
      return data.hiveMind
    }
  } catch {
    // Fall back to in-memory state
  }
  return agentState.hiveMind
}

function initSwarm(topology: string): boolean {
  try {
    const body = JSON.stringify({ topology })
    execSync(
      `curl -s -X POST ${CLAUDE_FLOW_API}/api/swarm/init -H "Content-Type: application/json" -d '${body}'`,
      { encoding: 'utf-8', timeout: 10000 }
    )
    agentState.swarm = {
      id: `swarm-${Date.now()}`,
      topology,
      agents: agentState.agents.map((a) => a.id),
      status: 'active',
      createdAt: Date.now(),
    }
    return true
  } catch {
    // Simulate locally
    agentState.swarm = {
      id: `swarm-${Date.now()}`,
      topology,
      agents: agentState.agents.map((a) => a.id),
      status: 'active',
      createdAt: Date.now(),
    }
    return true
  }
}

function shutdownSwarm(): boolean {
  try {
    execSync(`curl -s -X POST ${CLAUDE_FLOW_API}/api/swarm/shutdown`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
  } catch {
    // Continue with local shutdown
  }
  agentState.swarm = null
  return true
}
