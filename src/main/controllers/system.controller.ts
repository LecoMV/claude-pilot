/**
 * System Controller - System Status and Resource Management
 *
 * Migrated from handlers.ts to tRPC pattern.
 * Provides type-safe system status, resource monitoring, and health checks.
 *
 * @see src/main/ipc/handlers.ts for legacy implementation
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import { execSync } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { SystemStatus, ResourceUsage, GPUUsage } from '../../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// Simple in-memory cache for expensive operations
class SystemCache {
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

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}

const systemCache = new SystemCache()

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getClaudeStatus() {
  type ClaudeStatus = { online: boolean; version?: string; lastCheck: number }
  const cached = systemCache.get<ClaudeStatus>('claudeStatus')
  if (cached) return cached

  try {
    execSync('which claude', { encoding: 'utf-8', timeout: 1000 })
    const version = execSync('claude --version', { encoding: 'utf-8', timeout: 2000 }).trim()
    const status = { online: true, version, lastCheck: Date.now() }
    systemCache.set('claudeStatus', status, 30000) // 30s cache
    return status
  } catch {
    const status = { online: false, lastCheck: Date.now() }
    systemCache.set('claudeStatus', status, 5000) // 5s cache for offline
    return status
  }
}

function getMemoryStatus() {
  type MemStatus = {
    postgresql: { online: boolean }
    memgraph: { online: boolean }
    qdrant: { online: boolean }
  }
  const cached = systemCache.get<MemStatus>('memoryStatus')
  if (cached) return cached

  // Check PostgreSQL
  let postgresql = { online: false }
  try {
    execSync('pg_isready -h localhost -p 5433', { encoding: 'utf-8', timeout: 1000 })
    postgresql = { online: true }
  } catch {
    // PostgreSQL offline
  }

  // Check Memgraph via TCP port check
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
  systemCache.set('memoryStatus', status, 10000) // 10s cache
  return status
}

function getOllamaServiceStatus() {
  const cached = systemCache.get<{ online: boolean; modelCount: number; runningModels: number }>(
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

    let runningModels = 0
    try {
      const psResult = execSync('curl -s http://localhost:11434/api/ps', {
        encoding: 'utf-8',
        timeout: 2000,
      })
      const psData = JSON.parse(psResult)
      runningModels = psData.models?.length || 0
    } catch {
      // No models running
    }

    const status = { online: true, modelCount: models.length, runningModels }
    systemCache.set('ollamaStatus', status, 10000)
    return status
  } catch {
    const status = { online: false, modelCount: 0, runningModels: 0 }
    systemCache.set('ollamaStatus', status, 5000)
    return status
  }
}

function getMCPStatus() {
  // Read MCP server config
  const mcpJsonPath = join(CLAUDE_DIR, 'mcp.json')
  let servers: Array<{ name: string; status: string; disabled: boolean }> = []

  try {
    if (existsSync(mcpJsonPath)) {
      const config = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'))
      const mcpServers = config.mcpServers || {}

      servers = Object.entries(mcpServers).map(([name, serverConfig]) => {
        const cfg = serverConfig as Record<string, unknown>
        return {
          name,
          status: cfg.disabled ? 'disabled' : 'configured',
          disabled: Boolean(cfg.disabled),
        }
      })
    }
  } catch {
    // Ignore config read errors
  }

  return {
    servers,
    totalActive: servers.filter((s) => !s.disabled).length,
    totalDisabled: servers.filter((s) => s.disabled).length,
  }
}

function getGPUUsage(): GPUUsage {
  const cached = systemCache.get<GPUUsage>('gpuUsage')
  if (cached) return cached

  const gpuInfo: GPUUsage = { available: false }

  try {
    const nvidiaSmi = execSync(
      'nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,driver_version --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 3000 }
    )
    const parts = nvidiaSmi.trim().split(', ')
    if (parts.length >= 6) {
      gpuInfo.available = true
      gpuInfo.name = parts[0].trim()
      gpuInfo.memoryUsed = parseInt(parts[1]) * 1024 * 1024
      gpuInfo.memoryTotal = parseInt(parts[2]) * 1024 * 1024
      gpuInfo.utilization = parseInt(parts[3])
      gpuInfo.temperature = parseInt(parts[4])
      gpuInfo.driverVersion = parts[5].trim()
      systemCache.set('gpuUsage', gpuInfo, 5000)
      return gpuInfo
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg.includes('version mismatch') || errorMsg.includes('NVML')) {
      gpuInfo.error = 'Driver version mismatch - reboot required'
    }
  }

  // Fallback: Try /proc/driver/nvidia/gpus
  try {
    const nvidiaGpusDir = '/proc/driver/nvidia/gpus'
    if (existsSync(nvidiaGpusDir)) {
      const gpuDirs = readdirSync(nvidiaGpusDir)
      if (gpuDirs.length > 0) {
        const infoPath = join(nvidiaGpusDir, gpuDirs[0], 'information')
        if (existsSync(infoPath)) {
          const info = readFileSync(infoPath, 'utf-8')
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

  // Fallback: Try lspci
  if (!gpuInfo.name) {
    try {
      const lspci = execSync("lspci | grep -i 'vga\\|3d\\|display'", {
        encoding: 'utf-8',
        timeout: 2000,
      })
      const nvidiaMatch = lspci.match(/NVIDIA[^[]+/i)
      if (nvidiaMatch) {
        gpuInfo.available = true
        gpuInfo.name = nvidiaMatch[0].trim()
      }
    } catch {
      // No GPU detected
    }
  }

  systemCache.set('gpuUsage', gpuInfo, 5000)
  return gpuInfo
}

function getResourceUsage(): ResourceUsage {
  const cached = systemCache.get<ResourceUsage>('resourceUsage')
  if (cached) return cached

  // CPU usage
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

  // Memory usage
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

  // Disk usage
  const disk = { used: 0, total: 0, claudeData: 0 }
  try {
    const dfResult = execSync("df -B1 / | tail -1 | awk '{print $3, $2}'", {
      encoding: 'utf-8',
      timeout: 1000,
    })
    const [used, total] = dfResult.trim().split(' ').map(Number)
    disk.used = used
    disk.total = total

    const cachedClaudeData = systemCache.get<number>('claudeDataSize')
    if (cachedClaudeData !== null) {
      disk.claudeData = cachedClaudeData
    } else if (existsSync(CLAUDE_DIR)) {
      const duResult = execSync(`du -sb ${CLAUDE_DIR} 2>/dev/null | cut -f1`, {
        encoding: 'utf-8',
        timeout: 5000,
      })
      disk.claudeData = parseInt(duResult.trim()) || 0
      systemCache.set('claudeDataSize', disk.claudeData, 30000)
    }
  } catch {
    // Ignore
  }

  const gpu = getGPUUsage()
  const result = { cpu, memory, disk, gpu }
  systemCache.set('resourceUsage', result, 5000)
  return result
}

// ============================================================================
// SYSTEM ROUTER
// ============================================================================

export const systemRouter = router({
  /**
   * Get full system status (dashboard summary)
   */
  status: auditedProcedure.query((): SystemStatus => {
    return {
      claude: getClaudeStatus(),
      mcp: getMCPStatus(),
      memory: getMemoryStatus(),
      ollama: getOllamaServiceStatus(),
      resources: getResourceUsage(),
    }
  }),

  /**
   * Get resource usage only (lighter weight)
   */
  resources: publicProcedure.query((): ResourceUsage => {
    return getResourceUsage()
  }),

  /**
   * Get GPU usage
   */
  gpu: publicProcedure.query((): GPUUsage => {
    return getGPUUsage()
  }),

  /**
   * Get Claude Code version
   */
  claudeVersion: publicProcedure.query((): string => {
    try {
      const result = execSync('claude --version', { encoding: 'utf-8', timeout: 2000 })
      return result.trim()
    } catch {
      return 'unknown'
    }
  }),

  /**
   * Get home directory path
   */
  homePath: publicProcedure.query((): string => {
    return HOME
  }),

  /**
   * Get app info
   */
  appInfo: publicProcedure.query(() => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      claudeDir: CLAUDE_DIR,
    }
  }),

  /**
   * Health check - quick ping
   */
  health: publicProcedure.query(() => {
    return {
      healthy: true,
      timestamp: Date.now(),
    }
  }),

  /**
   * Force refresh cache and get fresh status
   */
  refresh: auditedProcedure
    .input(
      z.object({
        components: z.array(z.enum(['claude', 'mcp', 'memory', 'ollama', 'resources'])).optional(),
      })
    )
    .mutation(({ input }) => {
      const cacheKeyMap: Record<string, string[]> = {
        claude: ['claudeStatus'],
        mcp: [], // MCP status isn't cached currently
        memory: ['memoryStatus'],
        ollama: ['ollamaStatus'],
        resources: ['resourceUsage', 'gpuUsage', 'claudeDataSize'],
      }

      if (!input.components || input.components.length === 0) {
        // Clear all system caches
        systemCache.clear()
      } else {
        // Clear specific component caches
        for (const component of input.components) {
          const keys = cacheKeyMap[component] || []
          for (const key of keys) {
            systemCache.delete(key)
          }
        }
      }

      return { refreshed: true, timestamp: Date.now() }
    }),
})

export type SystemRouter = typeof systemRouter
