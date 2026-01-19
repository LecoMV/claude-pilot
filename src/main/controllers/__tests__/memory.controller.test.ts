/**
 * Memory Controller Tests
 *
 * Comprehensive tests for the memory tRPC controller.
 * Tests all 12 procedures: learnings, stats, graph, qdrantBrowse, qdrantSearch,
 * memgraphSearch, raw, unifiedSearch, embed, qdrantCollections, health
 *
 * @module memory.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memoryRouter } from '../memory.controller'
import { memgraphService } from '../../services/memgraph'
import { postgresService } from '../../services/postgresql'
import QdrantService from '../../services/memory/qdrant.service'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the services
vi.mock('../../services/memgraph', () => ({
  memgraphService: {
    connect: vi.fn(),
    isConnected: vi.fn(),
    query: vi.fn(),
    getStats: vi.fn(),
    getSampleGraph: vi.fn(),
  },
}))

vi.mock('../../services/postgresql', () => ({
  postgresService: {
    connect: vi.fn(),
    isConnected: vi.fn(),
    query: vi.fn(),
    queryScalar: vi.fn(),
  },
}))

vi.mock('../../services/memory/qdrant.service', () => {
  const mockInstance = {
    listCollections: vi.fn(),
    getCollectionStats: vi.fn(),
    healthCheck: vi.fn(),
  }
  return {
    default: {
      getInstance: vi.fn(() => mockInstance),
    },
  }
})

// Create a test caller using createCaller pattern
const createTestCaller = () => memoryRouter.createCaller({})

describe('memory.controller', () => {
  let caller: ReturnType<typeof createTestCaller>
  let mockQdrantInstance: ReturnType<typeof QdrantService.getInstance>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
    mockQdrantInstance = QdrantService.getInstance()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // LEARNINGS PROCEDURE
  // ===========================================================================
  describe('learnings', () => {
    it('should return empty array when no learnings found', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([])

      const result = await caller.learnings({ limit: 50 })

      expect(result).toEqual([])
    })

    it('should return learnings with default limit', async () => {
      const mockRows = [
        {
          id: 1,
          topic: 'Test Topic',
          content: 'Test Content',
          category: 'general',
          created_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          topic: 'Another Topic',
          content: 'More Content',
          category: 'code',
          created_at: '2024-01-14T10:00:00Z',
        },
      ]
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue(mockRows)

      const result = await caller.learnings({ limit: 50 })

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[0].topic).toBe('Test Topic')
      expect(result[0].category).toBe('general')
    })

    it('should filter learnings by query', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([])

      await caller.learnings({ query: 'typescript', limit: 50 })

      expect(postgresService.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%typescript%', 50])
      )
    })

    it('should filter learnings by category', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([])

      await caller.learnings({ category: 'code', limit: 50 })

      expect(postgresService.query).toHaveBeenCalledWith(
        expect.stringContaining('category ='),
        expect.arrayContaining(['code', 50])
      )
    })

    it('should return empty array when PostgreSQL not connected', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(false)

      const result = await caller.learnings({ limit: 50 })

      expect(result).toEqual([])
    })

    it('should reject limit less than 1', async () => {
      await expect(caller.learnings({ limit: 0 })).rejects.toThrow()
    })

    it('should reject limit greater than 500', async () => {
      await expect(caller.learnings({ limit: 501 })).rejects.toThrow()
    })

    it('should handle database query errors gracefully', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockRejectedValue(new Error('Database error'))

      const result = await caller.learnings({ limit: 50 })

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return all memory statistics', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.queryScalar).mockResolvedValue(100)
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.getStats).mockResolvedValue({ nodes: 1000, edges: 5000 })
      vi.mocked(mockQdrantInstance.listCollections).mockResolvedValue(['claude_memories', 'mem0_memories'])
      vi.mocked(mockQdrantInstance.getCollectionStats).mockResolvedValue({
        pointsCount: 500,
        vectorsCount: 500,
        indexedVectorsCount: 500,
        segmentsCount: 1,
        status: 'green',
      })

      const result = await caller.stats()

      expect(result.postgresql.count).toBe(100)
      expect(result.memgraph.nodes).toBe(1000)
      expect(result.memgraph.edges).toBe(5000)
      expect(result.qdrant.vectors).toBe(1000) // 2 collections x 500 each
    })

    it('should handle PostgreSQL failure gracefully', async () => {
      // PostgreSQL connect fails, queryScalar won't be called due to Promise.allSettled behavior
      // but we mock it anyway to simulate the pattern
      vi.mocked(postgresService.connect).mockRejectedValue(new Error('Connection failed'))
      vi.mocked(postgresService.queryScalar).mockResolvedValue(null)
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.getStats).mockResolvedValue({ nodes: 100, edges: 200 })
      vi.mocked(mockQdrantInstance.listCollections).mockResolvedValue([])

      const result = await caller.stats()

      expect(result.postgresql.count).toBe(0)
      expect(result.memgraph.nodes).toBe(100)
    })

    it('should handle Memgraph failure gracefully', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.queryScalar).mockResolvedValue(50)
      vi.mocked(memgraphService.connect).mockRejectedValue(new Error('Connection refused'))
      vi.mocked(mockQdrantInstance.listCollections).mockResolvedValue([])

      const result = await caller.stats()

      expect(result.postgresql.count).toBe(50)
      expect(result.memgraph.nodes).toBe(0)
      expect(result.memgraph.edges).toBe(0)
    })

    it('should handle Qdrant failure gracefully', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.queryScalar).mockResolvedValue(25)
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.getStats).mockResolvedValue({ nodes: 50, edges: 100 })
      vi.mocked(mockQdrantInstance.listCollections).mockRejectedValue(new Error('Qdrant offline'))

      const result = await caller.stats()

      expect(result.postgresql.count).toBe(25)
      expect(result.qdrant.vectors).toBe(0)
    })
  })

  // ===========================================================================
  // GRAPH PROCEDURE
  // ===========================================================================
  describe('graph', () => {
    it('should return sample graph when no query provided', async () => {
      const mockGraph = {
        nodes: [{ id: '1', label: 'Node 1', type: 'Test', properties: {} }],
        edges: [{ id: 'e1', source: '1', target: '2', type: 'RELATED', properties: {} }],
      }
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.getSampleGraph).mockResolvedValue(mockGraph)

      const result = await caller.graph({ limit: 100 })

      expect(result.nodes).toHaveLength(1)
      expect(result.edges).toHaveLength(1)
      expect(memgraphService.getSampleGraph).toHaveBeenCalledWith(100)
    })

    it('should execute custom Cypher query', async () => {
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([
        {
          n: { id: 1, labels: ['Technique'], properties: { name: 'SQL Injection' } },
        },
      ])

      const result = await caller.graph({ query: 'MATCH (n) RETURN n LIMIT 10', limit: 100 })

      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].type).toBe('Technique')
    })

    it('should return empty graph on Memgraph error', async () => {
      vi.mocked(memgraphService.connect).mockRejectedValue(new Error('Connection failed'))

      const result = await caller.graph({ limit: 100 })

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('should reject limit less than 1', async () => {
      await expect(caller.graph({ limit: 0 })).rejects.toThrow()
    })

    it('should reject limit greater than 1000', async () => {
      await expect(caller.graph({ limit: 1001 })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // QDRANT BROWSE PROCEDURE
  // ===========================================================================
  describe('qdrantBrowse', () => {
    it('should browse memories with default parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              points: [
                { id: 'p1', payload: { data: 'Test memory', created_at: '2024-01-15' } },
                { id: 'p2', payload: { data: 'Another memory' } },
              ],
              next_page_offset: 'offset123',
            },
          }),
      })

      const result = await caller.qdrantBrowse({
        collection: 'mem0_memories',
        limit: 50,
      })

      expect(result.points).toHaveLength(2)
      expect(result.nextOffset).toBe('offset123')
    })

    it('should browse with pagination offset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              points: [],
              next_page_offset: null,
            },
          }),
      })

      await caller.qdrantBrowse({
        collection: 'mem0_memories',
        limit: 50,
        offset: 'offset123',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/mem0_memories/points/scroll',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"offset":"offset123"'),
        })
      )
    })

    it('should return empty result on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await caller.qdrantBrowse({
        collection: 'mem0_memories',
        limit: 50,
      })

      expect(result.points).toEqual([])
      expect(result.nextOffset).toBeNull()
    })

    it('should return empty result on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const result = await caller.qdrantBrowse({
        collection: 'mem0_memories',
        limit: 50,
      })

      expect(result.points).toEqual([])
      expect(result.nextOffset).toBeNull()
    })

    it('should reject limit less than 1', async () => {
      await expect(
        caller.qdrantBrowse({ collection: 'mem0_memories', limit: 0 })
      ).rejects.toThrow()
    })

    it('should reject limit greater than 100', async () => {
      await expect(
        caller.qdrantBrowse({ collection: 'mem0_memories', limit: 101 })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // QDRANT SEARCH PROCEDURE
  // ===========================================================================
  describe('qdrantSearch', () => {
    it('should search using embedding', async () => {
      // Mock Ollama embedding
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: new Array(1024).fill(0.1) }),
      })
      // Mock Qdrant search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [
              { id: 'r1', score: 0.95, payload: { data: 'Result 1' } },
              { id: 'r2', score: 0.85, payload: { data: 'Result 2' } },
            ],
          }),
      })

      const result = await caller.qdrantSearch({
        query: 'test query',
        collection: 'mem0_memories',
        limit: 20,
      })

      expect(result.results).toHaveLength(2)
      expect(result.results[0].score).toBe(0.95)
    })

    it('should fallback to keyword search when embedding fails', async () => {
      // Mock Ollama embedding failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })
      // Mock Qdrant scroll (fallback)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              points: [
                { id: 'p1', payload: { data: 'test query content' } },
                { id: 'p2', payload: { data: 'other content' } },
              ],
            },
          }),
      })

      const result = await caller.qdrantSearch({
        query: 'test query',
        collection: 'mem0_memories',
        limit: 20,
      })

      // Should filter to matching content
      expect(result.results).toHaveLength(1)
    })

    it('should return empty results on complete failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await caller.qdrantSearch({
        query: 'test',
        collection: 'mem0_memories',
        limit: 20,
      })

      expect(result.results).toEqual([])
    })

    it('should reject empty query', async () => {
      await expect(
        caller.qdrantSearch({ query: '', collection: 'mem0_memories', limit: 20 })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // MEMGRAPH SEARCH PROCEDURE
  // ===========================================================================
  describe('memgraphSearch', () => {
    it('should search nodes by keyword', async () => {
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([
        {
          n: { id: 1, properties: { name: 'SQL Injection' } },
          labels: ['Technique'],
        },
        {
          n: { id: 2, properties: { name: 'SQL Truncation' } },
          labels: ['Vulnerability'],
        },
      ])

      const result = await caller.memgraphSearch({
        keyword: 'SQL',
        limit: 50,
      })

      expect(result.results).toHaveLength(2)
      expect(result.results[0].type).toBe('Technique')
    })

    it('should filter by node type', async () => {
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([])

      await caller.memgraphSearch({
        keyword: 'test',
        nodeType: 'Technique',
        limit: 50,
      })

      expect(memgraphService.query).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (n:Technique)')
      )
    })

    it('should return empty results on error', async () => {
      vi.mocked(memgraphService.connect).mockRejectedValue(new Error('Connection failed'))

      const result = await caller.memgraphSearch({
        keyword: 'test',
        limit: 50,
      })

      expect(result.results).toEqual([])
    })

    it('should reject empty keyword', async () => {
      await expect(caller.memgraphSearch({ keyword: '', limit: 50 })).rejects.toThrow()
    })

    it('should sanitize keyword for safety', async () => {
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([])

      // The sanitizer removes special regex characters (not a-zA-Z0-9\s-_)
      // This prevents regex injection, not SQL injection (Cypher in this case)
      await caller.memgraphSearch({
        keyword: "test$%^&*()",
        limit: 50,
      })

      // The query should have the sanitized keyword (special chars stripped)
      expect(memgraphService.query).toHaveBeenCalledWith(
        expect.stringContaining('test')
      )
      // Should not contain the special regex characters
      expect(memgraphService.query).toHaveBeenCalledWith(
        expect.not.stringContaining('$%^')
      )
    })
  })

  // ===========================================================================
  // RAW QUERY PROCEDURE
  // ===========================================================================
  describe('raw', () => {
    it('should execute PostgreSQL query', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([{ id: 1, name: 'test' }])

      const result = await caller.raw({
        source: 'postgresql',
        query: 'SELECT * FROM test',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual([{ id: 1, name: 'test' }])
      expect(result.executionTime).toBeGreaterThanOrEqual(0)
    })

    it('should execute Memgraph query', async () => {
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([{ n: { id: 1 } }])

      const result = await caller.raw({
        source: 'memgraph',
        query: 'MATCH (n) RETURN n LIMIT 10',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual([{ n: { id: 1 } }])
    })

    it('should reject Qdrant raw queries', async () => {
      const result = await caller.raw({
        source: 'qdrant',
        query: 'some query',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('does not support raw queries')
    })

    it('should block DROP queries', async () => {
      const result = await caller.raw({
        source: 'postgresql',
        query: 'DROP TABLE learnings',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('dangerous')
    })

    it('should block TRUNCATE queries', async () => {
      const result = await caller.raw({
        source: 'postgresql',
        query: 'TRUNCATE TABLE learnings',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('dangerous')
    })

    it('should block DELETE without WHERE', async () => {
      const result = await caller.raw({
        source: 'postgresql',
        query: 'DELETE FROM learnings',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('dangerous')
    })

    it('should block ALTER queries', async () => {
      const result = await caller.raw({
        source: 'postgresql',
        query: 'ALTER TABLE learnings ADD COLUMN x INT',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('dangerous')
    })

    it('should block GRANT queries', async () => {
      const result = await caller.raw({
        source: 'postgresql',
        query: 'GRANT ALL ON learnings TO hacker',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('dangerous')
    })

    it('should handle query execution errors', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockRejectedValue(new Error('Syntax error'))

      const result = await caller.raw({
        source: 'postgresql',
        query: 'SELEC * FROM test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Syntax error')
    })

    it('should reject empty query', async () => {
      await expect(
        caller.raw({ source: 'postgresql', query: '' })
      ).rejects.toThrow()
    })

    it('should reject query exceeding max length', async () => {
      const longQuery = 'SELECT * FROM test WHERE id = ' + '1'.repeat(10000)
      await expect(
        caller.raw({ source: 'postgresql', query: longQuery })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // UNIFIED SEARCH PROCEDURE
  // ===========================================================================
  describe('unifiedSearch', () => {
    it('should search across all sources', async () => {
      // Mock PostgreSQL
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([
        { id: 1, topic: 'Test', content: 'Content', category: 'general', created_at: '2024-01-15' },
      ])

      // Mock Memgraph
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([])

      // Mock Qdrant (through fetch)
      mockFetch
        .mockResolvedValueOnce({ ok: false }) // Ollama embedding fails
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: { points: [] } }),
        })

      const result = await caller.unifiedSearch({
        query: 'test',
        limit: 20,
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].source).toBe('postgresql')
      expect(result.stats.totalTime).toBeGreaterThanOrEqual(0)
    })

    it('should handle partial failures gracefully', async () => {
      // PostgreSQL fails
      vi.mocked(postgresService.connect).mockResolvedValue(false)

      // Memgraph works
      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([
        { n: { id: 1, properties: { name: 'Test' } }, labels: ['Node'] },
      ])

      // Qdrant fails
      mockFetch.mockRejectedValue(new Error('Connection refused'))

      const result = await caller.unifiedSearch({
        query: 'test',
        limit: 20,
      })

      // Should still have Memgraph results
      expect(result.results.filter((r) => r.source === 'memgraph')).toHaveLength(1)
    })

    it('should sort results by score', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([
        { id: 1, topic: 'Low', content: 'Content', category: 'general', created_at: '2024-01-15' },
      ])

      vi.mocked(memgraphService.connect).mockResolvedValue(true)
      vi.mocked(memgraphService.query).mockResolvedValue([])

      // Qdrant with high score
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: [0.1] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              result: [{ id: 'q1', score: 0.99, payload: { content: 'High score' } }],
            }),
        })

      const result = await caller.unifiedSearch({
        query: 'test',
        limit: 20,
      })

      // Qdrant result (0.99) should be first, PostgreSQL (0.8) second
      expect(result.results[0].source).toBe('qdrant')
      expect(result.results[0].score).toBe(0.99)
    })

    it('should reject empty query', async () => {
      await expect(caller.unifiedSearch({ query: '', limit: 20 })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // EMBED PROCEDURE
  // ===========================================================================
  describe('embed', () => {
    it('should generate embedding for text', async () => {
      const mockEmbedding = new Array(1024).fill(0.1)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })

      const result = await caller.embed({ text: 'Hello world' })

      expect(result.embedding).toEqual(mockEmbedding)
      expect(result.dimensions).toBe(1024)
    })

    it('should return null embedding on Ollama failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await caller.embed({ text: 'Hello world' })

      expect(result.embedding).toBeNull()
      expect(result.dimensions).toBe(0)
    })

    it('should reject empty text', async () => {
      await expect(caller.embed({ text: '' })).rejects.toThrow()
    })

    it('should reject text exceeding max length', async () => {
      const longText = 'a'.repeat(10001)
      await expect(caller.embed({ text: longText })).rejects.toThrow()
    })

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await caller.embed({ text: 'Hello' })

      expect(result.embedding).toBeNull()
      expect(result.dimensions).toBe(0)
    })
  })

  // ===========================================================================
  // QDRANT COLLECTIONS PROCEDURE
  // ===========================================================================
  describe('qdrantCollections', () => {
    it('should return list of collections', async () => {
      vi.mocked(mockQdrantInstance.listCollections).mockResolvedValue([
        'claude_memories',
        'mem0_memories',
      ])

      const result = await caller.qdrantCollections()

      expect(result).toEqual(['claude_memories', 'mem0_memories'])
    })

    it('should return empty array on error', async () => {
      vi.mocked(mockQdrantInstance.listCollections).mockRejectedValue(
        new Error('Connection refused')
      )

      const result = await caller.qdrantCollections()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // HEALTH PROCEDURE
  // ===========================================================================
  describe('health', () => {
    it('should return health status for all services', async () => {
      vi.mocked(postgresService.isConnected).mockResolvedValue(true)
      vi.mocked(memgraphService.isConnected).mockResolvedValue(true)
      vi.mocked(mockQdrantInstance.healthCheck).mockResolvedValue(true)
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await caller.health()

      expect(result.postgresql).toBe(true)
      expect(result.memgraph).toBe(true)
      expect(result.qdrant).toBe(true)
      expect(result.ollama).toBe(true)
    })

    it('should handle PostgreSQL being down', async () => {
      vi.mocked(postgresService.isConnected).mockResolvedValue(false)
      vi.mocked(memgraphService.isConnected).mockResolvedValue(true)
      vi.mocked(mockQdrantInstance.healthCheck).mockResolvedValue(true)
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await caller.health()

      expect(result.postgresql).toBe(false)
      expect(result.memgraph).toBe(true)
    })

    it('should handle Memgraph being down', async () => {
      vi.mocked(postgresService.isConnected).mockResolvedValue(true)
      vi.mocked(memgraphService.isConnected).mockResolvedValue(false)
      vi.mocked(mockQdrantInstance.healthCheck).mockResolvedValue(true)
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await caller.health()

      expect(result.postgresql).toBe(true)
      expect(result.memgraph).toBe(false)
    })

    it('should handle Qdrant being down', async () => {
      vi.mocked(postgresService.isConnected).mockResolvedValue(true)
      vi.mocked(memgraphService.isConnected).mockResolvedValue(true)
      vi.mocked(mockQdrantInstance.healthCheck).mockResolvedValue(false)
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await caller.health()

      expect(result.qdrant).toBe(false)
    })

    it('should handle Ollama being down', async () => {
      vi.mocked(postgresService.isConnected).mockResolvedValue(true)
      vi.mocked(memgraphService.isConnected).mockResolvedValue(true)
      vi.mocked(mockQdrantInstance.healthCheck).mockResolvedValue(true)
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await caller.health()

      expect(result.ollama).toBe(false)
    })

    it('should handle all services being down', async () => {
      vi.mocked(postgresService.isConnected).mockRejectedValue(new Error('Down'))
      vi.mocked(memgraphService.isConnected).mockRejectedValue(new Error('Down'))
      vi.mocked(mockQdrantInstance.healthCheck).mockRejectedValue(new Error('Down'))
      mockFetch.mockRejectedValueOnce(new Error('Down'))

      const result = await caller.health()

      expect(result.postgresql).toBe(false)
      expect(result.memgraph).toBe(false)
      expect(result.qdrant).toBe(false)
      expect(result.ollama).toBe(false)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent health checks', async () => {
      vi.mocked(postgresService.isConnected).mockResolvedValue(true)
      vi.mocked(memgraphService.isConnected).mockResolvedValue(true)
      vi.mocked(mockQdrantInstance.healthCheck).mockResolvedValue(true)
      mockFetch.mockResolvedValue({ ok: true })

      const results = await Promise.all([caller.health(), caller.health(), caller.health()])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.postgresql).toBe(true)
      })
    })

    it('should handle limit at exact boundaries for learnings', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([])

      // Min boundary
      await expect(caller.learnings({ limit: 1 })).resolves.toEqual([])

      // Max boundary
      await expect(caller.learnings({ limit: 500 })).resolves.toEqual([])
    })

    it('should handle special characters in search queries', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([])

      // Should not throw even with special characters
      await expect(
        caller.learnings({ query: "test'query\"with;special", limit: 50 })
      ).resolves.toEqual([])
    })
  })
})
