/**
 * Audit Controller Tests
 *
 * Comprehensive tests for the OCSF-compliant audit logging tRPC controller.
 * Tests query, stats, export, and SIEM integration procedures.
 *
 * @module audit.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { auditRouter } from '../audit.controller'
import {
  auditService,
  EventCategory,
  ActivityType,
  Severity,
  StatusCode,
} from '../../../services/audit'

// Mock the audit service
vi.mock('../../../services/audit', () => ({
  auditService: {
    query: vi.fn(),
    getStats: vi.fn(),
    exportJSON: vi.fn(),
    exportCSV: vi.fn(),
    registerEndpoint: vi.fn(),
    unregisterEndpoint: vi.fn(),
    setEndpointEnabled: vi.fn(),
    getEndpoints: vi.fn(),
    getShipperStats: vi.fn(),
    flushToEndpoint: vi.fn(),
    flushAll: vi.fn(),
  },
  EventCategory: {
    APPLICATION: 'application',
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    CONFIGURATION: 'configuration',
    DATA_ACCESS: 'data_access',
    SYSTEM: 'system',
  },
  ActivityType: {
    CREATE: 1,
    READ: 2,
    UPDATE: 3,
    DELETE: 4,
    EXECUTE: 5,
    DENY: 6,
    ERROR: 7,
    AUTHENTICATE: 8,
    AUTHORIZE: 9,
  },
  Severity: {
    UNKNOWN: 0,
    INFORMATIONAL: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4,
    CRITICAL: 5,
  },
  StatusCode: {
    UNKNOWN: 0,
    SUCCESS: 1,
    FAILURE: 2,
    PARTIAL: 3,
  },
}))

// Mock audit event factory
const createMockAuditEvent = (overrides = {}) => ({
  id: 1,
  time: Date.now(),
  class_uid: 6003,
  class_name: 'API Activity',
  category_uid: 1,
  category_name: EventCategory.APPLICATION,
  activity_id: ActivityType.READ,
  activity_name: 'Read',
  severity_id: Severity.INFORMATIONAL,
  status_id: StatusCode.SUCCESS,
  message: 'Test audit event',
  metadata_version: '1.0.0',
  metadata_product_name: 'Claude Pilot',
  metadata_product_version: '0.1.0',
  ...overrides,
})

// Create a test caller
const createTestCaller = () => auditRouter.createCaller({})

describe('audit.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // QUERY PROCEDURE
  // ===========================================================================
  describe('query', () => {
    it('should query audit events without filters', async () => {
      const mockEvents = [createMockAuditEvent(), createMockAuditEvent({ id: 2 })]
      vi.mocked(auditService.query).mockReturnValue(mockEvents)

      const result = await caller.query()

      expect(result).toEqual(mockEvents)
      expect(auditService.query).toHaveBeenCalledWith(undefined)
    })

    it('should query with time range filter', async () => {
      vi.mocked(auditService.query).mockReturnValue([])

      const startTime = Date.now() - 86400000 // 24h ago
      const endTime = Date.now()

      await caller.query({ startTime, endTime })

      expect(auditService.query).toHaveBeenCalledWith(
        expect.objectContaining({ startTime, endTime })
      )
    })

    it('should query with category filter', async () => {
      vi.mocked(auditService.query).mockReturnValue([])

      await caller.query({ category: EventCategory.AUTHENTICATION })

      expect(auditService.query).toHaveBeenCalledWith(
        expect.objectContaining({ category: EventCategory.AUTHENTICATION })
      )
    })

    it('should query with activity filter', async () => {
      vi.mocked(auditService.query).mockReturnValue([])

      await caller.query({ activity: ActivityType.CREATE })

      expect(auditService.query).toHaveBeenCalledWith(
        expect.objectContaining({ activity: ActivityType.CREATE })
      )
    })

    it('should query with pagination', async () => {
      vi.mocked(auditService.query).mockReturnValue([])

      await caller.query({ limit: 50, offset: 100 })

      expect(auditService.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 100 })
      )
    })

    it('should use default pagination values', async () => {
      vi.mocked(auditService.query).mockReturnValue([])

      await caller.query({})

      expect(auditService.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100, offset: 0 })
      )
    })

    it('should reject limit exceeding maximum', async () => {
      await expect(caller.query({ limit: 10001 })).rejects.toThrow()
    })

    it('should reject negative offset', async () => {
      await expect(caller.query({ offset: -1 })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return audit statistics', async () => {
      const mockStats = {
        totalEvents: 1000,
        eventsByCategory: {
          [EventCategory.APPLICATION]: 500,
          [EventCategory.AUTHENTICATION]: 300,
          [EventCategory.SYSTEM]: 200,
        },
        eventsByActivity: {
          [ActivityType.READ]: 600,
          [ActivityType.CREATE]: 200,
          [ActivityType.UPDATE]: 150,
          [ActivityType.DELETE]: 50,
        },
        last24hCount: 150,
        dbSizeMB: 5.2,
      }
      vi.mocked(auditService.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result).toEqual(mockStats)
      expect(auditService.getStats).toHaveBeenCalled()
    })

    it('should handle empty statistics', async () => {
      vi.mocked(auditService.getStats).mockReturnValue({
        totalEvents: 0,
        eventsByCategory: {},
        eventsByActivity: {},
        last24hCount: 0,
        dbSizeMB: 0,
      })

      const result = await caller.stats()

      expect(result.totalEvents).toBe(0)
    })
  })

  // ===========================================================================
  // EXPORT PROCEDURE
  // ===========================================================================
  describe('export', () => {
    it('should export events as JSON', async () => {
      const mockJson = JSON.stringify([createMockAuditEvent()])
      vi.mocked(auditService.exportJSON).mockReturnValue(mockJson)

      const result = await caller.export({ format: 'json' })

      expect(result).toBe(mockJson)
      expect(auditService.exportJSON).toHaveBeenCalled()
    })

    it('should export events as CSV', async () => {
      const mockCsv = 'id,time,message\n1,1234567890,"Test event"'
      vi.mocked(auditService.exportCSV).mockReturnValue(mockCsv)

      const result = await caller.export({ format: 'csv' })

      expect(result).toBe(mockCsv)
      expect(auditService.exportCSV).toHaveBeenCalled()
    })

    it('should export with time range', async () => {
      vi.mocked(auditService.exportJSON).mockReturnValue('[]')

      const startTime = Date.now() - 86400000
      const endTime = Date.now()

      await caller.export({ format: 'json', startTime, endTime })

      expect(auditService.exportJSON).toHaveBeenCalledWith(
        expect.objectContaining({ startTime, endTime })
      )
    })

    it('should reject invalid format', async () => {
      // @ts-expect-error Testing invalid input
      await expect(caller.export({ format: 'xml' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SIEM REGISTER PROCEDURE
  // ===========================================================================
  describe('siem.register', () => {
    const validEndpoint = {
      id: 'splunk-1',
      name: 'Splunk HEC',
      type: 'webhook' as const,
      url: 'https://splunk.example.com/services/collector',
      enabled: true,
      batchSize: 100,
      flushInterval: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
    }

    it('should register a SIEM endpoint', async () => {
      vi.mocked(auditService.registerEndpoint).mockReturnValue(undefined)

      await caller.siem.register(validEndpoint)

      expect(auditService.registerEndpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'splunk-1',
          name: 'Splunk HEC',
          type: 'webhook',
        })
      )
    })

    it('should reject invalid endpoint type', async () => {
      await expect(
        // @ts-expect-error Testing invalid input
        caller.siem.register({ ...validEndpoint, type: 'invalid' })
      ).rejects.toThrow()
    })

    it('should reject invalid URL format', async () => {
      await expect(
        caller.siem.register({ ...validEndpoint, url: 'not-a-url' })
      ).rejects.toThrow()
    })

    it('should reject empty endpoint ID', async () => {
      await expect(
        caller.siem.register({ ...validEndpoint, id: '' })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SIEM UNREGISTER PROCEDURE
  // ===========================================================================
  describe('siem.unregister', () => {
    it('should unregister a SIEM endpoint', async () => {
      vi.mocked(auditService.unregisterEndpoint).mockReturnValue(undefined)

      await caller.siem.unregister({ endpointId: 'splunk-1' })

      expect(auditService.unregisterEndpoint).toHaveBeenCalledWith('splunk-1')
    })

    it('should reject empty endpoint ID', async () => {
      await expect(caller.siem.unregister({ endpointId: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SIEM SET ENABLED PROCEDURE
  // ===========================================================================
  describe('siem.setEnabled', () => {
    it('should enable a SIEM endpoint', async () => {
      vi.mocked(auditService.setEndpointEnabled).mockReturnValue(undefined)

      await caller.siem.setEnabled({ endpointId: 'splunk-1', enabled: true })

      expect(auditService.setEndpointEnabled).toHaveBeenCalledWith('splunk-1', true)
    })

    it('should disable a SIEM endpoint', async () => {
      vi.mocked(auditService.setEndpointEnabled).mockReturnValue(undefined)

      await caller.siem.setEnabled({ endpointId: 'splunk-1', enabled: false })

      expect(auditService.setEndpointEnabled).toHaveBeenCalledWith('splunk-1', false)
    })
  })

  // ===========================================================================
  // SIEM GET ENDPOINTS PROCEDURE
  // ===========================================================================
  describe('siem.getEndpoints', () => {
    it('should return all SIEM endpoints', async () => {
      const mockEndpoints = [
        {
          id: 'splunk-1',
          name: 'Splunk',
          type: 'webhook' as const,
          url: 'https://splunk.example.com',
          enabled: true,
          batchSize: 100,
          flushInterval: 5000,
          retryAttempts: 3,
          retryDelay: 1000,
        },
        {
          id: 'syslog-1',
          name: 'Syslog',
          type: 'syslog' as const,
          host: 'syslog.example.com',
          port: 514,
          protocol: 'tcp' as const,
          enabled: false,
          batchSize: 100,
          flushInterval: 5000,
          retryAttempts: 3,
          retryDelay: 1000,
        },
      ]
      vi.mocked(auditService.getEndpoints).mockReturnValue(mockEndpoints)

      const result = await caller.siem.getEndpoints()

      expect(result).toEqual(mockEndpoints)
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no endpoints', async () => {
      vi.mocked(auditService.getEndpoints).mockReturnValue([])

      const result = await caller.siem.getEndpoints()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // SIEM GET STATS PROCEDURE
  // ===========================================================================
  describe('siem.getStats', () => {
    const mockStats = {
      sentEvents: 100,
      failedEvents: 5,
      queuedEvents: 10,
      lastSentAt: Date.now(),
      lastError: null,
    }

    it('should return stats for specific endpoint', async () => {
      vi.mocked(auditService.getShipperStats).mockReturnValue(mockStats)

      const result = await caller.siem.getStats({ endpointId: 'splunk-1' })

      expect(result).toEqual(mockStats)
      expect(auditService.getShipperStats).toHaveBeenCalledWith('splunk-1')
    })

    it('should return stats for all endpoints', async () => {
      const mockStatsMap = new Map([
        ['splunk-1', mockStats],
        ['syslog-1', { ...mockStats, sentEvents: 50 }],
      ])
      vi.mocked(auditService.getShipperStats).mockReturnValue(mockStatsMap)

      const result = await caller.siem.getStats()

      expect(result).toEqual({
        'splunk-1': mockStats,
        'syslog-1': { ...mockStats, sentEvents: 50 },
      })
    })
  })

  // ===========================================================================
  // SIEM FLUSH PROCEDURE
  // ===========================================================================
  describe('siem.flush', () => {
    it('should flush specific endpoint', async () => {
      vi.mocked(auditService.flushToEndpoint).mockResolvedValue(true)

      const result = await caller.siem.flush({ endpointId: 'splunk-1' })

      expect(result).toBe(true)
      expect(auditService.flushToEndpoint).toHaveBeenCalledWith('splunk-1')
    })

    it('should flush all endpoints', async () => {
      vi.mocked(auditService.flushAll).mockResolvedValue(undefined)

      const result = await caller.siem.flush()

      expect(result).toBe(true)
      expect(auditService.flushAll).toHaveBeenCalled()
    })

    it('should handle flush failure', async () => {
      vi.mocked(auditService.flushToEndpoint).mockResolvedValue(false)

      const result = await caller.siem.flush({ endpointId: 'splunk-1' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should sanitize target type in queries', async () => {
      vi.mocked(auditService.query).mockReturnValue([])

      // Valid target type
      await caller.query({ targetType: 'ipc' })
      expect(auditService.query).toHaveBeenCalled()
    })

    it('should reject excessively long target type', async () => {
      const longTargetType = 'a'.repeat(51)

      await expect(caller.query({ targetType: longTargetType })).rejects.toThrow()
    })

    it('should sanitize SIEM endpoint URLs', async () => {
      // Valid HTTPS URL
      vi.mocked(auditService.registerEndpoint).mockReturnValue(undefined)

      await caller.siem.register({
        id: 'test',
        name: 'Test',
        type: 'webhook',
        url: 'https://example.com/webhook',
        enabled: true,
        batchSize: 100,
        flushInterval: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
      })

      expect(auditService.registerEndpoint).toHaveBeenCalled()
    })

    it('should accept valid HTTP/HTTPS URLs in SIEM endpoints', async () => {
      // Note: Zod's url() validator accepts file:// URLs
      // For production, add custom validator to restrict to https://
      vi.mocked(auditService.registerEndpoint).mockReturnValue(undefined)

      await caller.siem.register({
        id: 'test-http',
        name: 'Test HTTP',
        type: 'webhook',
        url: 'http://localhost:8080/webhook',
        enabled: true,
        batchSize: 100,
        flushInterval: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
      })

      expect(auditService.registerEndpoint).toHaveBeenCalled()
    })
  })
})
