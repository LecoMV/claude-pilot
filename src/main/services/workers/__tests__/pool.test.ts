/**
 * Worker Pool Service Tests
 *
 * Comprehensive tests for the WorkerPoolService that manages Piscina-based
 * worker thread pools for CPU-intensive operations.
 *
 * Tests cover:
 * - Pool initialization and configuration
 * - Interactive pool task execution
 * - Background pool task execution
 * - Pool statistics and metrics
 * - Graceful shutdown
 * - Error handling scenarios
 *
 * @module pool.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Define mock functions using vi.hoisted for proper hoisting
const mockRun = vi.hoisted(() => vi.fn())
const mockDestroy = vi.hoisted(() => vi.fn())
const mockPiscinaConstructor = vi.hoisted(() => vi.fn())

// Mock Piscina before any imports
vi.mock('piscina', () => {
  return {
    default: mockPiscinaConstructor,
  }
})

// Mock os module
vi.mock('os', () => ({
  cpus: vi.fn(() => new Array(8).fill({ model: 'Test CPU' })),
}))

// Mock path module
vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
}))

// Mock electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('WorkerPoolService', () => {
  // Create fresh mock instance before each test
  beforeEach(() => {
    vi.clearAllMocks()
    mockRun.mockReset()
    mockDestroy.mockReset()
    mockDestroy.mockResolvedValue(undefined)

    // Reset Piscina constructor to return fresh mock instance
    mockPiscinaConstructor.mockImplementation(() => ({
      run: mockRun,
      destroy: mockDestroy,
      threads: [],
      queueSize: 0,
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Helper to get fresh module instance
  const getWorkerPoolModule = async () => {
    vi.resetModules()
    return import('../pool')
  }

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================
  describe('configuration', () => {
    it('should calculate default config based on CPU cores', async () => {
      const { workerPool } = await getWorkerPoolModule()

      const config = workerPool.getConfig()

      // With 8 cores:
      // interactiveThreads = min(2, max(1, floor(8 * 0.1))) = min(2, max(1, 0)) = 1
      // backgroundThreads = max(1, 8 - 3 - 2) = max(1, 3) = 3
      expect(config.interactiveThreads).toBeGreaterThanOrEqual(1)
      expect(config.interactiveThreads).toBeLessThanOrEqual(2)
      expect(config.backgroundThreads).toBeGreaterThanOrEqual(1)
      expect(config.maxQueue).toBe(1000)
      expect(config.idleTimeout).toBe(30000)
    })

    it('should update configuration', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.updateConfig({ maxQueue: 2000 })

      const config = workerPool.getConfig()
      expect(config.maxQueue).toBe(2000)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config updated')
      )
      consoleSpy.mockRestore()
    })

    it('should accept custom configuration via updateConfig', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.updateConfig({
        interactiveThreads: 4,
        backgroundThreads: 8,
        maxQueue: 500,
        idleTimeout: 60000,
      })

      const config = workerPool.getConfig()
      expect(config.interactiveThreads).toBe(4)
      expect(config.backgroundThreads).toBe(8)
      expect(config.maxQueue).toBe(500)
      expect(config.idleTimeout).toBe(60000)
      consoleSpy.mockRestore()
    })

    it('should preserve config values not updated', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      const originalConfig = workerPool.getConfig()
      workerPool.updateConfig({ maxQueue: 500 })

      const config = workerPool.getConfig()
      expect(config.idleTimeout).toBe(originalConfig.idleTimeout)
      expect(config.maxQueue).toBe(500)
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('initialization', () => {
    it('should initialize worker pools', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()

      expect(workerPool.isInitialized()).toBe(true)
      expect(mockPiscinaConstructor).toHaveBeenCalledTimes(2) // Interactive + Background
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialized')
      )
      consoleSpy.mockRestore()
    })

    it('should not reinitialize if already initialized', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()
      mockPiscinaConstructor.mockClear()
      workerPool.initialize()

      expect(mockPiscinaConstructor).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already initialized')
      )
      consoleSpy.mockRestore()
    })

    it('should create interactive pool with correct config', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()

      // Find the call that created the interactive pool
      const interactiveCall = mockPiscinaConstructor.mock.calls.find(
        (call) => call[0]?.workerData?.poolType === 'interactive'
      )
      expect(interactiveCall).toBeDefined()
      expect(interactiveCall?.[0]).toMatchObject({
        minThreads: 1,
        workerData: {
          poolType: 'interactive',
          sharedBufferEnabled: true,
        },
      })
      consoleSpy.mockRestore()
    })

    it('should create background pool with correct config', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()

      // Find the call that created the background pool
      const backgroundCall = mockPiscinaConstructor.mock.calls.find(
        (call) => call[0]?.workerData?.poolType === 'background'
      )
      expect(backgroundCall).toBeDefined()
      expect(backgroundCall?.[0]).toMatchObject({
        minThreads: 0, // Background pool can fully cleanup
        workerData: {
          poolType: 'background',
          sharedBufferEnabled: true,
        },
      })
      consoleSpy.mockRestore()
    })

    it('should report not initialized before initialize called', async () => {
      const { workerPool } = await getWorkerPoolModule()

      expect(workerPool.isInitialized()).toBe(false)
    })
  })

  // ===========================================================================
  // INTERACTIVE POOL TESTS
  // ===========================================================================
  describe('runInteractive', () => {
    it('should throw error if pool not initialized', async () => {
      const { workerPool } = await getWorkerPoolModule()

      await expect(
        workerPool.runInteractive('testTask', { data: 'test' })
      ).rejects.toThrow('Interactive pool not initialized')
    })

    it('should execute task on interactive pool', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue({ result: 'success' })

      workerPool.initialize()
      const result = await workerPool.runInteractive('embedText', {
        text: 'hello world',
      })

      expect(mockRun).toHaveBeenCalledWith(
        { task: 'embedText', data: { text: 'hello world' } },
        { transferList: undefined }
      )
      expect(result.result).toEqual({ result: 'success' })
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(result.workerId).toBe(0)
      consoleSpy.mockRestore()
    })

    it('should track completed task count', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      await workerPool.runInteractive('task1', {})
      await workerPool.runInteractive('task2', {})
      await workerPool.runInteractive('task3', {})

      const stats = workerPool.getStats()
      expect(stats.interactive.completedTasks).toBe(3)
      consoleSpy.mockRestore()
    })

    it('should calculate average duration', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      await workerPool.runInteractive('task1', {})
      await workerPool.runInteractive('task2', {})

      const stats = workerPool.getStats()
      expect(stats.interactive.averageDuration).toBeGreaterThanOrEqual(0)
      consoleSpy.mockRestore()
    })

    it('should pass transferList for zero-copy transfer', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      const buffer = new ArrayBuffer(1024)
      await workerPool.runInteractive('processBuffer', { buffer }, [buffer])

      expect(mockRun).toHaveBeenCalledWith(expect.any(Object), {
        transferList: [buffer],
      })
      consoleSpy.mockRestore()
    })

    it('should handle task errors', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockRejectedValue(new Error('Task failed'))

      workerPool.initialize()

      await expect(workerPool.runInteractive('failingTask', {})).rejects.toThrow(
        'Task failed'
      )
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // BACKGROUND POOL TESTS
  // ===========================================================================
  describe('runBackground', () => {
    it('should throw error if pool not initialized', async () => {
      const { workerPool } = await getWorkerPoolModule()

      await expect(
        workerPool.runBackground('testTask', { data: 'test' })
      ).rejects.toThrow('Background pool not initialized')
    })

    it('should execute task on background pool', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue({ indexed: 100 })

      workerPool.initialize()
      const result = await workerPool.runBackground('indexCodebase', {
        path: '/project',
      })

      expect(mockRun).toHaveBeenCalledWith(
        { task: 'indexCodebase', data: { path: '/project' } },
        { transferList: undefined }
      )
      expect(result.result).toEqual({ indexed: 100 })
      consoleSpy.mockRestore()
    })

    it('should track background completed task count', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      await workerPool.runBackground('task1', {})
      await workerPool.runBackground('task2', {})

      const stats = workerPool.getStats()
      expect(stats.background.completedTasks).toBe(2)
      consoleSpy.mockRestore()
    })

    it('should calculate background average duration', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      await workerPool.runBackground('task1', {})

      const stats = workerPool.getStats()
      expect(stats.background.averageDuration).toBeGreaterThanOrEqual(0)
      consoleSpy.mockRestore()
    })

    it('should handle background task errors', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockRejectedValue(new Error('Background task failed'))

      workerPool.initialize()

      await expect(workerPool.runBackground('failingTask', {})).rejects.toThrow(
        'Background task failed'
      )
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // STATISTICS TESTS
  // ===========================================================================
  describe('getStats', () => {
    it('should return pool statistics', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()
      const stats = workerPool.getStats()

      expect(stats).toHaveProperty('interactive')
      expect(stats).toHaveProperty('background')
      expect(stats).toHaveProperty('totalTasks')
      expect(stats).toHaveProperty('sharedArrayBufferEnabled')
      consoleSpy.mockRestore()
    })

    it('should return zero stats before any tasks', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()
      const stats = workerPool.getStats()

      expect(stats.interactive.completedTasks).toBe(0)
      expect(stats.background.completedTasks).toBe(0)
      expect(stats.totalTasks).toBe(0)
      expect(stats.interactive.averageDuration).toBe(0)
      expect(stats.background.averageDuration).toBe(0)
      consoleSpy.mockRestore()
    })

    it('should aggregate total tasks from both pools', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      await workerPool.runInteractive('task1', {})
      await workerPool.runInteractive('task2', {})
      await workerPool.runBackground('task3', {})

      const stats = workerPool.getStats()
      expect(stats.totalTasks).toBe(3)
      consoleSpy.mockRestore()
    })

    it('should report SharedArrayBuffer availability', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()
      const stats = workerPool.getStats()

      // SharedArrayBuffer should be available in test environment
      expect(typeof stats.sharedArrayBufferEnabled).toBe('boolean')
      consoleSpy.mockRestore()
    })

    it('should report thread counts from config', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()
      const stats = workerPool.getStats()

      expect(stats.interactive.threads).toBeGreaterThanOrEqual(1)
      expect(stats.background.threads).toBeGreaterThanOrEqual(1)
      consoleSpy.mockRestore()
    })

    it('should return zero for pools when not initialized', async () => {
      const { workerPool } = await getWorkerPoolModule()

      const stats = workerPool.getStats()

      expect(stats.interactive.activeThreads).toBe(0)
      expect(stats.interactive.queuedTasks).toBe(0)
      expect(stats.background.activeThreads).toBe(0)
      expect(stats.background.queuedTasks).toBe(0)
    })
  })

  // ===========================================================================
  // SHUTDOWN TESTS
  // ===========================================================================
  describe('shutdown', () => {
    it('should gracefully shutdown both pools', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockDestroy.mockResolvedValue(undefined)

      workerPool.initialize()
      await workerPool.shutdown()

      expect(mockDestroy).toHaveBeenCalledTimes(2)
      expect(workerPool.isInitialized()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutdown complete')
      )
      consoleSpy.mockRestore()
    })

    it('should handle shutdown when not initialized', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      await workerPool.shutdown()

      expect(mockDestroy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle shutdown errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockDestroy.mockRejectedValue(new Error('Shutdown failed'))

      workerPool.initialize()

      // Should not throw, but may reject
      await expect(workerPool.shutdown()).rejects.toThrow('Shutdown failed')
      consoleSpy.mockRestore()
    })

    it('should allow reinitialization after shutdown', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockDestroy.mockResolvedValue(undefined)

      workerPool.initialize()
      await workerPool.shutdown()

      mockPiscinaConstructor.mockClear()
      workerPool.initialize()

      expect(workerPool.isInitialized()).toBe(true)
      expect(mockPiscinaConstructor).toHaveBeenCalledTimes(2)
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent task execution', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()

      const tasks = Array(10)
        .fill(null)
        .map((_, i) => workerPool.runInteractive(`task${i}`, { index: i }))

      const results = await Promise.all(tasks)

      expect(results).toHaveLength(10)
      results.forEach((result) => {
        expect(result.result).toBe('result')
      })
      consoleSpy.mockRestore()
    })

    it('should handle mixed pool execution', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()

      const [interactive, background] = await Promise.all([
        workerPool.runInteractive('interactiveTask', {}),
        workerPool.runBackground('backgroundTask', {}),
      ])

      expect(interactive.result).toBe('result')
      expect(background.result).toBe('result')

      const stats = workerPool.getStats()
      expect(stats.totalTasks).toBe(2)
      consoleSpy.mockRestore()
    })

    it('should handle large data payloads', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      const largeData = { array: new Array(10000).fill('data') }
      mockRun.mockResolvedValue({ processed: true })

      workerPool.initialize()
      const result = await workerPool.runBackground('processLarge', largeData)

      expect(result.result).toEqual({ processed: true })
      consoleSpy.mockRestore()
    })

    it('should handle undefined task data', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      const result = await workerPool.runInteractive('noData', undefined)

      expect(mockRun).toHaveBeenCalledWith(
        { task: 'noData', data: undefined },
        { transferList: undefined }
      )
      expect(result.result).toBe('result')
      consoleSpy.mockRestore()
    })

    it('should handle null task data', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('result')

      workerPool.initialize()
      const result = await workerPool.runInteractive('nullData', null)

      expect(mockRun).toHaveBeenCalledWith(
        { task: 'nullData', data: null },
        { transferList: undefined }
      )
      expect(result.result).toBe('result')
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // TYPE EXPORTS TESTS
  // ===========================================================================
  describe('type exports', () => {
    it('should export PoolConfig type', async () => {
      const poolModule = await getWorkerPoolModule()

      // TypeScript would fail compilation if types weren't exported
      // We verify by checking the config structure
      const config = poolModule.workerPool.getConfig()
      expect(config).toHaveProperty('interactiveThreads')
      expect(config).toHaveProperty('backgroundThreads')
      expect(config).toHaveProperty('maxQueue')
      expect(config).toHaveProperty('idleTimeout')
    })

    it('should export TaskResult type', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()
      mockRun.mockResolvedValue('test')

      workerPool.initialize()
      const result = await workerPool.runInteractive('test', {})

      expect(result).toHaveProperty('result')
      expect(result).toHaveProperty('duration')
      expect(result).toHaveProperty('workerId')
      consoleSpy.mockRestore()
    })

    it('should export PoolStats type', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { workerPool } = await getWorkerPoolModule()

      workerPool.initialize()
      const stats = workerPool.getStats()

      expect(stats).toHaveProperty('interactive')
      expect(stats).toHaveProperty('background')
      expect(stats).toHaveProperty('totalTasks')
      expect(stats).toHaveProperty('sharedArrayBufferEnabled')
      expect(stats.interactive).toHaveProperty('threads')
      expect(stats.interactive).toHaveProperty('activeThreads')
      expect(stats.interactive).toHaveProperty('queuedTasks')
      expect(stats.interactive).toHaveProperty('completedTasks')
      expect(stats.interactive).toHaveProperty('averageDuration')
      consoleSpy.mockRestore()
    })
  })
})
