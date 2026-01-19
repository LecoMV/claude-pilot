/**
 * Workers Controller Tests
 *
 * Comprehensive tests for the workers tRPC controller.
 * Tests all 3 procedures: stats, isReady, getConfig
 *
 * @module workers.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { workersRouter } from '../workers.controller'

// Mock the worker pool service
vi.mock('../../../services/workers', () => ({
  workerPool: {
    getStats: vi.fn(),
    isInitialized: vi.fn(),
    getConfig: vi.fn(),
  },
}))

import { workerPool } from '../../../services/workers'

// Create a test caller
const createTestCaller = () => workersRouter.createCaller({})

describe('workers.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return worker pool statistics', async () => {
      const mockStats = {
        interactive: {
          threads: 2,
          activeThreads: 1,
          queuedTasks: 0,
          completedTasks: 150,
          averageDuration: 25.5,
        },
        background: {
          threads: 6,
          activeThreads: 3,
          queuedTasks: 5,
          completedTasks: 1000,
          averageDuration: 120.8,
        },
        totalTasks: 1150,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result).toEqual(mockStats)
      expect(workerPool.getStats).toHaveBeenCalledTimes(1)
    })

    it('should return stats when pools not initialized', async () => {
      const mockStats = {
        interactive: {
          threads: 2,
          activeThreads: 0,
          queuedTasks: 0,
          completedTasks: 0,
          averageDuration: 0,
        },
        background: {
          threads: 4,
          activeThreads: 0,
          queuedTasks: 0,
          completedTasks: 0,
          averageDuration: 0,
        },
        totalTasks: 0,
        sharedArrayBufferEnabled: false,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.totalTasks).toBe(0)
      expect(result.interactive.activeThreads).toBe(0)
      expect(result.background.activeThreads).toBe(0)
    })

    it('should return interactive pool stats', async () => {
      const mockStats = {
        interactive: {
          threads: 2,
          activeThreads: 2,
          queuedTasks: 10,
          completedTasks: 500,
          averageDuration: 15.3,
        },
        background: {
          threads: 6,
          activeThreads: 0,
          queuedTasks: 0,
          completedTasks: 0,
          averageDuration: 0,
        },
        totalTasks: 500,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.interactive.threads).toBe(2)
      expect(result.interactive.activeThreads).toBe(2)
      expect(result.interactive.queuedTasks).toBe(10)
      expect(result.interactive.completedTasks).toBe(500)
      expect(result.interactive.averageDuration).toBe(15.3)
    })

    it('should return background pool stats', async () => {
      const mockStats = {
        interactive: {
          threads: 2,
          activeThreads: 0,
          queuedTasks: 0,
          completedTasks: 0,
          averageDuration: 0,
        },
        background: {
          threads: 8,
          activeThreads: 8,
          queuedTasks: 100,
          completedTasks: 5000,
          averageDuration: 250.75,
        },
        totalTasks: 5000,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.background.threads).toBe(8)
      expect(result.background.activeThreads).toBe(8)
      expect(result.background.queuedTasks).toBe(100)
      expect(result.background.completedTasks).toBe(5000)
      expect(result.background.averageDuration).toBe(250.75)
    })

    it('should include sharedArrayBufferEnabled status', async () => {
      const mockStatsEnabled = {
        interactive: { threads: 2, activeThreads: 0, queuedTasks: 0, completedTasks: 0, averageDuration: 0 },
        background: { threads: 4, activeThreads: 0, queuedTasks: 0, completedTasks: 0, averageDuration: 0 },
        totalTasks: 0,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStatsEnabled)

      let result = await caller.stats()
      expect(result.sharedArrayBufferEnabled).toBe(true)

      const mockStatsDisabled = { ...mockStatsEnabled, sharedArrayBufferEnabled: false }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStatsDisabled)

      result = await caller.stats()
      expect(result.sharedArrayBufferEnabled).toBe(false)
    })

    it('should handle high task counts', async () => {
      const mockStats = {
        interactive: {
          threads: 2,
          activeThreads: 2,
          queuedTasks: 0,
          completedTasks: 1_000_000,
          averageDuration: 10.5,
        },
        background: {
          threads: 8,
          activeThreads: 8,
          queuedTasks: 50000,
          completedTasks: 10_000_000,
          averageDuration: 50.25,
        },
        totalTasks: 11_000_000,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.totalTasks).toBe(11_000_000)
      expect(result.interactive.completedTasks).toBe(1_000_000)
      expect(result.background.completedTasks).toBe(10_000_000)
    })

    it('should handle fractional average durations', async () => {
      const mockStats = {
        interactive: {
          threads: 2,
          activeThreads: 1,
          queuedTasks: 0,
          completedTasks: 100,
          averageDuration: 0.123456789,
        },
        background: {
          threads: 4,
          activeThreads: 2,
          queuedTasks: 0,
          completedTasks: 200,
          averageDuration: 9999.999999,
        },
        totalTasks: 300,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.interactive.averageDuration).toBeCloseTo(0.123456789, 6)
      expect(result.background.averageDuration).toBeCloseTo(9999.999999, 6)
    })
  })

  // ===========================================================================
  // IS READY PROCEDURE
  // ===========================================================================
  describe('isReady', () => {
    it('should return true when pools are initialized', async () => {
      vi.mocked(workerPool.isInitialized).mockReturnValue(true)

      const result = await caller.isReady()

      expect(result).toBe(true)
      expect(workerPool.isInitialized).toHaveBeenCalledTimes(1)
    })

    it('should return false when pools are not initialized', async () => {
      vi.mocked(workerPool.isInitialized).mockReturnValue(false)

      const result = await caller.isReady()

      expect(result).toBe(false)
    })

    it('should be callable multiple times', async () => {
      vi.mocked(workerPool.isInitialized).mockReturnValue(true)

      const result1 = await caller.isReady()
      const result2 = await caller.isReady()
      const result3 = await caller.isReady()

      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(result3).toBe(true)
      expect(workerPool.isInitialized).toHaveBeenCalledTimes(3)
    })

    it('should reflect changing initialization state', async () => {
      // First not initialized
      vi.mocked(workerPool.isInitialized).mockReturnValueOnce(false)
      let result = await caller.isReady()
      expect(result).toBe(false)

      // Then initialized
      vi.mocked(workerPool.isInitialized).mockReturnValueOnce(true)
      result = await caller.isReady()
      expect(result).toBe(true)

      // Then shutdown
      vi.mocked(workerPool.isInitialized).mockReturnValueOnce(false)
      result = await caller.isReady()
      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // GET CONFIG PROCEDURE
  // ===========================================================================
  describe('getConfig', () => {
    it('should return pool configuration', async () => {
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 6,
        maxQueue: 1000,
        idleTimeout: 30000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result).toEqual(mockConfig)
      expect(workerPool.getConfig).toHaveBeenCalledTimes(1)
    })

    it('should return interactiveThreads count', async () => {
      const mockConfig = {
        interactiveThreads: 4,
        backgroundThreads: 8,
        maxQueue: 500,
        idleTimeout: 60000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result.interactiveThreads).toBe(4)
    })

    it('should return backgroundThreads count', async () => {
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 12,
        maxQueue: 2000,
        idleTimeout: 45000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result.backgroundThreads).toBe(12)
    })

    it('should return maxQueue limit', async () => {
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 6,
        maxQueue: 5000,
        idleTimeout: 30000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result.maxQueue).toBe(5000)
    })

    it('should return idleTimeout value', async () => {
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 6,
        maxQueue: 1000,
        idleTimeout: 120000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result.idleTimeout).toBe(120000)
    })

    it('should return default configuration values', async () => {
      // Default config based on pool.ts
      const defaultConfig = {
        interactiveThreads: 1,
        backgroundThreads: 1,
        maxQueue: 1000,
        idleTimeout: 30000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(defaultConfig)

      const result = await caller.getConfig()

      expect(result.interactiveThreads).toBeGreaterThanOrEqual(1)
      expect(result.backgroundThreads).toBeGreaterThanOrEqual(1)
      expect(result.maxQueue).toBeGreaterThan(0)
      expect(result.idleTimeout).toBeGreaterThan(0)
    })

    it('should handle custom configuration values', async () => {
      const customConfig = {
        interactiveThreads: 8,
        backgroundThreads: 32,
        maxQueue: 10000,
        idleTimeout: 300000, // 5 minutes
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(customConfig)

      const result = await caller.getConfig()

      expect(result).toEqual(customConfig)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent stats queries', async () => {
      const mockStats = {
        interactive: { threads: 2, activeThreads: 1, queuedTasks: 0, completedTasks: 100, averageDuration: 10 },
        background: { threads: 4, activeThreads: 2, queuedTasks: 0, completedTasks: 200, averageDuration: 20 },
        totalTasks: 300,
        sharedArrayBufferEnabled: true,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const results = await Promise.all([
        caller.stats(),
        caller.stats(),
        caller.stats(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toEqual(mockStats))
    })

    it('should handle concurrent isReady queries', async () => {
      vi.mocked(workerPool.isInitialized).mockReturnValue(true)

      const results = await Promise.all([
        caller.isReady(),
        caller.isReady(),
        caller.isReady(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toBe(true))
    })

    it('should handle concurrent getConfig queries', async () => {
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 4,
        maxQueue: 1000,
        idleTimeout: 30000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const results = await Promise.all([
        caller.getConfig(),
        caller.getConfig(),
        caller.getConfig(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toEqual(mockConfig))
    })

    it('should handle all queries in parallel', async () => {
      const mockStats = {
        interactive: { threads: 2, activeThreads: 0, queuedTasks: 0, completedTasks: 0, averageDuration: 0 },
        background: { threads: 4, activeThreads: 0, queuedTasks: 0, completedTasks: 0, averageDuration: 0 },
        totalTasks: 0,
        sharedArrayBufferEnabled: true,
      }
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 4,
        maxQueue: 1000,
        idleTimeout: 30000,
      }
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)
      vi.mocked(workerPool.isInitialized).mockReturnValue(true)
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const [stats, ready, config] = await Promise.all([
        caller.stats(),
        caller.isReady(),
        caller.getConfig(),
      ])

      expect(stats).toEqual(mockStats)
      expect(ready).toBe(true)
      expect(config).toEqual(mockConfig)
    })

    it('should handle zero threads configuration', async () => {
      // Edge case: misconfigured system
      const mockConfig = {
        interactiveThreads: 0,
        backgroundThreads: 0,
        maxQueue: 1000,
        idleTimeout: 30000,
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result.interactiveThreads).toBe(0)
      expect(result.backgroundThreads).toBe(0)
    })

    it('should handle maximum thread counts', async () => {
      const mockConfig = {
        interactiveThreads: 128,
        backgroundThreads: 256,
        maxQueue: 100000,
        idleTimeout: 3600000, // 1 hour
      }
      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)

      const result = await caller.getConfig()

      expect(result.interactiveThreads).toBe(128)
      expect(result.backgroundThreads).toBe(256)
      expect(result.maxQueue).toBe(100000)
    })
  })

  // ===========================================================================
  // INTEGRATION-LIKE TESTS
  // ===========================================================================
  describe('integration scenarios', () => {
    it('should show initialization lifecycle', async () => {
      // Before initialization
      vi.mocked(workerPool.isInitialized).mockReturnValueOnce(false)
      vi.mocked(workerPool.getStats).mockReturnValueOnce({
        interactive: { threads: 2, activeThreads: 0, queuedTasks: 0, completedTasks: 0, averageDuration: 0 },
        background: { threads: 4, activeThreads: 0, queuedTasks: 0, completedTasks: 0, averageDuration: 0 },
        totalTasks: 0,
        sharedArrayBufferEnabled: true,
      })

      let ready = await caller.isReady()
      expect(ready).toBe(false)

      let stats = await caller.stats()
      expect(stats.totalTasks).toBe(0)

      // After initialization
      vi.mocked(workerPool.isInitialized).mockReturnValueOnce(true)
      vi.mocked(workerPool.getStats).mockReturnValueOnce({
        interactive: { threads: 2, activeThreads: 2, queuedTasks: 5, completedTasks: 100, averageDuration: 15 },
        background: { threads: 4, activeThreads: 4, queuedTasks: 20, completedTasks: 500, averageDuration: 50 },
        totalTasks: 600,
        sharedArrayBufferEnabled: true,
      })

      ready = await caller.isReady()
      expect(ready).toBe(true)

      stats = await caller.stats()
      expect(stats.totalTasks).toBe(600)
      expect(stats.interactive.activeThreads).toBe(2)
      expect(stats.background.activeThreads).toBe(4)
    })

    it('should reflect workload changes in stats', async () => {
      // Light workload
      vi.mocked(workerPool.getStats).mockReturnValueOnce({
        interactive: { threads: 2, activeThreads: 1, queuedTasks: 0, completedTasks: 50, averageDuration: 10 },
        background: { threads: 8, activeThreads: 2, queuedTasks: 0, completedTasks: 100, averageDuration: 100 },
        totalTasks: 150,
        sharedArrayBufferEnabled: true,
      })

      let stats = await caller.stats()
      expect(stats.interactive.activeThreads).toBe(1)
      expect(stats.background.queuedTasks).toBe(0)

      // Heavy workload
      vi.mocked(workerPool.getStats).mockReturnValueOnce({
        interactive: { threads: 2, activeThreads: 2, queuedTasks: 50, completedTasks: 500, averageDuration: 8 },
        background: { threads: 8, activeThreads: 8, queuedTasks: 1000, completedTasks: 10000, averageDuration: 80 },
        totalTasks: 10500,
        sharedArrayBufferEnabled: true,
      })

      stats = await caller.stats()
      expect(stats.interactive.activeThreads).toBe(2)
      expect(stats.interactive.queuedTasks).toBe(50)
      expect(stats.background.activeThreads).toBe(8)
      expect(stats.background.queuedTasks).toBe(1000)
    })

    it('should provide consistent config and stats', async () => {
      const mockConfig = {
        interactiveThreads: 2,
        backgroundThreads: 6,
        maxQueue: 1000,
        idleTimeout: 30000,
      }
      const mockStats = {
        interactive: { threads: 2, activeThreads: 1, queuedTasks: 0, completedTasks: 100, averageDuration: 15 },
        background: { threads: 6, activeThreads: 3, queuedTasks: 5, completedTasks: 500, averageDuration: 50 },
        totalTasks: 600,
        sharedArrayBufferEnabled: true,
      }

      vi.mocked(workerPool.getConfig).mockReturnValue(mockConfig)
      vi.mocked(workerPool.getStats).mockReturnValue(mockStats)

      const [config, stats] = await Promise.all([
        caller.getConfig(),
        caller.stats(),
      ])

      // Stats threads should match config
      expect(stats.interactive.threads).toBe(config.interactiveThreads)
      expect(stats.background.threads).toBe(config.backgroundThreads)
    })
  })
})
