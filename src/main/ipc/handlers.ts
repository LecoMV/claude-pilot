import { ipcMain } from 'electron'
import { execSync, spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  SystemStatus,
  ResourceUsage,
  ClaudeProject,
  MCPServer,
  Learning,
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
    // TODO: Implement MCP toggle
    console.log(`Toggle MCP ${name} to ${enabled}`)
    return true
  })

  // Memory handlers
  ipcMain.handle('memory:learnings', async (_event, query?: string, limit = 50): Promise<Learning[]> => {
    return queryLearnings(query, limit)
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
  // TODO: Implement actual PostgreSQL query
  // For now, return empty array
  return []
}
