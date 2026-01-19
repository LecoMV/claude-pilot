/**
 * PgVector Controller Tests
 *
 * Comprehensive tests for the PgVector tRPC controller.
 * Tests all 9 procedures: status, embed, collections, rebuildIndex,
 * vacuum, getAutoConfig, setAutoConfig, createIndex, search
 *
 * @module pgvector.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pgvectorRouter } from '../pgvector.controller'

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

// Mock postgresService
vi.mock('../../../services/postgresql', () => ({
  postgresService: {
    connect: vi.fn(),
    query: vi.fn(),
    queryScalar: vi.fn(),
    queryRaw: vi.fn(),
  },
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { postgresService } from '../../../services/postgresql'

// Create a test caller
const createTestCaller = () => pgvectorRouter.createCaller({})

describe('pgvector.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // GET AUTO CONFIG PROCEDURE
  // ===========================================================================
  describe('getAutoConfig', () => {
    it('should return default config when no config file exists', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false)

      const result = await caller.getAutoConfig()

      expect(result).toEqual({
        enableLearnings: true,
        enableSessions: false,
        enableCode: false,
        enableCommits: false,
        embeddingModel: 'nomic-embed-text',
        batchSize: 10,
        concurrentRequests: 2,
        rateLimit: 100,
      })
    })

    it('should return merged config when config file exists', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce(
        JSON.stringify({
          enableLearnings: false,
          batchSize: 20,
        })
      )

      const result = await caller.getAutoConfig()

      expect(result).toEqual({
        enableLearnings: false,
        enableSessions: false,
        enableCode: false,
        enableCommits: false,
        embeddingModel: 'nomic-embed-text',
        batchSize: 20,
        concurrentRequests: 2,
        rateLimit: 100,
      })
    })

    it('should return default config when reading config file fails', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockImplementationOnce(() => {
        throw new Error('Read error')
      })

      const result = await caller.getAutoConfig()

      expect(result).toEqual({
        enableLearnings: true,
        enableSessions: false,
        enableCode: false,
        enableCommits: false,
        embeddingModel: 'nomic-embed-text',
        batchSize: 10,
        concurrentRequests: 2,
        rateLimit: 100,
      })
    })
  })

  // ===========================================================================
  // SET AUTO CONFIG PROCEDURE
  // ===========================================================================
  describe('setAutoConfig', () => {
    it('should save config successfully', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(writeFileSync).mockReturnValueOnce(undefined)

      const result = await caller.setAutoConfig({
        config: {
          enableLearnings: true,
          enableSessions: true,
          enableCode: false,
          enableCommits: false,
          embeddingModel: 'nomic-embed-text',
          batchSize: 15,
          concurrentRequests: 4,
          rateLimit: 200,
        },
      })

      expect(result).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()
    })

    it('should create config directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false)
      vi.mocked(mkdirSync).mockReturnValueOnce(undefined)
      vi.mocked(writeFileSync).mockReturnValueOnce(undefined)

      const result = await caller.setAutoConfig({
        config: {
          enableLearnings: true,
          enableSessions: false,
          enableCode: false,
          enableCommits: false,
          embeddingModel: 'nomic-embed-text',
          batchSize: 10,
          concurrentRequests: 2,
          rateLimit: 100,
        },
      })

      expect(result).toBe(true)
      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    })

    it('should return false when saving fails', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(writeFileSync).mockImplementationOnce(() => {
        throw new Error('Write error')
      })

      const result = await caller.setAutoConfig({
        config: {
          enableLearnings: true,
          enableSessions: false,
          enableCode: false,
          enableCommits: false,
          embeddingModel: 'nomic-embed-text',
          batchSize: 10,
          concurrentRequests: 2,
          rateLimit: 100,
        },
      })

      expect(result).toBe(false)
    })

    it('should reject invalid batch size', async () => {
      await expect(
        caller.setAutoConfig({
          config: {
            enableLearnings: true,
            enableSessions: false,
            enableCode: false,
            enableCommits: false,
            embeddingModel: 'nomic-embed-text',
            batchSize: 0, // Invalid - must be >= 1
            concurrentRequests: 2,
            rateLimit: 100,
          },
        })
      ).rejects.toThrow()

      await expect(
        caller.setAutoConfig({
          config: {
            enableLearnings: true,
            enableSessions: false,
            enableCode: false,
            enableCommits: false,
            embeddingModel: 'nomic-embed-text',
            batchSize: 101, // Invalid - must be <= 100
            concurrentRequests: 2,
            rateLimit: 100,
          },
        })
      ).rejects.toThrow()
    })

    it('should reject empty embedding model', async () => {
      await expect(
        caller.setAutoConfig({
          config: {
            enableLearnings: true,
            enableSessions: false,
            enableCode: false,
            enableCommits: false,
            embeddingModel: '',
            batchSize: 10,
            concurrentRequests: 2,
            rateLimit: 100,
          },
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // EMBED PROCEDURE
  // ===========================================================================
  describe('embed', () => {
    it('should generate embedding successfully', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random())
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })

      const result = await caller.embed({ text: 'Hello world' })

      expect(result).toEqual(mockEmbedding)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text:latest',
            prompt: 'Hello world',
          }),
        })
      )
    })

    it('should return null when embedding fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const result = await caller.embed({ text: 'Test text' })

      expect(result).toBeNull()
    })

    it('should return null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await caller.embed({ text: 'Test text' })

      expect(result).toBeNull()
    })

    it('should return null when embedding is missing from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await caller.embed({ text: 'Test text' })

      expect(result).toBeNull()
    })

    it('should reject empty text', async () => {
      await expect(caller.embed({ text: '' })).rejects.toThrow()
    })

    it('should reject text exceeding 32000 characters', async () => {
      const longText = 'a'.repeat(32001)
      await expect(caller.embed({ text: longText })).rejects.toThrow()
    })

    it('should accept text at max length', async () => {
      const maxText = 'a'.repeat(32000)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.1, 0.2, 0.3] }),
      })

      const result = await caller.embed({ text: maxText })

      expect(result).toEqual([0.1, 0.2, 0.3])
    })
  })

  // ===========================================================================
  // STATUS PROCEDURE
  // ===========================================================================
  describe('status', () => {
    beforeEach(() => {
      // Default config mocks
      vi.mocked(existsSync).mockReturnValue(false)
    })

    it('should return enabled status with collections', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }]) // extension check
        .mockResolvedValueOnce([
          // vector tables
          { table_name: 'learnings', column_name: 'embedding', dimensions: 768 },
        ])
        .mockResolvedValueOnce([{ indexname: 'idx_learnings_hnsw', indexdef: 'USING hnsw' }]) // index check
      vi.mocked(postgresService.queryScalar)
        .mockResolvedValueOnce(100) // count
        .mockResolvedValueOnce('1 MB') // size

      const result = await caller.status()

      expect(result.enabled).toBe(true)
      expect(result.version).toBe('0.5.1')
      expect(result.collections).toHaveLength(1)
      expect(result.collections[0]).toMatchObject({
        name: 'learnings',
        tableName: 'learnings',
        vectorCount: 100,
        indexType: 'hnsw',
      })
    })

    it('should return disabled status when extension not found', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([]) // no extension

      const result = await caller.status()

      expect(result.enabled).toBe(false)
      expect(result.collections).toEqual([])
    })

    it('should handle database connection failure', async () => {
      vi.mocked(postgresService.connect).mockRejectedValueOnce(new Error('Connection failed'))

      const result = await caller.status()

      expect(result.enabled).toBe(false)
      expect(result.collections).toEqual([])
    })

    it('should detect ivfflat index type', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }])
        .mockResolvedValueOnce([{ table_name: 'vectors', column_name: 'vec', dimensions: 384 }])
        .mockResolvedValueOnce([{ indexname: 'idx_vectors_ivfflat', indexdef: 'USING ivfflat' }])
      vi.mocked(postgresService.queryScalar).mockResolvedValueOnce(50).mockResolvedValueOnce('500 KB')

      const result = await caller.status()

      expect(result.collections[0].indexType).toBe('ivfflat')
    })

    it('should detect no index', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }])
        .mockResolvedValueOnce([{ table_name: 'unindexed', column_name: 'embedding', dimensions: 768 }])
        .mockResolvedValueOnce([]) // no index
      vi.mocked(postgresService.queryScalar).mockResolvedValueOnce(10).mockResolvedValueOnce('100 KB')

      const result = await caller.status()

      expect(result.collections[0].indexType).toBe('none')
    })
  })

  // ===========================================================================
  // COLLECTIONS PROCEDURE
  // ===========================================================================
  describe('collections', () => {
    it('should return collections from status', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }])
        .mockResolvedValueOnce([
          { table_name: 'learnings', column_name: 'embedding', dimensions: 768 },
          { table_name: 'sessions', column_name: 'embedding', dimensions: 768 },
        ])
        .mockResolvedValueOnce([{ indexname: 'idx_1', indexdef: 'USING hnsw' }])
        .mockResolvedValueOnce([])
      vi.mocked(postgresService.queryScalar)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce('1 MB')
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce('500 KB')

      const result = await caller.collections()

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('learnings')
      expect(result[1].name).toBe('sessions')
    })

    it('should return empty array when not enabled', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([])

      const result = await caller.collections()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // VACUUM PROCEDURE
  // ===========================================================================
  describe('vacuum', () => {
    it('should vacuum table successfully', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.queryRaw).mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })

      const result = await caller.vacuum({ table: 'learnings' })

      expect(result).toBe(true)
      expect(postgresService.queryRaw).toHaveBeenCalledWith('VACUUM ANALYZE "learnings"')
    })

    it('should return false when vacuum fails', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.queryRaw).mockRejectedValueOnce(new Error('Vacuum failed'))

      const result = await caller.vacuum({ table: 'learnings' })

      expect(result).toBe(false)
    })

    it('should reject empty table name', async () => {
      await expect(caller.vacuum({ table: '' })).rejects.toThrow()
    })

    it('should reject table name exceeding 100 characters', async () => {
      const longTable = 'a'.repeat(101)
      await expect(caller.vacuum({ table: longTable })).rejects.toThrow()
    })

    it('should reject invalid table name format', async () => {
      await expect(caller.vacuum({ table: '123table' })).rejects.toThrow()
      await expect(caller.vacuum({ table: 'table-name' })).rejects.toThrow()
      await expect(caller.vacuum({ table: 'table.name' })).rejects.toThrow()
      await expect(caller.vacuum({ table: 'table name' })).rejects.toThrow()
    })

    it('should accept valid table name formats', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.queryRaw).mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

      await expect(caller.vacuum({ table: 'learnings' })).resolves.toBe(true)
      await expect(caller.vacuum({ table: '_private_table' })).resolves.toBe(true)
      await expect(caller.vacuum({ table: 'table_name_123' })).resolves.toBe(true)
    })
  })

  // ===========================================================================
  // REBUILD INDEX PROCEDURE
  // ===========================================================================
  describe('rebuildIndex', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false)
    })

    it('should rebuild existing hnsw index', async () => {
      // First call for status check
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }]) // extension
        .mockResolvedValueOnce([{ table_name: 'learnings', column_name: 'embedding', dimensions: 768 }]) // tables
        .mockResolvedValueOnce([{ indexname: 'idx_hnsw', indexdef: 'USING hnsw' }]) // index
        .mockResolvedValueOnce([{ column_name: 'embedding' }]) // find vector column for rebuild
      vi.mocked(postgresService.queryScalar).mockResolvedValueOnce(100).mockResolvedValueOnce('1 MB')
      vi.mocked(postgresService.queryRaw).mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

      const result = await caller.rebuildIndex({ table: 'learnings' })

      expect(result).toBe(true)
    })

    it('should return false when table has no index', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }])
        .mockResolvedValueOnce([{ table_name: 'learnings', column_name: 'embedding', dimensions: 768 }])
        .mockResolvedValueOnce([]) // no index
      vi.mocked(postgresService.queryScalar).mockResolvedValueOnce(100).mockResolvedValueOnce('1 MB')

      const result = await caller.rebuildIndex({ table: 'learnings' })

      expect(result).toBe(false)
    })

    it('should return false when table not found', async () => {
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ version: '0.5.1' }])
        .mockResolvedValueOnce([]) // no tables
      vi.mocked(postgresService.queryScalar).mockResolvedValue(0)

      const result = await caller.rebuildIndex({ table: 'nonexistent' })

      expect(result).toBe(false)
    })

    it('should reject invalid table name', async () => {
      await expect(caller.rebuildIndex({ table: '' })).rejects.toThrow()
      await expect(caller.rebuildIndex({ table: 'invalid-name' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CREATE INDEX PROCEDURE
  // ===========================================================================
  describe('createIndex', () => {
    it('should create hnsw index with default params', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([{ column_name: 'embedding' }])
      vi.mocked(postgresService.queryRaw).mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

      const result = await caller.createIndex({
        table: 'learnings',
        config: { type: 'hnsw' },
      })

      expect(result).toBe(true)
      expect(postgresService.queryRaw).toHaveBeenCalledWith('DROP INDEX IF EXISTS "idx_learnings_embedding_hnsw"')
      expect(postgresService.queryRaw).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX "idx_learnings_embedding_hnsw"')
      )
    })

    it('should create hnsw index with custom params', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([{ column_name: 'embedding' }])
      vi.mocked(postgresService.queryRaw).mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

      const result = await caller.createIndex({
        table: 'learnings',
        config: { type: 'hnsw', m: 32, efConstruction: 128 },
      })

      expect(result).toBe(true)
      expect(postgresService.queryRaw).toHaveBeenCalledWith(
        expect.stringMatching(/m = 32.*ef_construction = 128/)
      )
    })

    it('should create ivfflat index', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([{ column_name: 'embedding' }])
      vi.mocked(postgresService.queryRaw).mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

      const result = await caller.createIndex({
        table: 'learnings',
        config: { type: 'ivfflat', lists: 200 },
      })

      expect(result).toBe(true)
      expect(postgresService.queryRaw).toHaveBeenCalledWith(
        expect.stringContaining('USING ivfflat')
      )
      expect(postgresService.queryRaw).toHaveBeenCalledWith(expect.stringContaining('lists = 200'))
    })

    it('should drop index when type is none', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([{ column_name: 'embedding' }])
      vi.mocked(postgresService.queryRaw).mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })

      const result = await caller.createIndex({
        table: 'learnings',
        config: { type: 'none' },
      })

      expect(result).toBe(true)
      expect(postgresService.queryRaw).toHaveBeenCalledTimes(1)
      expect(postgresService.queryRaw).toHaveBeenCalledWith('DROP INDEX IF EXISTS "idx_learnings_embedding_none"')
    })

    it('should return false when no vector column found', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query).mockResolvedValueOnce([])

      const result = await caller.createIndex({
        table: 'learnings',
        config: { type: 'hnsw' },
      })

      expect(result).toBe(false)
    })

    it('should reject invalid index config params', async () => {
      // m too low
      await expect(
        caller.createIndex({
          table: 'learnings',
          config: { type: 'hnsw', m: 1 },
        })
      ).rejects.toThrow()

      // m too high
      await expect(
        caller.createIndex({
          table: 'learnings',
          config: { type: 'hnsw', m: 101 },
        })
      ).rejects.toThrow()

      // efConstruction too low
      await expect(
        caller.createIndex({
          table: 'learnings',
          config: { type: 'hnsw', efConstruction: 3 },
        })
      ).rejects.toThrow()

      // lists out of range
      await expect(
        caller.createIndex({
          table: 'learnings',
          config: { type: 'ivfflat', lists: 0 },
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SEARCH PROCEDURE
  // ===========================================================================
  describe('search', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false)
    })

    it('should search vectors and return results', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random())
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ table_name: 'learnings' }]) // all tables
        .mockResolvedValueOnce([
          // column info
          { column_name: 'embedding', data_type: 'USER-DEFINED' },
          { column_name: 'content', data_type: 'text' },
          { column_name: 'id', data_type: 'integer' },
        ])
        .mockResolvedValueOnce([
          // search results
          { id: 1, content: 'Result 1', similarity: 0.95 },
          { id: 2, content: 'Result 2', similarity: 0.85 },
        ])

      const result = await caller.search({ query: 'test query' })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 1,
        tableName: 'learnings',
        content: 'Result 1',
        similarity: 0.95,
      })
    })

    it('should search specific table when provided', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([
          { column_name: 'embedding', data_type: 'USER-DEFINED' },
          { column_name: 'content', data_type: 'text' },
          { column_name: 'id', data_type: 'integer' },
        ])
        .mockResolvedValueOnce([{ id: 1, content: 'Result', similarity: 0.9 }])

      const result = await caller.search({ query: 'test', table: 'specific_table' })

      expect(result).toHaveLength(1)
      expect(result[0].tableName).toBe('specific_table')
    })

    it('should return empty array when embedding fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Ollama not available'))

      const result = await caller.search({ query: 'test query' })

      expect(result).toEqual([])
    })

    it('should respect limit parameter', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ table_name: 'learnings' }])
        .mockResolvedValueOnce([
          { column_name: 'embedding', data_type: 'USER-DEFINED' },
          { column_name: 'content', data_type: 'text' },
          { column_name: 'id', data_type: 'integer' },
        ])
        .mockResolvedValueOnce([
          { id: 1, content: 'R1', similarity: 0.9 },
          { id: 2, content: 'R2', similarity: 0.8 },
          { id: 3, content: 'R3', similarity: 0.7 },
        ])

      const result = await caller.search({ query: 'test', limit: 2 })

      expect(result).toHaveLength(2)
    })

    it('should reject empty query', async () => {
      await expect(caller.search({ query: '' })).rejects.toThrow()
    })

    it('should reject invalid limit values', async () => {
      await expect(caller.search({ query: 'test', limit: 0 })).rejects.toThrow()
      await expect(caller.search({ query: 'test', limit: 101 })).rejects.toThrow()
    })

    it('should reject invalid threshold values', async () => {
      await expect(caller.search({ query: 'test', threshold: -0.1 })).rejects.toThrow()
      await expect(caller.search({ query: 'test', threshold: 1.1 })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should prevent SQL injection in table name for vacuum', async () => {
      const maliciousNames = [
        'table; DROP TABLE users; --',
        "table' OR '1'='1",
        'table"; DELETE FROM users; --',
      ]

      for (const name of maliciousNames) {
        await expect(caller.vacuum({ table: name })).rejects.toThrow()
      }
    })

    it('should prevent SQL injection in table name for index creation', async () => {
      const maliciousNames = [
        'table; DROP TABLE users',
        "table' UNION SELECT * FROM users",
      ]

      for (const name of maliciousNames) {
        await expect(
          caller.createIndex({ table: name, config: { type: 'hnsw' } })
        ).rejects.toThrow()
      }
    })

    it('should sanitize text input for embedding', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.1] }),
      })

      // Should not throw for text with special characters
      await caller.embed({ text: 'SELECT * FROM users; --' })

      // Verify the text was passed as-is to the embedding service
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('SELECT * FROM users; --'),
        })
      )
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent status calls', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(postgresService.connect).mockResolvedValue(true)
      vi.mocked(postgresService.query).mockResolvedValue([])

      const results = await Promise.all([caller.status(), caller.status(), caller.status()])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r.enabled).toBe(false))
    })

    it('should handle table name at exact max length', async () => {
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.queryRaw).mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })

      const maxLengthTable = 'a'.repeat(100)
      const result = await caller.vacuum({ table: maxLengthTable })

      expect(result).toBe(true)
    })

    it('should handle search with minimum threshold', async () => {
      const mockEmbedding = [0.1, 0.2]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ table_name: 't' }])
        .mockResolvedValueOnce([
          { column_name: 'embedding', data_type: 'USER-DEFINED' },
          { column_name: 'content', data_type: 'text' },
          { column_name: 'id', data_type: 'integer' },
        ])
        .mockResolvedValueOnce([])

      await expect(caller.search({ query: 'test', threshold: 0 })).resolves.toEqual([])
    })

    it('should handle search with maximum threshold', async () => {
      const mockEmbedding = [0.1, 0.2]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      })
      vi.mocked(postgresService.connect).mockResolvedValueOnce(true)
      vi.mocked(postgresService.query)
        .mockResolvedValueOnce([{ table_name: 't' }])
        .mockResolvedValueOnce([
          { column_name: 'embedding', data_type: 'USER-DEFINED' },
          { column_name: 'content', data_type: 'text' },
          { column_name: 'id', data_type: 'integer' },
        ])
        .mockResolvedValueOnce([])

      await expect(caller.search({ query: 'test', threshold: 1 })).resolves.toEqual([])
    })
  })
})
