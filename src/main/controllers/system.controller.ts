/**
 * System Controller - System Status and Resource Management
 *
 * REFACTORED: Eliminated all execSync calls for enterprise-grade async operations.
 * Uses native services and fetch() instead of shell commands.
 *
 * @see src/main/services/postgresql.ts
 * @see src/main/services/memgraph.ts
 * @see src/main/services/memory/qdrant.service.ts
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir, cpus, totalmem, freemem } from 'os'
import { promisify } from 'util'
import { exec } from 'child_process'
import type { SystemStatus, ResourceUsage, GPUUsage } from '../../shared/types'

// Native services
import { postgresService } from '../services/postgresql'
import { memgraphService } from '../services/memgraph'
import QdrantService from '../services/memory/qdrant.service'

const execAsync = promisify(exec)
const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// ============================================================================
// ASYNC CACHE (Thread-safe with TTL)
// ============================================================================

class AsyncCache {
  private cache: Map<string, { data: unknown; expiry: number; pending?: Promise<unknown> }> =
    new Map()

  getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const entry = this.cache.get(key)
    const now = Date.now()

    // Return cached if valid
    if (entry && now < entry.expiry && entry.data !== undefined) {
      return Promise.resolve(entry.data as T)
    }

    // Deduplicate concurrent requests
    if (entry?.pending) {
      return entry.pending as Promise<T>
    }

    // Fetch and cache
    const pending = fetcher()
      .then((data) => {
        this.cache.set(key, { data, expiry: now + ttlMs })
        return data
      })
      .catch((err) => {
        this.cache.delete(key)
        throw err
      })

    this.cache.set(key, { data: entry?.data, expiry: now + ttlMs, pending })
    return pending
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}

const systemCache = new AsyncCache()

// ============================================================================
// ASYNC HELPER FUNCTIONS (No execSync!)
// ============================================================================

function getClaudeStatusAsync(): Promise<{
  online: boolean
  version?: string
  lastCheck: number
}> {
  return systemCache.getOrFetch(
    'claudeStatus',
    async () => {
      try {
        // Use async exec instead of execSync
        const { stdout } = await execAsync('claude --version', { timeout: 2000 })
        return { online: true, version: stdout.trim(), lastCheck: Date.now() }
      } catch {
        return { online: false, lastCheck: Date.now() }
      }
    },
    30000
  )
}

function getMemoryStatusAsync(): Promise<{
  postgresql: { online: boolean }
  memgraph: { online: boolean }
  qdrant: { online: boolean }
}> {
  return systemCache.getOrFetch(
    'memoryStatus',
    async () => {
      // Check all services in parallel using native clients
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

      return {
        postgresql: { online: pgOnline },
        memgraph: { online: mgOnline },
        qdrant: { online: qdrantOnline },
      }
    },
    10000
  )
}

function getOllamaStatusAsync(): Promise<{
  online: boolean
  modelCount: number
  runningModels: number
}> {
  return systemCache.getOrFetch(
    'ollamaStatus',
    async () => {
      try {
        // Use native fetch instead of curl
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)

        const [tagsResponse, psResponse] = await Promise.all([
          fetch('http://localhost:11434/api/tags', { signal: controller.signal }),
          fetch('http://localhost:11434/api/ps', { signal: controller.signal }).catch(() => null),
        ])

        clearTimeout(timeout)

        if (!tagsResponse.ok) {
          return { online: false, modelCount: 0, runningModels: 0 }
        }

        const tagsData = (await tagsResponse.json()) as { models?: unknown[] }
        const modelCount = tagsData.models?.length || 0

        let runningModels = 0
        if (psResponse?.ok) {
          const psData = (await psResponse.json()) as { models?: unknown[] }
          runningModels = psData.models?.length || 0
        }

        return { online: true, modelCount, runningModels }
      } catch {
        return { online: false, modelCount: 0, runningModels: 0 }
      }
    },
    10000
  )
}

function getMCPStatus(): {
  servers: Array<{ name: string; status: string; disabled: boolean }>
  totalActive: number
  totalDisabled: number
} {
  // This is synchronous file read which is fine (no shell command)
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

function getGPUUsageAsync(): Promise<GPUUsage> {
  return systemCache.getOrFetch(
    'gpuUsage',
    async () => {
      const gpuInfo: GPUUsage = { available: false }

      try {
        // Use async exec for nvidia-smi
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,driver_version --format=csv,noheader,nounits',
          { timeout: 3000 }
        )
        const parts = stdout.trim().split(', ')
        if (parts.length >= 6) {
          gpuInfo.available = true
          gpuInfo.name = parts[0].trim()
          gpuInfo.memoryUsed = parseInt(parts[1]) * 1024 * 1024
          gpuInfo.memoryTotal = parseInt(parts[2]) * 1024 * 1024
          gpuInfo.utilization = parseInt(parts[3])
          gpuInfo.temperature = parseInt(parts[4])
          gpuInfo.driverVersion = parts[5].trim()
          return gpuInfo
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (errorMsg.includes('version mismatch') || errorMsg.includes('NVML')) {
          gpuInfo.error = 'Driver version mismatch - reboot required'
        }
      }

      // Fallback: Try /proc/driver/nvidia/gpus (sync file read is fine)
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

      // Fallback: Try lspci (async)
      if (!gpuInfo.name) {
        try {
          const { stdout } = await execAsync("lspci | grep -i 'vga\\|3d\\|display'", {
            timeout: 2000,
          })
          const nvidiaMatch = stdout.match(/NVIDIA[^[]+/i)
          if (nvidiaMatch) {
            gpuInfo.available = true
            gpuInfo.name = nvidiaMatch[0].trim()
          }
        } catch {
          // No GPU detected
        }
      }

      return gpuInfo
    },
    5000
  )
}

function getResourceUsageAsync(): Promise<ResourceUsage> {
  return systemCache.getOrFetch(
    'resourceUsage',
    async () => {
      // CPU usage from Node.js (no shell command needed)
      const cpuInfo = cpus()
      let cpu = 0
      if (cpuInfo.length > 0) {
        const totalIdle = cpuInfo.reduce((acc, cpu) => acc + cpu.times.idle, 0)
        const totalTick = cpuInfo.reduce(
          (acc, cpu) =>
            acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq,
          0
        )
        cpu = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0
      }

      // Memory from Node.js (no shell command needed)
      const totalMem = totalmem()
      const freeMem = freemem()
      const memory = ((totalMem - freeMem) / totalMem) * 100

      // Disk usage - use async exec instead of sync
      const disk = { used: 0, total: 0, claudeData: 0 }
      try {
        const { stdout: dfOut } = await execAsync("df -B1 / | tail -1 | awk '{print $3, $2}'", {
          timeout: 1000,
        })
        const [used, total] = dfOut.trim().split(' ').map(Number)
        disk.used = used || 0
        disk.total = total || 0

        if (existsSync(CLAUDE_DIR)) {
          try {
            const { stdout: duOut } = await execAsync(
              `du -sb ${CLAUDE_DIR} 2>/dev/null | cut -f1`,
              {
                timeout: 5000,
              }
            )
            disk.claudeData = parseInt(duOut.trim()) || 0
          } catch {
            // Ignore du errors
          }
        }
      } catch {
        // Ignore disk errors
      }

      const gpu = await getGPUUsageAsync()
      return { cpu, memory, disk, gpu }
    },
    5000
  )
}

// ============================================================================
// SYSTEM ROUTER (All procedures now async)
// ============================================================================

export const systemRouter = router({
  /**
   * Get full system status (dashboard summary)
   */
  status: auditedProcedure.query(async (): Promise<SystemStatus> => {
    // Fetch all status in parallel
    const [claude, memory, ollama, resources] = await Promise.all([
      getClaudeStatusAsync(),
      getMemoryStatusAsync(),
      getOllamaStatusAsync(),
      getResourceUsageAsync(),
    ])

    return {
      claude,
      mcp: getMCPStatus(),
      memory,
      ollama,
      resources,
    }
  }),

  /**
   * Get resource usage only (lighter weight)
   */
  resources: publicProcedure.query((): Promise<ResourceUsage> => {
    return getResourceUsageAsync()
  }),

  /**
   * Get GPU usage
   */
  gpu: publicProcedure.query((): Promise<GPUUsage> => {
    return getGPUUsageAsync()
  }),

  /**
   * Get Claude Code version
   */
  claudeVersion: publicProcedure.query(async (): Promise<string> => {
    try {
      const { stdout } = await execAsync('claude --version', { timeout: 2000 })
      return stdout.trim()
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
        resources: ['resourceUsage', 'gpuUsage'],
      }

      if (!input.components || input.components.length === 0) {
        // Clear all system caches
        systemCache.clear()
      } else {
        // Clear specific component caches
        for (const component of input.components) {
          const keys = cacheKeyMap[component] || []
          for (const key of keys) {
            systemCache.invalidate(key)
          }
        }
      }

      return { refreshed: true, timestamp: Date.now() }
    }),

  /**
   * Initialize database connections (call on app startup)
   */
  initConnections: auditedProcedure.mutation(async () => {
    const results = await Promise.allSettled([
      postgresService.connect(),
      memgraphService.connect(),
      QdrantService.getInstance().healthCheck(),
    ])

    return {
      postgresql: results[0].status === 'fulfilled' && results[0].value,
      memgraph: results[1].status === 'fulfilled' && results[1].value,
      qdrant: results[2].status === 'fulfilled' && results[2].value,
    }
  }),
})

export type SystemRouter = typeof systemRouter
