/**
 * PostgreSQL Service Tests
 *
 * Comprehensive tests for the PostgresService that provides native pg driver
 * connection with connection pooling.
 *
 * Tests all public methods: connect, disconnect, isConnected, query,
 * queryScalar, queryRaw, getPoolStats
 *
 * @module postgresql.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock credential service
vi.mock('../credentials', () => ({
  credentialService: {
    getWithFallback: vi.fn(),
  },
}))

// Mock pg module
const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  totalCount: 10,
  idleCount: 5,
  waitingCount: 2,
}

vi.mock('pg', () => ({
  Pool: vi.fn(() => mockPool),
}))

// Import after mocks
import { PostgresService } from '../postgresql'
import { Pool } from 'pg'
import { credentialService } from '../credentials'

describe('PostgresService', () => {
  let service: PostgresService
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PostgresService()
    process.env = { ...originalEnv }

    // Default mock implementations
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] })
    mockPool.end.mockResolvedValue(undefined)
    mockPool.on.mockReturnValue(mockPool)
    vi.mocked(credentialService.getWithFallback).mockReturnValue(undefined)
  })

  afterEach(async () => {
    await service.disconnect()
    vi.restoreAllMocks()
    process.env = originalEnv
  })

  // ===========================================================================
  // CONNECTION
  // ===========================================================================
  describe('connect', () => {
    it('should connect successfully with default config', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      const result = await service.connect()

      expect(result).toBe(true)
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5433,
          user: 'deploy',
          database: 'claude_memory',
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        })
      )
    })

    it('should connect with provided config', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      const config = {
        host: 'custom-host',
        port: 5432,
        user: 'custom-user',
        database: 'custom-db',
        password: 'custom-pass',
      }

      const result = await service.connect(config)

      expect(result).toBe(true)
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'custom-host',
          port: 5432,
          user: 'custom-user',
          database: 'custom-db',
          password: 'custom-pass',
        })
      )
    })

    it('should use environment variables for config when not provided', async () => {
      process.env.CLAUDE_PG_HOST = 'env-host'
      process.env.CLAUDE_PG_PORT = '5434'
      process.env.CLAUDE_PG_USER = 'env-user'
      process.env.CLAUDE_PG_DATABASE = 'env-db'
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      const result = await service.connect()

      expect(result).toBe(true)
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'env-host',
          port: 5434,
          user: 'env-user',
          database: 'env-db',
        })
      )
    })

    it('should get password from credential service', async () => {
      vi.mocked(credentialService.getWithFallback).mockReturnValue('secure-password')
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      await service.connect()

      expect(credentialService.getWithFallback).toHaveBeenCalledWith(
        'postgresql.password',
        'CLAUDE_PG_PASSWORD'
      )
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'secure-password',
        })
      )
    })

    it('should return true if already connected with same config', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      await service.connect()
      vi.clearAllMocks()

      const result = await service.connect()

      expect(result).toBe(true)
      expect(Pool).not.toHaveBeenCalled() // Should reuse existing pool
    })

    it('should reconnect when config changes', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      await service.connect({ host: 'host1', port: 5432, user: 'user', database: 'db1' })
      vi.clearAllMocks()

      await service.connect({ host: 'host2', port: 5432, user: 'user', database: 'db2' })

      expect(mockPool.end).toHaveBeenCalled()
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'host2',
          database: 'db2',
        })
      )
    })

    it('should return false on connection failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'))

      const result = await service.connect()

      expect(result).toBe(false)
    })

    it('should setup error handler on pool', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      await service.connect()

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('should log connection success', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      await service.connect()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PostgreSQL] Connected successfully')
      )
      consoleSpy.mockRestore()
    })

    it('should handle credential service errors gracefully', async () => {
      vi.mocked(credentialService.getWithFallback).mockImplementation(() => {
        throw new Error('Credential service not initialized')
      })
      process.env.CLAUDE_PG_PASSWORD = 'fallback-password'
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })

      const result = await service.connect()

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // DISCONNECT
  // ===========================================================================
  describe('disconnect', () => {
    it('should close pool when connected', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await service.disconnect()

      expect(mockPool.end).toHaveBeenCalled()
    })

    it('should not throw when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow()
    })

    it('should clear pool reference after disconnect', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })
      await service.connect()
      await service.disconnect()

      const isConnected = await service.isConnected()
      expect(isConnected).toBe(false)
    })

    it('should log disconnect message', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await service.disconnect()

      expect(consoleSpy).toHaveBeenCalledWith('[PostgreSQL] Disconnected')
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // IS CONNECTED
  // ===========================================================================
  describe('isConnected', () => {
    it('should return false when not connected', async () => {
      const result = await service.isConnected()

      expect(result).toBe(false)
    })

    it('should return true when connected', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] })
      await service.connect()

      const result = await service.isConnected()

      expect(result).toBe(true)
    })

    it('should return false when connection check fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // Initial connect
      await service.connect()

      mockPool.query.mockRejectedValue(new Error('Connection lost'))

      const result = await service.isConnected()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // QUERY
  // ===========================================================================
  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('SELECT 1')).rejects.toThrow('Not connected to PostgreSQL')
    })

    it('should execute parameterized query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // Connect
      await service.connect()

      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })

      const result = await service.query<{ id: number; name: string }>(
        'SELECT id, name FROM users WHERE active = $1',
        [true]
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ id: 1, name: 'Alice' })
      expect(mockPool.query).toHaveBeenCalledWith('SELECT id, name FROM users WHERE active = $1', [
        true,
      ])
    })

    it('should return typed results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      interface UserRow {
        id: number
        email: string
        created_at: Date
      }

      const mockDate = new Date()
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, email: 'test@example.com', created_at: mockDate }],
      })

      const result = await service.query<UserRow>('SELECT * FROM users')

      expect(result[0].id).toBe(1)
      expect(result[0].email).toBe('test@example.com')
      expect(result[0].created_at).toBe(mockDate)
    })

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const result = await service.query('SELECT * FROM empty_table')

      expect(result).toEqual([])
    })

    it('should handle query errors', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockRejectedValueOnce(new Error('Syntax error'))

      await expect(service.query('INVALID SQL')).rejects.toThrow('Syntax error')
    })
  })

  // ===========================================================================
  // QUERY SCALAR
  // ===========================================================================
  describe('queryScalar', () => {
    it('should return single value', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 42 }] })

      const result = await service.queryScalar<number>('SELECT COUNT(*) as count FROM users')

      expect(result).toBe(42)
    })

    it('should return null for empty result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const result = await service.queryScalar<number>('SELECT COUNT(*) FROM nonexistent')

      expect(result).toBeNull()
    })

    it('should return first column of first row', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({
        rows: [{ first: 'value1', second: 'value2' }],
      })

      const result = await service.queryScalar<string>('SELECT a, b FROM table')

      expect(result).toBe('value1')
    })

    it('should handle null values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [{ value: null }] })

      const result = await service.queryScalar('SELECT NULL as value')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // QUERY RAW
  // ===========================================================================
  describe('queryRaw', () => {
    it('should throw error when not connected', async () => {
      await expect(service.queryRaw('SELECT 1')).rejects.toThrow('Not connected to PostgreSQL')
    })

    it('should execute raw query and return extended results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }, { id: 2 }],
        rowCount: 2,
        fields: [{ name: 'id' }, { name: 'name' }],
      })

      const result = await service.queryRaw<{ id: number }>('SELECT id, name FROM users')

      expect(result.rows).toHaveLength(2)
      expect(result.rowCount).toBe(2)
      expect(result.fields).toContain('id')
      expect(result.fields).toContain('name')
    })

    it('should block DROP queries', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await expect(service.queryRaw('DROP TABLE users')).rejects.toThrow(
        'Dangerous operation detected'
      )
    })

    it('should block TRUNCATE queries', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await expect(service.queryRaw('TRUNCATE TABLE users')).rejects.toThrow(
        'Dangerous operation detected'
      )
    })

    it('should block DELETE without WHERE', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await expect(service.queryRaw('DELETE FROM users')).rejects.toThrow(
        'Dangerous operation detected'
      )
    })

    it('should allow DELETE with WHERE clause', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 5,
        fields: [],
      })

      const result = await service.queryRaw('DELETE FROM users WHERE id = 1')

      expect(result.rowCount).toBe(5)
    })

    it('should handle case-insensitive dangerous operations', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await expect(service.queryRaw('drop table users')).rejects.toThrow(
        'Dangerous operation detected'
      )
      await expect(service.queryRaw('TRUNCATE table users')).rejects.toThrow(
        'Dangerous operation detected'
      )
    })

    it('should return rowCount of 0 when null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: null,
        fields: [],
      })

      const result = await service.queryRaw('SELECT 1')

      expect(result.rowCount).toBe(0)
    })
  })

  // ===========================================================================
  // GET POOL STATS
  // ===========================================================================
  describe('getPoolStats', () => {
    it('should return null when not connected', () => {
      const stats = service.getPoolStats()

      expect(stats).toBeNull()
    })

    it('should return pool statistics', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      const stats = service.getPoolStats()

      expect(stats).toEqual({
        total: 10,
        idle: 5,
        waiting: 2,
      })
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should use parameterized queries to prevent SQL injection', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      const maliciousInput = "'; DROP TABLE users; --"
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      await service.query('SELECT * FROM users WHERE name = $1', [maliciousInput])

      // Verify the malicious input is passed as a parameter, not concatenated
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE name = $1', [
        maliciousInput,
      ])
    })

    it('should block DROP even with leading whitespace', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      await expect(service.queryRaw('  DROP TABLE users')).rejects.toThrow(
        'Dangerous operation detected'
      )
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should log connection errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockPool.query.mockRejectedValue(new Error('ECONNREFUSED'))

      await service.connect()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PostgreSQL] Connection failed'),
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('should handle pool error events', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

      await service.connect()

      // Get the error handler that was registered
      const errorHandler = mockPool.on.mock.calls.find((call) => call[0] === 'error')?.[1]
      expect(errorHandler).toBeDefined()

      // Simulate pool error
      errorHandler(new Error('Unexpected pool error'))

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PostgreSQL] Unexpected pool error'),
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle empty parameter array', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await service.query('SELECT COUNT(*) as count')

      expect(mockPool.query).toHaveBeenCalledWith('SELECT COUNT(*) as count', [])
      expect(result[0].count).toBe(1)
    })

    it('should handle null parameters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [] })

      await service.query('INSERT INTO users (name) VALUES ($1)', [null])

      expect(mockPool.query).toHaveBeenCalledWith('INSERT INTO users (name) VALUES ($1)', [null])
    })

    it('should handle concurrent queries', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValue({ rows: [{ result: 'ok' }] })

      const results = await Promise.all([
        service.query('SELECT 1'),
        service.query('SELECT 2'),
        service.query('SELECT 3'),
      ])

      expect(results).toHaveLength(3)
    })

    it('should handle large result sets', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      const largeResultSet = Array.from({ length: 10000 }, (_, i) => ({ id: i }))
      mockPool.query.mockResolvedValueOnce({ rows: largeResultSet })

      const result = await service.query<{ id: number }>('SELECT * FROM large_table')

      expect(result).toHaveLength(10000)
    })

    it('should handle special characters in string values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({ rows: [] })

      await service.query('INSERT INTO notes (content) VALUES ($1)', [
        'Line 1\nLine 2\tTabbed\r\nWindows line',
      ])

      expect(mockPool.query).toHaveBeenCalled()
    })

    it('should handle unicode values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      await service.connect()

      mockPool.query.mockResolvedValueOnce({
        rows: [{ name: '\u4f60\u597d\u4e16\u754c \u{1F600}' }],
      })

      const result = await service.query<{ name: string }>('SELECT name FROM users')

      expect(result[0].name).toBe('\u4f60\u597d\u4e16\u754c \u{1F600}')
    })
  })
})
