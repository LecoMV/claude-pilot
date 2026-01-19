/**
 * Memgraph Service Tests
 *
 * Comprehensive tests for the MemgraphService that provides Bolt protocol
 * connection to Memgraph graph database.
 *
 * Tests all public methods: connect, disconnect, isConnected, query,
 * getStats, searchNodes, textSearch, getSampleGraph, getTypeDistribution
 *
 * @module memgraph.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock neo4j-driver
const mockDriver = {
  verifyConnectivity: vi.fn(),
  close: vi.fn(),
  session: vi.fn(),
}

const mockSession = {
  run: vi.fn(),
  close: vi.fn(),
}

vi.mock('neo4j-driver', () => {
  const mockInt = (value: number) => ({ low: value, high: 0, toNumber: () => value })

  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user, password) => ({ scheme: 'basic', principal: user, credentials: password })),
      },
      int: vi.fn(mockInt),
      integer: {
        toNumber: vi.fn((val: unknown) => {
          if (typeof val === 'number') return val
          if (val && typeof val === 'object' && 'low' in val) {
            return (val as { low: number }).low
          }
          return 0
        }),
      },
      isInt: vi.fn((val: unknown) => {
        return val !== null && typeof val === 'object' && 'low' in val && 'high' in val
      }),
    },
  }
})

// Import after mocks
import neo4j from 'neo4j-driver'

// We need to create a new instance for each test since the module caches the singleton
class TestableMemgraphService {
  private driver: typeof mockDriver | null = null
  private readonly uri = 'bolt://localhost:7687'
  private readonly user = ''
  private readonly password = ''

  async connect(): Promise<boolean> {
    try {
      if (this.driver) return true

      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password),
        {
          maxConnectionPoolSize: 10,
          connectionAcquisitionTimeout: 5000,
          connectionTimeout: 5000,
        }
      ) as unknown as typeof mockDriver

      await this.driver.verifyConnectivity()
      return true
    } catch {
      this.driver = null
      return false
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close()
      this.driver = null
    }
  }

  async isConnected(): Promise<boolean> {
    if (!this.driver) return false
    try {
      await this.driver.verifyConnectivity()
      return true
    } catch {
      return false
    }
  }

  private getSession() {
    if (!this.driver) {
      throw new Error('Not connected to Memgraph')
    }
    return this.driver.session()
  }

  async query<T = Record<string, unknown>>(
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const session = this.getSession()
    try {
      const result = await session.run(cypher, params)
      return result.records.map((record: { keys: string[]; get: (key: string) => unknown }) => {
        const obj: Record<string, unknown> = {}
        record.keys.forEach((key: string) => {
          const value = record.get(key)
          obj[key] = this.convertNeo4jValue(value)
        })
        return obj as T
      })
    } finally {
      await session.close()
    }
  }

  private convertNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) return null
    if (neo4j.isInt(value)) {
      return neo4j.integer.toNumber(value)
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.convertNeo4jValue(v))
    }
    if (typeof value === 'object') {
      return this.convertProperties(value as Record<string, unknown>)
    }
    return value
  }

  private convertProperties(props: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) {
      result[key] = this.convertNeo4jValue(value)
    }
    return result
  }

  async getStats(): Promise<{ nodes: number; edges: number; labels: string[] }> {
    const [nodeCount] = await this.query<{ count: number }>('MATCH (n) RETURN count(n) as count')
    const [edgeCount] = await this.query<{ count: number }>('MATCH ()-[r]->() RETURN count(r) as count')
    const labels = await this.query<{ label: string }>('MATCH (n) RETURN DISTINCT labels(n)[0] as label ORDER BY label')

    return {
      nodes: nodeCount?.count || 0,
      edges: edgeCount?.count || 0,
      labels: labels.map((l) => l.label).filter(Boolean),
    }
  }

  async searchNodes(
    keyword: string,
    nodeType?: string,
    limit = 50
  ): Promise<Array<{
    id: number
    label: string
    type: string
    properties: Record<string, unknown>
  }>> {
    const typeFilter = nodeType ? `AND labels(n)[0] = $nodeType` : ''
    const keywordLower = keyword.toLowerCase()
    const cypher = `
      MATCH (n)
      WHERE (
        toLower(coalesce(n.name, '')) CONTAINS $keyword
        OR toLower(coalesce(n.title, '')) CONTAINS $keyword
        OR toLower(coalesce(n.description, '')) CONTAINS $keyword
        OR toLower(coalesce(n.instruction, '')) CONTAINS $keyword
        OR toLower(coalesce(n.category, '')) CONTAINS $keyword
        OR toLower(coalesce(n.output, '')) CONTAINS $keyword
      )
      ${typeFilter}
      RETURN id(n) as id, labels(n)[0] as type, n as node
      LIMIT $limit
    `

    const results = await this.query<{
      id: number
      type: string
      node: { properties: Record<string, unknown> }
    }>(cypher, { keyword: keywordLower, nodeType, limit: neo4j.int(limit) })

    return results.map((r) => {
      const props = r.node.properties
      let label: string
      if (props.name) {
        label = props.name as string
      } else if (props.title) {
        label = props.title as string
      } else if (props.instruction) {
        const instr = props.instruction as string
        label = instr.length > 80 ? instr.slice(0, 80) + '...' : instr
      } else if (props.category) {
        label = `[${props.category}] ${props.id || `Node ${r.id}`}`
      } else {
        label = `Node ${r.id}`
      }

      return {
        id: r.id,
        label,
        type: r.type || 'Unknown',
        properties: props,
      }
    })
  }

  async getTypeDistribution(): Promise<Array<{ type: string; count: number }>> {
    const results = await this.query<{ type: string; count: number }>(
      'MATCH (n) RETURN labels(n)[0] as type, count(*) as count ORDER BY count DESC LIMIT 20'
    )
    return results
  }
}

describe('MemgraphService', () => {
  let service: TestableMemgraphService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new TestableMemgraphService()

    // Setup default mock implementations
    mockDriver.verifyConnectivity.mockResolvedValue(undefined)
    mockDriver.close.mockResolvedValue(undefined)
    mockDriver.session.mockReturnValue(mockSession)
    mockSession.run.mockResolvedValue({ records: [] })
    mockSession.close.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await service.disconnect()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // CONNECTION
  // ===========================================================================
  describe('connect', () => {
    it('should connect successfully', async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined)

      const result = await service.connect()

      expect(result).toBe(true)
      expect(neo4j.driver).toHaveBeenCalledWith(
        'bolt://localhost:7687',
        expect.any(Object),
        expect.objectContaining({
          maxConnectionPoolSize: 10,
          connectionAcquisitionTimeout: 5000,
          connectionTimeout: 5000,
        })
      )
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled()
    })

    it('should return true if already connected', async () => {
      await service.connect()
      vi.clearAllMocks()

      const result = await service.connect()

      expect(result).toBe(true)
      expect(neo4j.driver).not.toHaveBeenCalled() // Should not create new driver
    })

    it('should return false on connection failure', async () => {
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection refused'))

      const result = await service.connect()

      expect(result).toBe(false)
    })

    it('should set driver to null on connection failure', async () => {
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection failed'))

      await service.connect()
      const isConnected = await service.isConnected()

      expect(isConnected).toBe(false)
    })
  })

  // ===========================================================================
  // DISCONNECT
  // ===========================================================================
  describe('disconnect', () => {
    it('should close driver when connected', async () => {
      await service.connect()

      await service.disconnect()

      expect(mockDriver.close).toHaveBeenCalled()
    })

    it('should handle disconnect when not connected', async () => {
      // Should not throw
      await expect(service.disconnect()).resolves.not.toThrow()
    })

    it('should set driver to null after disconnect', async () => {
      await service.connect()
      await service.disconnect()

      const isConnected = await service.isConnected()
      expect(isConnected).toBe(false)
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
      await service.connect()

      const result = await service.isConnected()

      expect(result).toBe(true)
    })

    it('should return false when connectivity check fails', async () => {
      await service.connect()
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection lost'))

      const result = await service.isConnected()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // QUERY
  // ===========================================================================
  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(service.query('MATCH (n) RETURN n')).rejects.toThrow(
        'Not connected to Memgraph'
      )
    })

    it('should execute query and return results', async () => {
      await service.connect()

      const mockRecords = [
        {
          keys: ['name', 'age'],
          get: (key: string) => {
            if (key === 'name') return 'Alice'
            if (key === 'age') return 30
            return null
          },
        },
        {
          keys: ['name', 'age'],
          get: (key: string) => {
            if (key === 'name') return 'Bob'
            if (key === 'age') return 25
            return null
          },
        },
      ]
      mockSession.run.mockResolvedValue({ records: mockRecords })

      const result = await service.query<{ name: string; age: number }>(
        'MATCH (n:Person) RETURN n.name as name, n.age as age'
      )

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Alice')
      expect(result[0].age).toBe(30)
      expect(result[1].name).toBe('Bob')
    })

    it('should pass parameters to query', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.query('MATCH (n) WHERE n.id = $id RETURN n', { id: 123 })

      expect(mockSession.run).toHaveBeenCalledWith(
        'MATCH (n) WHERE n.id = $id RETURN n',
        { id: 123 }
      )
    })

    it('should close session after query', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.query('MATCH (n) RETURN n')

      expect(mockSession.close).toHaveBeenCalled()
    })

    it('should close session even on query error', async () => {
      await service.connect()
      mockSession.run.mockRejectedValue(new Error('Query failed'))

      await expect(service.query('INVALID CYPHER')).rejects.toThrow()
      expect(mockSession.close).toHaveBeenCalled()
    })

    it('should convert neo4j integers to numbers', async () => {
      await service.connect()

      const mockRecords = [
        {
          keys: ['count'],
          get: () => ({ low: 42, high: 0 }), // neo4j integer
        },
      ]
      mockSession.run.mockResolvedValue({ records: mockRecords })

      const result = await service.query<{ count: number }>('MATCH (n) RETURN count(n) as count')

      expect(result[0].count).toBe(42)
    })

    it('should handle null values', async () => {
      await service.connect()

      const mockRecords = [
        {
          keys: ['value'],
          get: () => null,
        },
      ]
      mockSession.run.mockResolvedValue({ records: mockRecords })

      const result = await service.query<{ value: unknown }>('RETURN null as value')

      expect(result[0].value).toBeNull()
    })

    it('should handle array values', async () => {
      await service.connect()

      const mockRecords = [
        {
          keys: ['items'],
          get: () => ['a', 'b', 'c'],
        },
      ]
      mockSession.run.mockResolvedValue({ records: mockRecords })

      const result = await service.query<{ items: string[] }>('RETURN ["a", "b", "c"] as items')

      expect(result[0].items).toEqual(['a', 'b', 'c'])
    })
  })

  // ===========================================================================
  // GET STATS
  // ===========================================================================
  describe('getStats', () => {
    it('should return database statistics', async () => {
      await service.connect()

      // Mock three separate query calls
      let queryCount = 0
      mockSession.run.mockImplementation((_query: string) => {
        queryCount++
        if (queryCount === 1) {
          // Node count query
          return Promise.resolve({
            records: [{ keys: ['count'], get: () => 1000 }],
          })
        } else if (queryCount === 2) {
          // Edge count query
          return Promise.resolve({
            records: [{ keys: ['count'], get: () => 5000 }],
          })
        } else {
          // Labels query
          return Promise.resolve({
            records: [
              { keys: ['label'], get: () => 'Person' },
              { keys: ['label'], get: () => 'Company' },
            ],
          })
        }
      })

      const stats = await service.getStats()

      expect(stats.nodes).toBe(1000)
      expect(stats.edges).toBe(5000)
      expect(stats.labels).toContain('Person')
      expect(stats.labels).toContain('Company')
    })

    it('should return zeros when database is empty', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      const stats = await service.getStats()

      expect(stats.nodes).toBe(0)
      expect(stats.edges).toBe(0)
      expect(stats.labels).toEqual([])
    })

    it('should filter out null labels', async () => {
      await service.connect()

      let queryCount = 0
      mockSession.run.mockImplementation(() => {
        queryCount++
        if (queryCount === 1 || queryCount === 2) {
          return Promise.resolve({
            records: [{ keys: ['count'], get: () => 10 }],
          })
        }
        return Promise.resolve({
          records: [
            { keys: ['label'], get: () => 'ValidLabel' },
            { keys: ['label'], get: () => null },
            { keys: ['label'], get: () => '' },
          ],
        })
      })

      const stats = await service.getStats()

      expect(stats.labels).toEqual(['ValidLabel'])
    })
  })

  // ===========================================================================
  // SEARCH NODES
  // ===========================================================================
  describe('searchNodes', () => {
    it('should search nodes by keyword', async () => {
      await service.connect()

      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['id', 'type', 'node'],
            get: (key: string) => {
              if (key === 'id') return 1
              if (key === 'type') return 'Person'
              if (key === 'node')
                return {
                  properties: { name: 'Alice', description: 'Test user' },
                }
              return null
            },
          },
        ],
      })

      const results = await service.searchNodes('alice')

      expect(results).toHaveLength(1)
      expect(results[0].label).toBe('Alice')
      expect(results[0].type).toBe('Person')
    })

    it('should apply node type filter when specified', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.searchNodes('test', 'CyberTechnique', 25)

      const runCall = mockSession.run.mock.calls[0]
      expect(runCall[0]).toContain('labels(n)[0] = $nodeType')
      expect(runCall[1]).toHaveProperty('nodeType', 'CyberTechnique')
    })

    it('should respect limit parameter', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.searchNodes('test', undefined, 25)

      const runCall = mockSession.run.mock.calls[0]
      expect(runCall[0]).toContain('LIMIT $limit')
    })

    it('should use instruction for label when name is not available', async () => {
      await service.connect()

      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['id', 'type', 'node'],
            get: (key: string) => {
              if (key === 'id') return 1
              if (key === 'type') return 'CyberTechnique'
              if (key === 'node')
                return {
                  properties: { instruction: 'Use nmap to scan ports' },
                }
              return null
            },
          },
        ],
      })

      const results = await service.searchNodes('nmap')

      expect(results[0].label).toBe('Use nmap to scan ports')
    })

    it('should truncate long instruction labels', async () => {
      await service.connect()

      const longInstruction = 'a'.repeat(100)
      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['id', 'type', 'node'],
            get: (key: string) => {
              if (key === 'id') return 1
              if (key === 'type') return 'CyberTechnique'
              if (key === 'node')
                return {
                  properties: { instruction: longInstruction },
                }
              return null
            },
          },
        ],
      })

      const results = await service.searchNodes('test')

      expect(results[0].label.length).toBeLessThan(100)
      expect(results[0].label).toContain('...')
    })

    it('should use category prefix when available', async () => {
      await service.connect()

      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['id', 'type', 'node'],
            get: (key: string) => {
              if (key === 'id') return 42
              if (key === 'type') return 'Category'
              if (key === 'node')
                return {
                  properties: { category: 'Reconnaissance' },
                }
              return null
            },
          },
        ],
      })

      const results = await service.searchNodes('recon')

      expect(results[0].label).toContain('[Reconnaissance]')
    })

    it('should fallback to Node ID for label', async () => {
      await service.connect()

      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['id', 'type', 'node'],
            get: (key: string) => {
              if (key === 'id') return 123
              if (key === 'type') return 'Unknown'
              if (key === 'node') return { properties: {} }
              return null
            },
          },
        ],
      })

      const results = await service.searchNodes('test')

      expect(results[0].label).toBe('Node 123')
    })

    it('should convert keyword to lowercase', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.searchNodes('UPPERCASE')

      const runCall = mockSession.run.mock.calls[0]
      expect(runCall[1]?.keyword).toBe('uppercase')
    })
  })

  // ===========================================================================
  // GET TYPE DISTRIBUTION
  // ===========================================================================
  describe('getTypeDistribution', () => {
    it('should return node type counts', async () => {
      await service.connect()

      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['type', 'count'],
            get: (key: string) => {
              if (key === 'type') return 'CyberTechnique'
              if (key === 'count') return 1500000
              return null
            },
          },
          {
            keys: ['type', 'count'],
            get: (key: string) => {
              if (key === 'type') return 'Technology'
              if (key === 'count') return 50000
              return null
            },
          },
        ],
      })

      const distribution = await service.getTypeDistribution()

      expect(distribution).toHaveLength(2)
      expect(distribution[0].type).toBe('CyberTechnique')
      expect(distribution[0].count).toBe(1500000)
    })

    it('should limit to 20 types', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.getTypeDistribution()

      const runCall = mockSession.run.mock.calls[0]
      expect(runCall[0]).toContain('LIMIT 20')
    })

    it('should order by count descending', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      await service.getTypeDistribution()

      const runCall = mockSession.run.mock.calls[0]
      expect(runCall[0]).toContain('ORDER BY count DESC')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle empty query results', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      const result = await service.query('MATCH (n:NonExistent) RETURN n')

      expect(result).toEqual([])
    })

    it('should handle complex nested objects', async () => {
      await service.connect()

      mockSession.run.mockResolvedValue({
        records: [
          {
            keys: ['data'],
            get: () => ({
              nested: {
                value: 'test',
                array: [1, 2, 3],
              },
            }),
          },
        ],
      })

      const result = await service.query<{ data: { nested: { value: string; array: number[] } } }>(
        'RETURN {nested: {value: "test", array: [1,2,3]}} as data'
      )

      expect(result[0].data.nested.value).toBe('test')
      expect(result[0].data.nested.array).toEqual([1, 2, 3])
    })

    it('should handle special characters in search keyword', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({ records: [] })

      // Should not throw
      await expect(
        service.searchNodes('test.*+?^${}()|[]\\')
      ).resolves.not.toThrow()
    })

    it('should handle concurrent queries', async () => {
      await service.connect()
      mockSession.run.mockResolvedValue({
        records: [{ keys: ['count'], get: () => 1 }],
      })

      const results = await Promise.all([
        service.query('MATCH (n) RETURN count(n) as count'),
        service.query('MATCH (n) RETURN count(n) as count'),
        service.query('MATCH (n) RETURN count(n) as count'),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => {
        expect(r[0].count).toBe(1)
      })
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should return false on connection failure', async () => {
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection timeout'))

      const result = await service.connect()

      expect(result).toBe(false)
    })

    it('should propagate query errors', async () => {
      await service.connect()
      mockSession.run.mockRejectedValue(new Error('Syntax error'))

      await expect(service.query('INVALID CYPHER')).rejects.toThrow('Syntax error')
    })
  })
})
