/**
 * Worker Pool Service - Piscina-based Worker Thread Management
 *
 * Implements the worker pool architecture from Gemini research (deploy-scb9):
 * - Interactive pool: 2 high-priority threads for responsive operations
 * - Background pool: Remaining threads for batch processing
 * - SharedArrayBuffer support enabled via COOP/COEP headers
 *
 * @see docs/Research/Electron Worker Thread Optimization Strategies.md
 */

import Piscina from 'piscina'
import { cpus } from 'os'
import { join } from 'path'
import { app } from 'electron'

/**
 * Worker pool configuration
 */
interface PoolConfig {
  /** Maximum threads for interactive operations */
  interactiveThreads: number
  /** Maximum threads for background operations */
  backgroundThreads: number
  /** Task queue size before backpressure */
  maxQueue: number
  /** Idle timeout before thread cleanup (ms) */
  idleTimeout: number
}

/**
 * Worker task result with timing metrics
 */
interface TaskResult<T = unknown> {
  result: T
  duration: number
  workerId: number
}

/**
 * Worker pool statistics
 */
interface PoolStats {
  interactive: {
    threads: number
    activeThreads: number
    queuedTasks: number
    completedTasks: number
    averageDuration: number
  }
  background: {
    threads: number
    activeThreads: number
    queuedTasks: number
    completedTasks: number
    averageDuration: number
  }
  totalTasks: number
  sharedArrayBufferEnabled: boolean
}

/**
 * Default pool configuration based on available CPU cores
 */
function getDefaultConfig(): PoolConfig {
  const totalCores = cpus().length

  return {
    // Reserve 2 cores for interactive (high priority) tasks
    interactiveThreads: Math.min(2, Math.max(1, Math.floor(totalCores * 0.1))),
    // Use remaining cores for background tasks, leaving 3 for main process + system
    backgroundThreads: Math.max(1, totalCores - 3 - 2),
    maxQueue: 1000,
    idleTimeout: 30000,
  }
}

/**
 * Worker Pool Manager
 *
 * Manages two worker pools:
 * - Interactive: For UI-responsive tasks (embedding generation, quick file analysis)
 * - Background: For batch processing (bulk embedding, codebase indexing)
 */
class WorkerPoolService {
  private interactivePool: Piscina | null = null
  private backgroundPool: Piscina | null = null
  private config: PoolConfig
  private initialized = false

  // Metrics
  private completedInteractive = 0
  private completedBackground = 0
  private totalDurationInteractive = 0
  private totalDurationBackground = 0

  constructor(config: Partial<PoolConfig> = {}) {
    const defaults = getDefaultConfig()
    this.config = { ...defaults, ...config }
  }

  /**
   * Initialize worker pools
   *
   * Must be called after app.whenReady() for proper worker setup
   */
  initialize(): void {
    if (this.initialized) {
      console.info('[WorkerPool] Already initialized')
      return
    }

    const workerDir = app.isPackaged
      ? join(process.resourcesPath, 'workers')
      : join(__dirname, '../../workers')

    // Interactive pool: High priority, limited threads
    this.interactivePool = new Piscina({
      filename: join(workerDir, 'interactive.js'),
      maxThreads: this.config.interactiveThreads,
      minThreads: 1,
      idleTimeout: this.config.idleTimeout,
      maxQueue: this.config.maxQueue,
      // Enable SharedArrayBuffer via worker options
      workerData: {
        poolType: 'interactive',
        sharedBufferEnabled: true,
      },
    })

    // Background pool: Low priority, many threads
    this.backgroundPool = new Piscina({
      filename: join(workerDir, 'batch.js'),
      maxThreads: this.config.backgroundThreads,
      minThreads: 0, // Allow full cleanup when idle
      idleTimeout: this.config.idleTimeout,
      maxQueue: this.config.maxQueue,
      workerData: {
        poolType: 'background',
        sharedBufferEnabled: true,
      },
    })

    this.initialized = true
    console.info(
      `[WorkerPool] Initialized: ${this.config.interactiveThreads} interactive, ${this.config.backgroundThreads} background threads`
    )
  }

