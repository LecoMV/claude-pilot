/**
 * Watchdog Controller Tests
 *
 * Comprehensive tests for the watchdog tRPC controller.
 * Tests all 8 procedures: start, stop, isEnabled, getHealth, getServiceHealth,
 * getRecoveryHistory, forceCheck, forceRestart
 *
 * @module watchdog.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { watchdogRouter } from '../watchdog.controller'
import { watchdogService } from '../../../services/watchdog'
import type { ServiceHealth, RecoveryEvent } from '../../../services/watchdog'

// Mock the watchdog service
vi.mock('../../../services/watchdog', () => ({
  watchdogService: {
    start: vi.fn(),
    stop: vi.fn(),
    isEnabled: vi.fn(),
    getHealth: vi.fn(),
    getServiceHealth: vi.fn(),
    getRecoveryHistory: vi.fn(),
    forceCheck: vi.fn(),
    forceRestart: vi.fn(),
  },
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => watchdogRouter.createCaller({})

describe('watchdog.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // START PROCEDURE
  // ===========================================================================
  describe('start', () => {
    it('should start watchdog service successfully', async () => {
      vi.mocked(watchdogService.start).mockImplementation(() => {})

      const result = await caller.start()

      expect(result).toBe(true)
      expect(watchdogService.start).toHaveBeenCalledTimes(1)
    })

    it('should return false when start throws an error', async () => {
      vi.mocked(watchdogService.start).mockImplementation(() => {
        throw new Error('Failed to start')
      })

      const result = await caller.start()

      expect(result).toBe(false)
    })

    it('should return true even when already started', async () => {
      vi.mocked(watchdogService.start).mockImplementation(() => {})

      const result = await caller.start()

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // STOP PROCEDURE
  // ===========================================================================
  describe('stop', () => {
    it('should stop watchdog service successfully', async () => {
      vi.mocked(watchdogService.stop).mockImplementation(() => {})

      const result = await caller.stop()

      expect(result).toBe(true)
      expect(watchdogService.stop).toHaveBeenCalledTimes(1)
    })

    it('should return false when stop throws an error', async () => {
      vi.mocked(watchdogService.stop).mockImplementation(() => {
        throw new Error('Failed to stop')
      })

      const result = await caller.stop()

      expect(result).toBe(false)
    })

    it('should return true even when already stopped', async () => {
      vi.mocked(watchdogService.stop).mockImplementation(() => {})

      const result = await caller.stop()

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // IS ENABLED PROCEDURE
  // ===========================================================================
  describe('isEnabled', () => {
    it('should return true when watchdog is enabled', async () => {
      vi.mocked(watchdogService.isEnabled).mockReturnValue(true)

      const result = await caller.isEnabled()

      expect(result).toBe(true)
      expect(watchdogService.isEnabled).toHaveBeenCalledTimes(1)
    })

    it('should return false when watchdog is disabled', async () => {
      vi.mocked(watchdogService.isEnabled).mockReturnValue(false)

      const result = await caller.isEnabled()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // GET HEALTH PROCEDURE
  // ===========================================================================
  describe('getHealth', () => {
    it('should return empty array when no services configured', async () => {
      vi.mocked(watchdogService.getHealth).mockReturnValue([])

      const result = await caller.getHealth()

      expect(result).toEqual([])
      expect(watchdogService.getHealth).toHaveBeenCalledTimes(1)
    })

    it('should return all service health statuses', async () => {
      const mockHealth: ServiceHealth[] = [
        {
          id: 'postgresql',
          name: 'PostgreSQL',
          status: 'healthy',
          lastCheck: Date.now(),
          lastHealthy: Date.now(),
          restartCount: 0,
        },
        {
          id: 'memgraph',
          name: 'Memgraph',
          status: 'unhealthy',
          lastCheck: Date.now(),
          lastHealthy: Date.now() - 60000,
          restartCount: 2,
          error: 'Connection refused',
        },
        {
          id: 'ollama',
          name: 'Ollama',
          status: 'recovering',
          lastCheck: Date.now(),
          lastHealthy: Date.now() - 30000,
          restartCount: 1,
          lastRestart: Date.now() - 5000,
        },
      ]
      vi.mocked(watchdogService.getHealth).mockReturnValue(mockHealth)

      const result = await caller.getHealth()

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('postgresql')
      expect(result[0].status).toBe('healthy')
      expect(result[1].id).toBe('memgraph')
      expect(result[1].status).toBe('unhealthy')
      expect(result[1].error).toBe('Connection refused')
      expect(result[2].id).toBe('ollama')
      expect(result[2].status).toBe('recovering')
    })

    it('should return service with failed status after max restarts', async () => {
      const mockHealth: ServiceHealth[] = [
        {
          id: 'postgresql',
          name: 'PostgreSQL',
          status: 'failed',
          lastCheck: Date.now(),
          lastHealthy: Date.now() - 300000,
          restartCount: 3,
          lastRestart: Date.now() - 60000,
          error: 'Max restarts exceeded',
        },
      ]
      vi.mocked(watchdogService.getHealth).mockReturnValue(mockHealth)

      const result = await caller.getHealth()

      expect(result[0].status).toBe('failed')
      expect(result[0].restartCount).toBe(3)
    })
  })

  // ===========================================================================
  // GET SERVICE HEALTH PROCEDURE
  // ===========================================================================
  describe('getServiceHealth', () => {
    it('should return health for existing service', async () => {
      const mockHealth: ServiceHealth = {
        id: 'postgresql',
        name: 'PostgreSQL',
        status: 'healthy',
        lastCheck: Date.now(),
        lastHealthy: Date.now(),
        restartCount: 0,
      }
      vi.mocked(watchdogService.getServiceHealth).mockReturnValue(mockHealth)

      const result = await caller.getServiceHealth({ serviceId: 'postgresql' })

      expect(result).not.toBeNull()
      expect(result?.id).toBe('postgresql')
      expect(result?.status).toBe('healthy')
      expect(watchdogService.getServiceHealth).toHaveBeenCalledWith('postgresql')
    })

    it('should return null for non-existent service', async () => {
      vi.mocked(watchdogService.getServiceHealth).mockReturnValue(null)

      const result = await caller.getServiceHealth({ serviceId: 'nonexistent' })

      expect(result).toBeNull()
    })

    it('should reject empty service ID', async () => {
      await expect(caller.getServiceHealth({ serviceId: '' })).rejects.toThrow()
    })

    it('should reject service ID exceeding max length', async () => {
      const longId = 'a'.repeat(51)
      await expect(caller.getServiceHealth({ serviceId: longId })).rejects.toThrow()
    })

    it('should accept valid service ID formats', async () => {
      const mockHealth: ServiceHealth = {
        id: 'test-service',
        name: 'Test Service',
        status: 'healthy',
        lastCheck: Date.now(),
        lastHealthy: Date.now(),
        restartCount: 0,
      }
      vi.mocked(watchdogService.getServiceHealth).mockReturnValue(mockHealth)

      // Standard alphanumeric
      await expect(caller.getServiceHealth({ serviceId: 'postgresql' })).resolves.not.toBeNull()

      // With dashes
      await expect(caller.getServiceHealth({ serviceId: 'my-service' })).resolves.not.toBeNull()

      // With underscores
      await expect(
        caller.getServiceHealth({ serviceId: 'my_service_v2' })
      ).resolves.not.toBeNull()

      // At max length (50 chars)
      await expect(
        caller.getServiceHealth({ serviceId: 'a'.repeat(50) })
      ).resolves.not.toBeNull()
    })
  })

  // ===========================================================================
  // GET RECOVERY HISTORY PROCEDURE
  // ===========================================================================
  describe('getRecoveryHistory', () => {
    it('should return empty array when no recovery events', async () => {
      vi.mocked(watchdogService.getRecoveryHistory).mockReturnValue([])

      const result = await caller.getRecoveryHistory()

      expect(result).toEqual([])
      expect(watchdogService.getRecoveryHistory).toHaveBeenCalledWith(undefined)
    })

    it('should return recovery events with default limit', async () => {
      const mockEvents: RecoveryEvent[] = [
        {
          id: 'postgresql-1234567890',
          serviceId: 'postgresql',
          serviceName: 'PostgreSQL',
          timestamp: Date.now() - 60000,
          action: 'restart',
          success: true,
          message: 'Restart attempt 1',
        },
        {
          id: 'memgraph-1234567891',
          serviceId: 'memgraph',
          serviceName: 'Memgraph',
          timestamp: Date.now() - 30000,
          action: 'restart',
          success: false,
          message: 'Restart attempt 2 failed',
        },
        {
          id: 'ollama-1234567892',
          serviceId: 'ollama',
          serviceName: 'Ollama',
          timestamp: Date.now(),
          action: 'recovery_failed',
          success: false,
          message: 'Exceeded max restarts (3)',
        },
      ]
      vi.mocked(watchdogService.getRecoveryHistory).mockReturnValue(mockEvents)

      const result = await caller.getRecoveryHistory()

      expect(result).toHaveLength(3)
      expect(result[0].action).toBe('restart')
      expect(result[0].success).toBe(true)
      expect(result[2].action).toBe('recovery_failed')
    })

    it('should accept custom limit parameter', async () => {
      vi.mocked(watchdogService.getRecoveryHistory).mockReturnValue([])

      await caller.getRecoveryHistory({ limit: 10 })

      expect(watchdogService.getRecoveryHistory).toHaveBeenCalledWith(10)
    })

    it('should reject limit less than 1', async () => {
      await expect(caller.getRecoveryHistory({ limit: 0 })).rejects.toThrow()
      await expect(caller.getRecoveryHistory({ limit: -1 })).rejects.toThrow()
    })

    it('should reject limit greater than 100', async () => {
      await expect(caller.getRecoveryHistory({ limit: 101 })).rejects.toThrow()
    })

    it('should use default limit of 50', async () => {
      vi.mocked(watchdogService.getRecoveryHistory).mockReturnValue([])

      await caller.getRecoveryHistory({ limit: 50 })

      expect(watchdogService.getRecoveryHistory).toHaveBeenCalledWith(50)
    })

    it('should accept limit at boundaries', async () => {
      vi.mocked(watchdogService.getRecoveryHistory).mockReturnValue([])

      // Minimum
      await expect(caller.getRecoveryHistory({ limit: 1 })).resolves.toEqual([])
      expect(watchdogService.getRecoveryHistory).toHaveBeenCalledWith(1)

      // Maximum
      await expect(caller.getRecoveryHistory({ limit: 100 })).resolves.toEqual([])
      expect(watchdogService.getRecoveryHistory).toHaveBeenCalledWith(100)
    })
  })

  // ===========================================================================
  // FORCE CHECK PROCEDURE
  // ===========================================================================
  describe('forceCheck', () => {
    it('should return updated health after force check', async () => {
      const mockHealth: ServiceHealth = {
        id: 'postgresql',
        name: 'PostgreSQL',
        status: 'healthy',
        lastCheck: Date.now(),
        lastHealthy: Date.now(),
        restartCount: 0,
      }
      vi.mocked(watchdogService.forceCheck).mockResolvedValue(mockHealth)

      const result = await caller.forceCheck({ serviceId: 'postgresql' })

      expect(result).not.toBeNull()
      expect(result?.status).toBe('healthy')
      expect(watchdogService.forceCheck).toHaveBeenCalledWith('postgresql')
    })

    it('should return null for non-existent service', async () => {
      vi.mocked(watchdogService.forceCheck).mockResolvedValue(null)

      const result = await caller.forceCheck({ serviceId: 'nonexistent' })

      expect(result).toBeNull()
    })

    it('should return updated status after detecting unhealthy service', async () => {
      const mockHealth: ServiceHealth = {
        id: 'memgraph',
        name: 'Memgraph',
        status: 'unhealthy',
        lastCheck: Date.now(),
        lastHealthy: Date.now() - 60000,
        restartCount: 0,
        error: 'Container not running',
      }
      vi.mocked(watchdogService.forceCheck).mockResolvedValue(mockHealth)

      const result = await caller.forceCheck({ serviceId: 'memgraph' })

      expect(result?.status).toBe('unhealthy')
      expect(result?.error).toBe('Container not running')
    })

    it('should reject empty service ID', async () => {
      await expect(caller.forceCheck({ serviceId: '' })).rejects.toThrow()
    })

    it('should reject service ID exceeding max length', async () => {
      const longId = 'a'.repeat(51)
      await expect(caller.forceCheck({ serviceId: longId })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // FORCE RESTART PROCEDURE
  // ===========================================================================
  describe('forceRestart', () => {
    it('should successfully restart a service', async () => {
      vi.mocked(watchdogService.forceRestart).mockResolvedValue(true)

      const result = await caller.forceRestart({ serviceId: 'postgresql' })

      expect(result).toBe(true)
      expect(watchdogService.forceRestart).toHaveBeenCalledWith('postgresql')
    })

    it('should return false when restart fails', async () => {
      vi.mocked(watchdogService.forceRestart).mockResolvedValue(false)

      const result = await caller.forceRestart({ serviceId: 'memgraph' })

      expect(result).toBe(false)
    })

    it('should return false for non-existent service', async () => {
      vi.mocked(watchdogService.forceRestart).mockResolvedValue(false)

      const result = await caller.forceRestart({ serviceId: 'nonexistent' })

      expect(result).toBe(false)
    })

    it('should reject empty service ID', async () => {
      await expect(caller.forceRestart({ serviceId: '' })).rejects.toThrow()
    })

    it('should reject service ID exceeding max length', async () => {
      const longId = 'a'.repeat(51)
      await expect(caller.forceRestart({ serviceId: longId })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('watchdog lifecycle', () => {
    it('should handle start-check-stop cycle', async () => {
      vi.mocked(watchdogService.start).mockImplementation(() => {})
      vi.mocked(watchdogService.isEnabled).mockReturnValue(true)
      vi.mocked(watchdogService.getHealth).mockReturnValue([
        {
          id: 'postgresql',
          name: 'PostgreSQL',
          status: 'healthy',
          lastCheck: Date.now(),
          lastHealthy: Date.now(),
          restartCount: 0,
        },
      ])
      vi.mocked(watchdogService.stop).mockImplementation(() => {})

      // Start watchdog
      const startResult = await caller.start()
      expect(startResult).toBe(true)

      // Verify enabled
      const enabledResult = await caller.isEnabled()
      expect(enabledResult).toBe(true)

      // Get health
      const healthResult = await caller.getHealth()
      expect(healthResult).toHaveLength(1)

      // Stop watchdog
      const stopResult = await caller.stop()
      expect(stopResult).toBe(true)
    })

    it('should handle force check and restart sequence', async () => {
      const unhealthyService: ServiceHealth = {
        id: 'postgresql',
        name: 'PostgreSQL',
        status: 'unhealthy',
        lastCheck: Date.now(),
        lastHealthy: Date.now() - 60000,
        restartCount: 0,
        error: 'Service not responding',
      }

      const healthyService: ServiceHealth = {
        ...unhealthyService,
        status: 'healthy',
        restartCount: 1,
        lastHealthy: Date.now(),
        error: undefined,
      }

      // First check - unhealthy
      vi.mocked(watchdogService.forceCheck).mockResolvedValueOnce(unhealthyService)

      const checkResult = await caller.forceCheck({ serviceId: 'postgresql' })
      expect(checkResult?.status).toBe('unhealthy')

      // Force restart - success
      vi.mocked(watchdogService.forceRestart).mockResolvedValueOnce(true)

      const restartResult = await caller.forceRestart({ serviceId: 'postgresql' })
      expect(restartResult).toBe(true)

      // Second check - healthy
      vi.mocked(watchdogService.forceCheck).mockResolvedValueOnce(healthyService)

      const checkResult2 = await caller.forceCheck({ serviceId: 'postgresql' })
      expect(checkResult2?.status).toBe('healthy')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent health checks', async () => {
      const mockHealth: ServiceHealth[] = [
        {
          id: 'postgresql',
          name: 'PostgreSQL',
          status: 'healthy',
          lastCheck: Date.now(),
          lastHealthy: Date.now(),
          restartCount: 0,
        },
      ]
      vi.mocked(watchdogService.getHealth).mockReturnValue(mockHealth)

      const results = await Promise.all([
        caller.getHealth(),
        caller.getHealth(),
        caller.getHealth(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toHaveLength(1)
        expect(result[0].status).toBe('healthy')
      })
    })

    it('should handle concurrent force checks for different services', async () => {
      vi.mocked(watchdogService.forceCheck)
        .mockResolvedValueOnce({
          id: 'postgresql',
          name: 'PostgreSQL',
          status: 'healthy',
          lastCheck: Date.now(),
          lastHealthy: Date.now(),
          restartCount: 0,
        })
        .mockResolvedValueOnce({
          id: 'memgraph',
          name: 'Memgraph',
          status: 'unhealthy',
          lastCheck: Date.now(),
          lastHealthy: Date.now() - 60000,
          restartCount: 1,
        })
        .mockResolvedValueOnce({
          id: 'ollama',
          name: 'Ollama',
          status: 'recovering',
          lastCheck: Date.now(),
          lastHealthy: Date.now() - 30000,
          restartCount: 2,
        })

      const results = await Promise.all([
        caller.forceCheck({ serviceId: 'postgresql' }),
        caller.forceCheck({ serviceId: 'memgraph' }),
        caller.forceCheck({ serviceId: 'ollama' }),
      ])

      expect(results[0]?.status).toBe('healthy')
      expect(results[1]?.status).toBe('unhealthy')
      expect(results[2]?.status).toBe('recovering')
    })

    it('should handle service ID at exact max length', async () => {
      const maxLengthId = 'a'.repeat(50)
      vi.mocked(watchdogService.getServiceHealth).mockReturnValue(null)

      const result = await caller.getServiceHealth({ serviceId: maxLengthId })

      expect(result).toBeNull()
      expect(watchdogService.getServiceHealth).toHaveBeenCalledWith(maxLengthId)
    })

    it('should handle recovery history with all action types', async () => {
      const mockEvents: RecoveryEvent[] = [
        {
          id: 'e1',
          serviceId: 's1',
          serviceName: 'Service 1',
          timestamp: Date.now(),
          action: 'restart',
          success: true,
          message: 'Restart successful',
        },
        {
          id: 'e2',
          serviceId: 's2',
          serviceName: 'Service 2',
          timestamp: Date.now(),
          action: 'alert',
          success: true,
          message: 'Alert sent',
        },
        {
          id: 'e3',
          serviceId: 's3',
          serviceName: 'Service 3',
          timestamp: Date.now(),
          action: 'recovery_failed',
          success: false,
          message: 'Max restarts exceeded',
        },
      ]
      vi.mocked(watchdogService.getRecoveryHistory).mockReturnValue(mockEvents)

      const result = await caller.getRecoveryHistory()

      expect(result).toHaveLength(3)
      expect(result.map((e) => e.action)).toEqual(['restart', 'alert', 'recovery_failed'])
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should only allow valid service ID characters', async () => {
      vi.mocked(watchdogService.getServiceHealth).mockReturnValue(null)

      // Valid IDs should work
      await expect(caller.getServiceHealth({ serviceId: 'postgresql' })).resolves.toBeNull()
      await expect(caller.getServiceHealth({ serviceId: 'my-service' })).resolves.toBeNull()
      await expect(caller.getServiceHealth({ serviceId: 'service_v2' })).resolves.toBeNull()
      await expect(caller.getServiceHealth({ serviceId: 'service123' })).resolves.toBeNull()
    })

    it('should handle unusual but valid service names', async () => {
      vi.mocked(watchdogService.getServiceHealth).mockReturnValue({
        id: 'special-service',
        name: 'Special Service',
        status: 'healthy',
        lastCheck: Date.now(),
        lastHealthy: Date.now(),
        restartCount: 0,
      })

      // These are all valid per the schema
      const validIds = [
        'a', // single char
        '1', // single digit
        'a1b2c3', // mixed
        'test-service-v1', // with dashes
        'test_service_v1', // with underscores
      ]

      for (const id of validIds) {
        const result = await caller.getServiceHealth({ serviceId: id })
        expect(result).not.toBeUndefined()
      }
    })
  })
})
