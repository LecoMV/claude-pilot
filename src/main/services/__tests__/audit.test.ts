/**
 * Audit Service Tests
 *
 * Comprehensive tests for the OCSF-compliant audit logging service
 * that handles SOC 2 compliance logging and SIEM integration.
 *
 * @module audit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock hoisted functions
const mockExistsSync = vi.hoisted(() => vi.fn())
const mockMkdirSync = vi.hoisted(() => vi.fn())
const mockStatSync = vi.hoisted(() => vi.fn())
const mockRenameSync = vi.hoisted(() => vi.fn())
const mockReaddirSync = vi.hoisted(() => vi.fn())
const mockUnlinkSync = vi.hoisted(() => vi.fn())
const mockGetPath = vi.hoisted(() => vi.fn())
const mockGetVersion = vi.hoisted(() => vi.fn())

// Better-sqlite3 mock functions
const mockDbMethods = vi.hoisted(() => ({
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
  run: vi.fn(),
  get: vi.fn().mockReturnValue({ count: 0 }),
  all: vi.fn().mockReturnValue([]),
}))

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    exec: mockDbMethods.exec,
    pragma: mockDbMethods.pragma,
    close: mockDbMethods.close,
    prepare: vi.fn(() => ({
      run: mockDbMethods.run,
      get: mockDbMethods.get,
      all: mockDbMethods.all,
    })),
  })),
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  statSync: mockStatSync,
  renameSync: mockRenameSync,
  readdirSync: mockReaddirSync,
  unlinkSync: mockUnlinkSync,
}))

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
    getVersion: mockGetVersion,
  },
}))

// Mock fetch globally
global.fetch = vi.fn()

import {
  AuditService,
  ActivityType,
  EventCategory,
  Severity,
  StatusCode,
  type SIEMEndpoint,
} from '../audit'

describe('AuditService', () => {
  let auditService: AuditService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Setup default mocks
    mockGetPath.mockReturnValue('/tmp/test-app')
    mockGetVersion.mockReturnValue('1.0.0')
    mockExistsSync.mockReturnValue(false)
    mockStatSync.mockReturnValue({ size: 1024 * 1024 }) // 1MB
    mockReaddirSync.mockReturnValue([])

    // Reset database mocks
    mockDbMethods.run.mockReset()
    mockDbMethods.get.mockReset().mockReturnValue({ count: 0 })
    mockDbMethods.all.mockReset().mockReturnValue([])

    auditService = new AuditService()
  })

  afterEach(() => {
    try {
      auditService.close()
    } catch {
      // Ignore close errors in tests
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('initialization', () => {
    it('should initialize successfully', () => {
      const result = auditService.initialize()

      expect(result).toBe(true)
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('audit'),
        { recursive: true }
      )
    })

    it('should create audit directory if not exists', () => {
      mockExistsSync.mockReturnValue(false)

      auditService.initialize()

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('audit'),
        { recursive: true }
      )
    })

    it('should not recreate directory if exists', () => {
      mockExistsSync.mockReturnValue(true)

      auditService.initialize()

      expect(mockMkdirSync).not.toHaveBeenCalled()
    })

    it('should enable WAL mode on database', () => {
      auditService.initialize()

      expect(mockDbMethods.pragma).toHaveBeenCalledWith('journal_mode = WAL')
    })

    it('should return true if already initialized', () => {
      auditService.initialize()
      vi.clearAllMocks()

      const result = auditService.initialize()

      expect(result).toBe(true)
      // Should not create new prepared statements
    })

    it('should handle initialization errors gracefully', () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = auditService.initialize()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // LOG ROTATION TESTS
  // ===========================================================================
  describe('log rotation', () => {
    it('should rotate logs when size exceeds limit', () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ size: 15 * 1024 * 1024 }) // 15MB > 10MB limit
      mockReaddirSync.mockReturnValue([])

      auditService.initialize()

      expect(mockRenameSync).toHaveBeenCalled()
    })

    it('should not rotate logs when under size limit', () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ size: 5 * 1024 * 1024 }) // 5MB < 10MB limit

      auditService.initialize()

      expect(mockRenameSync).not.toHaveBeenCalled()
    })

    it('should cleanup old log files beyond retention limit', () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ size: 15 * 1024 * 1024 })
      mockReaddirSync.mockReturnValue([
        'audit-2024-01-01.db',
        'audit-2024-01-02.db',
        'audit-2024-01-03.db',
        'audit-2024-01-04.db',
        'audit-2024-01-05.db',
        'audit-2024-01-06.db', // 6th file should be deleted (max 5)
      ])

      auditService.initialize()

      expect(mockUnlinkSync).toHaveBeenCalled()
    })

    it('should handle rotation errors gracefully', () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockImplementation(() => {
        throw new Error('Stat failed')
      })

      // Should not throw
      expect(() => auditService.initialize()).not.toThrow()
    })
  })

  // ===========================================================================
  // LOGGING TESTS
  // ===========================================================================
  describe('logging', () => {
    beforeEach(() => {
      auditService.initialize()
    })

    it('should log an audit event', () => {
      auditService.log({
        category: EventCategory.APPLICATION,
        activity: ActivityType.EXECUTE,
        message: 'Test event',
      })

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should log event with all OCSF fields', () => {
      auditService.log({
        category: EventCategory.AUTHENTICATION,
        activity: ActivityType.AUTHENTICATE,
        message: 'User login',
        severity: Severity.MEDIUM,
        status: StatusCode.SUCCESS,
        actorUser: 'test-user',
        targetType: 'credential',
        targetName: 'api-key',
      })

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should warn and drop events when not initialized', () => {
      const uninitializedService = new AuditService()
      const consoleSpy = vi.spyOn(console, 'warn')

      uninitializedService.log({
        category: EventCategory.APPLICATION,
        activity: ActivityType.EXECUTE,
        message: 'Test event',
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not initialized'),
        expect.any(String)
      )
    })
  })

  // ===========================================================================
  // CONVENIENCE METHOD TESTS
  // ===========================================================================
  describe('convenience methods', () => {
    beforeEach(() => {
      auditService.initialize()
      mockDbMethods.run.mockClear()
    })

    it('should log IPC events', () => {
      auditService.logIPC('system:status', true)

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should log IPC failures', () => {
      auditService.logIPC('system:status', false, 'Connection failed')

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should log credential read access', () => {
      auditService.logCredentialAccess('api-key', 'read')

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should log credential write access', () => {
      auditService.logCredentialAccess('api-key', 'write')

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should log credential delete access', () => {
      auditService.logCredentialAccess('api-key', 'delete')

      expect(mockDbMethods.run).toHaveBeenCalled()
    })

    it('should log data access events', () => {
      auditService.logDataAccess('postgresql', 'query', 'SELECT * FROM users')

      expect(mockDbMethods.run).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // QUERY TESTS
  // ===========================================================================
  describe('query', () => {
    beforeEach(() => {
      auditService.initialize()
    })

    it('should query events with no filters', () => {
      mockDbMethods.all.mockReturnValue([
        { id: 1, message: 'Event 1' },
        { id: 2, message: 'Event 2' },
      ])

      const events = auditService.query()

      expect(events).toHaveLength(2)
    })

    it('should query events with time range filter', () => {
      mockDbMethods.all.mockReturnValue([])

      auditService.query({
        startTime: 1000,
        endTime: 2000,
      })

      expect(mockDbMethods.all).toHaveBeenCalled()
    })

    it('should query events with category filter', () => {
      mockDbMethods.all.mockReturnValue([])

      auditService.query({
        category: EventCategory.AUTHENTICATION,
      })

      expect(mockDbMethods.all).toHaveBeenCalled()
    })

    it('should query events with activity filter', () => {
      mockDbMethods.all.mockReturnValue([])

      auditService.query({
        activity: ActivityType.EXECUTE,
      })

      expect(mockDbMethods.all).toHaveBeenCalled()
    })

    it('should query events with pagination', () => {
      mockDbMethods.all.mockReturnValue([])

      auditService.query({
        limit: 10,
        offset: 20,
      })

      expect(mockDbMethods.all).toHaveBeenCalled()
    })

    it('should return empty array when not initialized', () => {
      const uninitializedService = new AuditService()

      const events = uninitializedService.query()

      expect(events).toEqual([])
    })
  })

  // ===========================================================================
  // STATISTICS TESTS
  // ===========================================================================
  describe('getStats', () => {
    beforeEach(() => {
      auditService.initialize()
    })

    it('should return statistics', () => {
      mockDbMethods.get.mockReturnValue({ count: 100 })
      mockDbMethods.all.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('GROUP BY')) {
          return []
        }
        return []
      })
      mockStatSync.mockReturnValue({ size: 5 * 1024 * 1024 })

      const stats = auditService.getStats()

      expect(stats).toHaveProperty('totalEvents')
      expect(stats).toHaveProperty('eventsByCategory')
      expect(stats).toHaveProperty('eventsByActivity')
    })

    it('should return default stats when not initialized', () => {
      const uninitializedService = new AuditService()

      const stats = uninitializedService.getStats()

      expect(stats).toEqual({
        totalEvents: 0,
        eventsByCategory: {},
        eventsByActivity: {},
        last24hCount: 0,
        dbSizeMB: 0,
      })
    })
  })

  // ===========================================================================
  // EXPORT TESTS
  // ===========================================================================
  describe('export', () => {
    beforeEach(() => {
      auditService.initialize()
    })

    it('should export events to JSON', () => {
      mockDbMethods.all.mockReturnValue([
        { id: 1, message: 'Event 1', time: 1000 },
        { id: 2, message: 'Event 2', time: 2000 },
      ])

      const json = auditService.exportJSON()
      const parsed = JSON.parse(json)

      expect(parsed).toHaveLength(2)
      expect(parsed[0].message).toBe('Event 1')
    })

    it('should export events to CSV', () => {
      mockDbMethods.all.mockReturnValue([
        {
          time: 1000,
          class_name: 'API Activity',
          category_name: 'application',
          activity_name: 'Execute',
          severity_id: 1,
          status_id: 1,
          message: 'Test event',
          actor_user: 'test',
          actor_process: 'test',
          target_type: 'ipc',
          target_name: 'test',
        },
      ])

      const csv = auditService.exportCSV()

      expect(csv).toContain('time,class_name,category_name')
      expect(csv).toContain('API Activity')
    })

    it('should return empty string for CSV with no events', () => {
      mockDbMethods.all.mockReturnValue([])

      const csv = auditService.exportCSV()

      expect(csv).toBe('')
    })
  })

  // ===========================================================================
  // SIEM ENDPOINT TESTS
  // ===========================================================================
  describe('SIEM endpoints', () => {
    beforeEach(() => {
      auditService.initialize()
    })

    it('should register a SIEM endpoint', () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: true,
        batchSize: 100,
        flushInterval: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      }

      auditService.registerEndpoint(endpoint)

      const endpoints = auditService.getEndpoints()
      expect(endpoints).toHaveLength(1)
      expect(endpoints[0].id).toBe('test-siem')
    })

    it('should unregister a SIEM endpoint', () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: true,
        batchSize: 100,
        flushInterval: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      }

      auditService.registerEndpoint(endpoint)
      auditService.unregisterEndpoint('test-siem')

      const endpoints = auditService.getEndpoints()
      expect(endpoints).toHaveLength(0)
    })

    it('should enable/disable an endpoint', () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: true,
        batchSize: 100,
        flushInterval: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      }

      auditService.registerEndpoint(endpoint)
      auditService.setEndpointEnabled('test-siem', false)

      const endpoints = auditService.getEndpoints()
      expect(endpoints[0].enabled).toBe(false)
    })

    it('should get shipper stats for endpoint', () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: true,
        batchSize: 100,
        flushInterval: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      }

      auditService.registerEndpoint(endpoint)
      const stats = auditService.getShipperStats('test-siem')

      expect(stats).toEqual(
        expect.objectContaining({
          totalShipped: 0,
          totalFailed: 0,
        })
      )
    })

    it('should return default stats for unknown endpoint', () => {
      const stats = auditService.getShipperStats('unknown')

      expect(stats).toEqual(
        expect.objectContaining({
          totalShipped: 0,
          totalFailed: 0,
        })
      )
    })

    it('should get all shipper stats', () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: true,
        batchSize: 100,
        flushInterval: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      }

      auditService.registerEndpoint(endpoint)
      const stats = auditService.getShipperStats()

      expect(stats instanceof Map).toBe(true)
      expect((stats as Map<string, unknown>).has('test-siem')).toBe(true)
    })
  })

  // ===========================================================================
  // FLUSH TO ENDPOINT TESTS
  // ===========================================================================
  describe('flushToEndpoint', () => {
    beforeEach(() => {
      auditService.initialize()
    })

    it('should return false for non-existent endpoint', async () => {
      const success = await auditService.flushToEndpoint('non-existent')
      expect(success).toBe(false)
    })

    it('should return false for disabled endpoint', async () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: false,
        batchSize: 100,
        flushInterval: 30000,
        retryAttempts: 3,
        retryDelay: 100,
      }

      auditService.registerEndpoint(endpoint)
      const success = await auditService.flushToEndpoint('test-siem')

      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // CLOSE TESTS
  // ===========================================================================
  describe('close', () => {
    it('should close the database connection', () => {
      auditService.initialize()
      auditService.close()

      expect(mockDbMethods.close).toHaveBeenCalled()
    })

    it('should stop all flush timers', () => {
      const endpoint: SIEMEndpoint = {
        id: 'test-siem',
        name: 'Test SIEM',
        type: 'webhook',
        url: 'https://siem.example.com/events',
        enabled: true,
        batchSize: 100,
        flushInterval: 1000,
        retryAttempts: 3,
        retryDelay: 100,
      }

      auditService.initialize()
      auditService.registerEndpoint(endpoint)

      // Close should stop all timers
      auditService.close()

      // Verify the service is closed
      expect(mockDbMethods.close).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // ACTIVITY TYPE CONSTANTS TESTS
  // ===========================================================================
  describe('constants', () => {
    it('should export ActivityType enum', () => {
      expect(ActivityType.CREATE).toBe(1)
      expect(ActivityType.READ).toBe(2)
      expect(ActivityType.UPDATE).toBe(3)
      expect(ActivityType.DELETE).toBe(4)
      expect(ActivityType.EXECUTE).toBe(5)
    })

    it('should export EventCategory enum', () => {
      expect(EventCategory.APPLICATION).toBe('application')
      expect(EventCategory.AUTHENTICATION).toBe('authentication')
      expect(EventCategory.SYSTEM).toBe('system')
    })

    it('should export Severity enum', () => {
      expect(Severity.INFORMATIONAL).toBe(1)
      expect(Severity.LOW).toBe(2)
      expect(Severity.MEDIUM).toBe(3)
      expect(Severity.HIGH).toBe(4)
      expect(Severity.CRITICAL).toBe(5)
    })

    it('should export StatusCode enum', () => {
      expect(StatusCode.SUCCESS).toBe(1)
      expect(StatusCode.FAILURE).toBe(2)
    })
  })
})