  /**
   * Run a task on the interactive pool (high priority)
   *
   * Use for:
   * - Real-time embedding generation
   * - Quick file analysis
   * - User-facing computations
   */
  async runInteractive<T = unknown>(
    taskName: string,
    data: unknown,
    transferList?: Transferable[]
  ): Promise<TaskResult<T>> {
    if (!this.interactivePool) {
      throw new Error('[WorkerPool] Interactive pool not initialized')
    }

    const start = performance.now()

    const result = await this.interactivePool.run(
      { task: taskName, data },
      { transferList: transferList as never }
    )

    const duration = performance.now() - start
    this.completedInteractive++
    this.totalDurationInteractive += duration

    return {
      result: result as T,
      duration,
      workerId: 0, // Piscina doesn't expose worker ID directly
    }
  }

  /**
   * Run a task on the background pool (low priority)
   *
   * Use for:
   * - Bulk embedding generation
   * - Codebase indexing
   * - Batch file processing
   */
  async runBackground<T = unknown>(
    taskName: string,
    data: unknown,
    transferList?: Transferable[]
  ): Promise<TaskResult<T>> {
    if (!this.backgroundPool) {
      throw new Error('[WorkerPool] Background pool not initialized')
    }

    const start = performance.now()

    const result = await this.backgroundPool.run(
      { task: taskName, data },
      { transferList: transferList as never }
    )

    const duration = performance.now() - start
    this.completedBackground++
    this.totalDurationBackground += duration

    return {
      result: result as T,
      duration,
      workerId: 0,
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      interactive: {
        threads: this.config.interactiveThreads,
        activeThreads: this.interactivePool?.threads.length ?? 0,
        queuedTasks: this.interactivePool?.queueSize ?? 0,
        completedTasks: this.completedInteractive,
        averageDuration:
          this.completedInteractive > 0
            ? this.totalDurationInteractive / this.completedInteractive
            : 0,
      },
      background: {
        threads: this.config.backgroundThreads,
        activeThreads: this.backgroundPool?.threads.length ?? 0,
        queuedTasks: this.backgroundPool?.queueSize ?? 0,
        completedTasks: this.completedBackground,
        averageDuration:
          this.completedBackground > 0
            ? this.totalDurationBackground / this.completedBackground
            : 0,
      },
      totalTasks: this.completedInteractive + this.completedBackground,
      // SharedArrayBuffer is enabled via COOP/COEP headers in main process
      sharedArrayBufferEnabled: typeof SharedArrayBuffer !== 'undefined',
    }
  }

  /**
   * Gracefully shutdown worker pools
   */
  async shutdown(): Promise<void> {
    console.info('[WorkerPool] Shutting down...')

    const shutdownPromises: Promise<void>[] = []

    if (this.interactivePool) {
      shutdownPromises.push(this.interactivePool.destroy())
    }

    if (this.backgroundPool) {
      shutdownPromises.push(this.backgroundPool.destroy())
    }

    await Promise.all(shutdownPromises)

    this.interactivePool = null
    this.backgroundPool = null
    this.initialized = false

    console.info('[WorkerPool] Shutdown complete')
  }

  /**
   * Check if pools are initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Get pool configuration
   */
  getConfig(): PoolConfig {
    return { ...this.config }
  }

  /**
   * Update pool configuration (requires restart)
   */
  updateConfig(config: Partial<PoolConfig>): void {
    this.config = { ...this.config, ...config }
    console.info('[WorkerPool] Config updated. Restart pools to apply changes.')
  }
}

// Singleton instance
export const workerPool = new WorkerPoolService()

// Export types
export type { PoolConfig, TaskResult, PoolStats }
