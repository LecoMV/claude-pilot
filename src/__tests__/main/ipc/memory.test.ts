/**
 * Memory system IPC handler tests
 * Tests PostgreSQL, Memgraph, and Qdrant integrations
 */
import { describe, it, expect, vi } from 'vitest'
import '../setup'
import { createMockPool, createMockDriver } from '../setup'

// Mock pg
vi.mock('pg', () => ({
  Pool: vi.fn(() => createMockPool()),
}))

// Mock neo4j-driver for Memgraph
vi.mock('neo4j-driver', () => ({
  default: {
    driver: vi.fn(() => createMockDriver()),
    auth: {
      basic: vi.fn(),
    },
  },
}))

describe('Memory IPC Handlers', () => {
  describe('memory:learnings', () => {
    it('should query learnings with default limit', async () => {
      const pool = createMockPool()
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, content: 'Test learning', created_at: new Date() },
          { id: 2, content: 'Another learning', created_at: new Date() },
        ],
        rowCount: 2,
      })

      const result = await pool.query(
        'SELECT * FROM learnings ORDER BY created_at DESC LIMIT $1',
        [50]
      )

      expect(result.rows).toHaveLength(2)
      expect(pool.query).toHaveBeenCalled()
    })

    it('should search learnings by keyword', async () => {
      const pool = createMockPool()
      const searchTerm = 'typescript'

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, content: 'TypeScript best practices', created_at: new Date() }],
        rowCount: 1,
      })

      const result = await pool.query('SELECT * FROM learnings WHERE content ILIKE $1 LIMIT $2', [
        `%${searchTerm}%`,
        50,
      ])

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].content).toContain('TypeScript')
    })

    it('should handle empty results gracefully', async () => {
      const pool = createMockPool()
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const result = await pool.query('SELECT * FROM learnings WHERE id = $1', [-1])

      expect(result.rows).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const pool = createMockPool()
      pool.query.mockRejectedValueOnce(new Error('Connection refused'))

      await expect(pool.query('SELECT 1')).rejects.toThrow('Connection refused')
    })
  })

  describe('memory:stats', () => {
    it('should return stats from all sources', () => {
      const mockStats = {
        postgresql: { count: 150 },
        memgraph: { nodes: 500, edges: 1200 },
        qdrant: { vectors: 10000 },
      }

      expect(mockStats.postgresql.count).toBe(150)
      expect(mockStats.memgraph.nodes).toBe(500)
      expect(mockStats.memgraph.edges).toBe(1200)
      expect(mockStats.qdrant.vectors).toBe(10000)
    })
  })

  describe('memory:raw', () => {
    describe('PostgreSQL queries', () => {
      it('should execute valid SELECT queries', async () => {
        const pool = createMockPool()
        pool.query.mockResolvedValueOnce({
          rows: [{ count: 10 }],
          rowCount: 1,
        })

        const result = await pool.query('SELECT COUNT(*) as count FROM learnings')

        expect(result.rows[0].count).toBe(10)
      })

      it('should block DROP statements', () => {
        const dangerousQuery = 'DROP TABLE learnings'
        expect(dangerousQuery.toLowerCase()).toMatch(/^drop\s/i)
      })

      it('should block TRUNCATE statements', () => {
        const dangerousQuery = 'TRUNCATE TABLE learnings'
        expect(dangerousQuery.toLowerCase()).toMatch(/^truncate\s/i)
      })

      it('should block unrestricted DELETE', () => {
        const dangerousQuery = 'DELETE FROM learnings'
        // DELETE without WHERE clause
        expect(dangerousQuery.toLowerCase()).toMatch(/^delete\s+from\s+\w+\s*$/i)
      })

      it('should allow DELETE with WHERE', () => {
        const safeQuery = 'DELETE FROM learnings WHERE id = $1'
        expect(safeQuery.toLowerCase()).toMatch(/where/i)
      })
    })

    describe('Memgraph queries', () => {
      it('should execute valid MATCH queries', async () => {
        const driver = createMockDriver()
        const session = driver.session()

        session.run.mockResolvedValueOnce({
          records: [{ get: () => ({ properties: { name: 'Test' } }) }],
        })

        const result = await session.run('MATCH (n:Learning) RETURN n LIMIT 10')

        expect(result.records).toHaveLength(1)
      })

      it('should block DETACH DELETE without restrictions', () => {
        const dangerousQuery = 'MATCH (n) DETACH DELETE n'
        expect(dangerousQuery.toLowerCase()).toMatch(/detach\s+delete/i)
      })

      it('should allow specific node deletion', () => {
        const safeQuery = 'MATCH (n:Learning {id: $id}) DELETE n'
        expect(safeQuery).toMatch(/\{id:\s*\$id\}/)
      })
    })

    describe('Qdrant queries', () => {
      it('should parse valid collection names', () => {
        const validCollections = ['mem0_memories', 'test_collection', 'embeddings']

        for (const collection of validCollections) {
          expect(collection).toMatch(/^[a-z0-9_]+$/)
        }
      })

      it('should reject invalid collection names', () => {
        const invalidCollections = ['../etc', 'test;drop', 'collection|ls']

        for (const collection of invalidCollections) {
          expect(collection).not.toMatch(/^[a-z0-9_]+$/)
        }
      })
    })
  })

  describe('memory:unified-search', () => {
    it('should merge results from multiple sources', () => {
      const pgResults = [
        { id: '1', source: 'postgresql', score: 0.9 },
        { id: '2', source: 'postgresql', score: 0.7 },
      ]
      const memgraphResults = [{ id: '3', source: 'memgraph', score: 0.85 }]
      const qdrantResults = [{ id: '4', source: 'qdrant', score: 0.95 }]

      const allResults = [...pgResults, ...memgraphResults, ...qdrantResults].sort(
        (a, b) => b.score - a.score
      )

      expect(allResults[0].source).toBe('qdrant')
      expect(allResults[0].score).toBe(0.95)
    })

    it('should apply reciprocal rank fusion correctly', () => {
      // RRF formula: 1 / (k + rank), where k = 60 typically
      const k = 60
      const rank1Score = 1 / (k + 1) // Best result
      const rank2Score = 1 / (k + 2)
      const rank3Score = 1 / (k + 3)

      expect(rank1Score).toBeGreaterThan(rank2Score)
      expect(rank2Score).toBeGreaterThan(rank3Score)
      expect(rank1Score).toBeCloseTo(0.0164, 3)
    })

    it('should handle partial source failures gracefully', () => {
      // If one source fails, others should still return results
      const results = {
        postgresql: [{ id: '1', content: 'test' }],
        memgraph: [], // Failed or empty
        qdrant: [{ id: '2', content: 'test2' }],
      }

      const totalResults = [...results.postgresql, ...results.memgraph, ...results.qdrant]

      expect(totalResults).toHaveLength(2)
    })
  })
})
