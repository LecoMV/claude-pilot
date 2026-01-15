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
