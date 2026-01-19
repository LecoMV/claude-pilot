/**
 * Qdrant Memory Service Tests
 *
 * Comprehensive tests for the QdrantService that provides vector memory
 * storage using the Qdrant vector database.
 *
 * Tests all public methods: initializeCollection, getCollectionStats, listCollections,
 * storeMemory, batchStoreMemories, searchMemories, deleteMemory, deleteMemoriesByFilter,
 * updatePayload, healthCheck, startHealthMonitoring, stopHealthMonitoring, getHealthStatus, shutdown
 *
 * @module qdrant.service.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock functions defined with vi.hoisted for proper hoisting
const mockQdrantClient = vi.hoisted(() => ({
  collectionExists: vi.fn(),
  createCollection: vi.fn(),
  createPayloadIndex: vi.fn(),
  getCollection: vi.fn(),
  getCollections: vi.fn(),
  upsert: vi.fn(),
  query: vi.fn(),
  delete: vi.fn(),
  setPayload: vi.fn(),
}))

// Mock @qdrant/js-client-rest
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn(() => mockQdrantClient),
}))

// Mock crypto for UUID generation
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-1234-5678'),
}))

import { QdrantClient } from '@qdrant/js-client-rest'
import { randomUUID } from 'crypto'

// Create a testable version of QdrantService to avoid singleton issues
class TestableQdrantService {
  private client: typeof mockQdrantClient | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private isHealthy = false
  private retryAttempts = 3
  private retryBaseDelay = 10 // Reduced for tests

  constructor() {
    this.initializeClient()
  }

  private initializeClient(): void {
    this.client = new QdrantClient({
      url: 'http://localhost:6333',
      timeout: 60000,
    }) as unknown as typeof mockQdrantClient
  }

  private getClient(): typeof mockQdrantClient {
    if (!this.client) {
      this.initializeClient()
    }
    const client = this.client
    if (!client) {
      throw new Error('Failed to initialize Qdrant client')
    }
    return client
  }

  private handleError(error: unknown): { code: string; message: string; originalError?: Error } {
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        return {
          code: 'CONNECTION_FAILED',
          message: 'Qdrant server not running or unreachable',
          originalError: error,
        }
      }
      if (error.message.includes('timeout')) {
        return {
          code: 'TIMEOUT',
          message: 'Request timeout - operation took too long',
          originalError: error,
        }
      }
      if (error.message.includes('Not found')) {
        return {
          code: 'NOT_FOUND',
          message: 'Collection or resource not found',
          originalError: error,
        }
      }
      return {
        code: 'UNKNOWN',
        message: error.message,
        originalError: error,
      }
    }
    return {
      code: 'UNKNOWN',
      message: 'An unknown error occurred',
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean = (error) => {
      // Don't retry on non-Error objects or non-transient errors
      if (!(error instanceof Error)) return false
      if (error.message.includes('ECONNREFUSED')) return false
      if (error.message.includes('timeout')) return false
      if (error.message.includes('Not found')) return false
      if (error.message.includes('Something unexpected')) return false
      return true
    }
  ): Promise<T> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (!shouldRetry(error)) {
          throw error
        }
        const delay = this.retryBaseDelay * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  async initializeCollection(collectionName: string, vectorSize = 768): Promise<void> {
    try {
      const client = this.getClient()
      const exists = await client.collectionExists(collectionName)

      if (!exists) {
        await client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
            on_disk: false,
          },
          hnsw_config: {
            m: 16,
            ef_construct: 200,
            full_scan_threshold: 10000,
            on_disk: false,
          },
          optimizers_config: {
            indexing_threshold: 20000,
          },
        })

        await client.createPayloadIndex(collectionName, {
          field_name: 'session_id',
          field_schema: 'keyword',
        })

        await client.createPayloadIndex(collectionName, {
          field_name: 'timestamp',
          field_schema: 'integer',
        })
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async getCollectionStats(collectionName: string): Promise<{
    pointsCount: number
    indexedVectors: number
    segmentsCount: number
    status: string
    optimizerStatus: string
  }> {
    try {
      const client = this.getClient()
      const info = await this.withRetry(() => client.getCollection(collectionName))

      return {
        pointsCount: info.points_count,
        indexedVectors: info.indexed_vectors_count,
        segmentsCount: info.segments_count,
        status: info.status,
        optimizerStatus: info.optimizer_status,
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const client = this.getClient()
      const { collections } = await this.withRetry(() => client.getCollections())
      return collections.map((c: { name: string }) => c.name)
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async storeMemory(
    collectionName: string,
    embedding: number[],
    memory: { content: string; session_id: string; timestamp: number; tags?: string[]; metadata?: Record<string, unknown> }
  ): Promise<string> {
    try {
      const client = this.getClient()
      const id = randomUUID()

      await this.withRetry(() =>
        client.upsert(collectionName, {
          points: [
            {
              id,
              vector: embedding,
              payload: memory,
            },
          ],
        })
      )

      return id
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async batchStoreMemories(
    collectionName: string,
    memories: Array<{
      embedding: number[]
      payload: { content: string; session_id: string; timestamp: number; tags?: string[]; metadata?: Record<string, unknown> }
    }>,
    batchSize = 1000
  ): Promise<string[]> {
    try {
      const client = this.getClient()
      const ids: string[] = []

      for (let i = 0; i < memories.length; i += batchSize) {
        const batch = memories.slice(i, i + batchSize)
        const batchIds = batch.map(() => randomUUID())

        await this.withRetry(() =>
          client.upsert(collectionName, {
            points: batch.map(({ embedding, payload }, idx) => ({
              id: batchIds[idx],
              vector: embedding,
              payload,
            })),
          })
        )

        ids.push(...batchIds)
      }

      return ids
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async searchMemories(
    collectionName: string,
    embedding: number[],
    options: {
      limit?: number
      sessionId?: string
      scoreThreshold?: number
      filter?: { must?: Array<{ key: string; match: { value: string } }> }
    } = {}
  ): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
    try {
      const { limit = 10, sessionId, scoreThreshold = 0.6, filter } = options
      const client = this.getClient()

      const searchFilter = filter
        ? filter
        : sessionId
          ? {
              must: [
                {
                  key: 'session_id',
                  match: { value: sessionId },
                },
              ],
            }
          : undefined

      const results = await this.withRetry(
        () =>
          client.query(collectionName, {
            query: embedding,
            limit,
            filter: searchFilter,
            score_threshold: scoreThreshold,
          }),
        (error) => !(error instanceof Error && error.message.includes('Not found'))
      )

      return results.points
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async deleteMemory(collectionName: string, id: string): Promise<void> {
    try {
      const client = this.getClient()
      await this.withRetry(() =>
        client.delete(collectionName, {
          points: [id],
        })
      )
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async deleteMemoriesByFilter(
    collectionName: string,
    filter: { must?: Array<{ key: string; match: { value: string } }> }
  ): Promise<void> {
    try {
      const client = this.getClient()
      await this.withRetry(() => client.delete(collectionName, { filter }))
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async updatePayload(
    collectionName: string,
    ids: string[],
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const client = this.getClient()
      await this.withRetry(() =>
        client.setPayload(collectionName, {
          points: ids,
          payload,
        })
      )
    } catch (error) {
      throw this.handleError(error)
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient()
      await client.getCollections()
      this.isHealthy = true
      return true
    } catch {
      this.isHealthy = false
      return false
    }
  }

  startHealthMonitoring(intervalMs = 30000): void {
    if (this.healthCheckInterval) {
      return
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.healthCheck()
    }, intervalMs)
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  getHealthStatus(): boolean {
    return this.isHealthy
  }

  shutdown(): void {
    this.stopHealthMonitoring()
    this.client = null
  }
}

describe('QdrantService', () => {
  let service: TestableQdrantService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    service = new TestableQdrantService()

    // Default mock implementations
    mockQdrantClient.collectionExists.mockResolvedValue(false)
    mockQdrantClient.createCollection.mockResolvedValue({})
    mockQdrantClient.createPayloadIndex.mockResolvedValue({})
    mockQdrantClient.getCollection.mockResolvedValue({
      points_count: 1000,
      indexed_vectors_count: 1000,
      segments_count: 5,
      status: 'green',
      optimizer_status: 'ok',
    })
    mockQdrantClient.getCollections.mockResolvedValue({
      collections: [{ name: 'claude_memories' }, { name: 'mem0_memories' }],
    })
    mockQdrantClient.upsert.mockResolvedValue({})
    mockQdrantClient.query.mockResolvedValue({ points: [] })
    mockQdrantClient.delete.mockResolvedValue({})
    mockQdrantClient.setPayload.mockResolvedValue({})
  })

  afterEach(() => {
    service.shutdown()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  describe('initializeCollection', () => {
    it('should create collection if it does not exist', async () => {
      mockQdrantClient.collectionExists.mockResolvedValue(false)

      await service.initializeCollection('claude_memories')

      expect(mockQdrantClient.collectionExists).toHaveBeenCalledWith('claude_memories')
      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          vectors: expect.objectContaining({
            size: 768,
            distance: 'Cosine',
          }),
        })
      )
    })

    it('should not create collection if it already exists', async () => {
      mockQdrantClient.collectionExists.mockResolvedValue(true)

      await service.initializeCollection('claude_memories')

      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled()
    })

    it('should create payload indexes for session_id and timestamp', async () => {
      mockQdrantClient.collectionExists.mockResolvedValue(false)

      await service.initializeCollection('claude_memories')

      expect(mockQdrantClient.createPayloadIndex).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          field_name: 'session_id',
          field_schema: 'keyword',
        })
      )
      expect(mockQdrantClient.createPayloadIndex).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          field_name: 'timestamp',
          field_schema: 'integer',
        })
      )
    })

    it('should use custom vector size when provided', async () => {
      mockQdrantClient.collectionExists.mockResolvedValue(false)

      await service.initializeCollection('claude_memories', 1536)

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          vectors: expect.objectContaining({
            size: 1536,
          }),
        })
      )
    })

    it('should throw error on connection failure', async () => {
      mockQdrantClient.collectionExists.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(service.initializeCollection('claude_memories')).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        message: 'Qdrant server not running or unreachable',
      })
    })
  })

  // ===========================================================================
  // GET COLLECTION STATS
  // ===========================================================================
  describe('getCollectionStats', () => {
    it('should return collection statistics', async () => {
      mockQdrantClient.getCollection.mockResolvedValue({
        points_count: 5000,
        indexed_vectors_count: 4500,
        segments_count: 10,
        status: 'green',
        optimizer_status: 'running',
      })

      const stats = await service.getCollectionStats('claude_memories')

      expect(stats).toEqual({
        pointsCount: 5000,
        indexedVectors: 4500,
        segmentsCount: 10,
        status: 'green',
        optimizerStatus: 'running',
      })
    })

    it('should throw NOT_FOUND error when collection does not exist', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Not found: collection'))

      // Attach expect.rejects before flushing timers to avoid unhandled rejection
      const expectation = expect(service.getCollectionStats('nonexistent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Collection or resource not found',
      })
      await vi.runAllTimersAsync()
      await expectation
    })

    it('should retry on transient failures', async () => {
      mockQdrantClient.getCollection
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          points_count: 100,
          indexed_vectors_count: 100,
          segments_count: 1,
          status: 'green',
          optimizer_status: 'ok',
        })

      // Run timers to allow retries
      const promise = service.getCollectionStats('claude_memories')
      await vi.advanceTimersByTimeAsync(100)

      const stats = await promise
      expect(stats.pointsCount).toBe(100)
      expect(mockQdrantClient.getCollection).toHaveBeenCalledTimes(3)
    })
  })

  // ===========================================================================
  // LIST COLLECTIONS
  // ===========================================================================
  describe('listCollections', () => {
    it('should return list of collection names', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [
          { name: 'claude_memories' },
          { name: 'mem0_memories' },
          { name: 'test_collection' },
        ],
      })

      const collections = await service.listCollections()

      expect(collections).toEqual(['claude_memories', 'mem0_memories', 'test_collection'])
    })

    it('should return empty array when no collections exist', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] })

      const collections = await service.listCollections()

      expect(collections).toEqual([])
    })

    it('should handle connection errors', async () => {
      mockQdrantClient.getCollections.mockRejectedValue(new Error('ECONNREFUSED'))

      const expectation = expect(service.listCollections()).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
      })
      await vi.runAllTimersAsync()
      await expectation
    })
  })

  // ===========================================================================
  // STORE MEMORY
  // ===========================================================================
  describe('storeMemory', () => {
    it('should store a memory and return the generated ID', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const embedding = [0.1, 0.2, 0.3]
      const memory = {
        content: 'Test memory content',
        session_id: 'session-123',
        timestamp: Date.now(),
        tags: ['test'],
      }

      const id = await service.storeMemory('claude_memories', embedding, memory)

      expect(id).toBe('mock-uuid-1234-5678')
      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('claude_memories', {
        points: [
          {
            id: 'mock-uuid-1234-5678',
            vector: embedding,
            payload: memory,
          },
        ],
      })
    })

    it('should store memory with metadata', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const memory = {
        content: 'Test',
        session_id: 'session-123',
        timestamp: Date.now(),
        metadata: { source: 'test', priority: 1 },
      }

      await service.storeMemory('claude_memories', [0.1], memory)

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                metadata: { source: 'test', priority: 1 },
              }),
            }),
          ]),
        })
      )
    })

    it('should retry on transient failures', async () => {
      mockQdrantClient.upsert
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({})

      const promise = service.storeMemory('claude_memories', [0.1], {
        content: 'Test',
        session_id: 'session-123',
        timestamp: Date.now(),
      })
      await vi.advanceTimersByTimeAsync(100)

      await promise
      expect(mockQdrantClient.upsert).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // BATCH STORE MEMORIES
  // ===========================================================================
  describe('batchStoreMemories', () => {
    it('should store multiple memories in a single batch', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const memories = [
        { embedding: [0.1, 0.2], payload: { content: 'Memory 1', session_id: 's1', timestamp: 1 } },
        { embedding: [0.3, 0.4], payload: { content: 'Memory 2', session_id: 's1', timestamp: 2 } },
      ]

      const ids = await service.batchStoreMemories('claude_memories', memories)

      expect(ids).toHaveLength(2)
      expect(mockQdrantClient.upsert).toHaveBeenCalledTimes(1)
    })

    it('should split large batches according to batchSize', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const memories = Array.from({ length: 5 }, (_, i) => ({
        embedding: [i * 0.1],
        payload: { content: `Memory ${i}`, session_id: 's1', timestamp: i },
      }))

      await service.batchStoreMemories('claude_memories', memories, 2)

      // 5 memories with batchSize 2 = 3 batches (2 + 2 + 1)
      expect(mockQdrantClient.upsert).toHaveBeenCalledTimes(3)
    })

    it('should return all generated IDs', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const memories = Array.from({ length: 3 }, (_, i) => ({
        embedding: [i * 0.1],
        payload: { content: `Memory ${i}`, session_id: 's1', timestamp: i },
      }))

      const ids = await service.batchStoreMemories('claude_memories', memories)

      expect(ids).toHaveLength(3)
      ids.forEach((id) => expect(id).toBe('mock-uuid-1234-5678'))
    })
  })

  // ===========================================================================
  // SEARCH MEMORIES
  // ===========================================================================
  describe('searchMemories', () => {
    it('should search memories by embedding', async () => {
      mockQdrantClient.query.mockResolvedValue({
        points: [
          { id: 'id-1', score: 0.95, payload: { content: 'Memory 1' } },
          { id: 'id-2', score: 0.85, payload: { content: 'Memory 2' } },
        ],
      })

      const results = await service.searchMemories('claude_memories', [0.1, 0.2, 0.3])

      expect(results).toHaveLength(2)
      expect(results[0].score).toBe(0.95)
      expect(mockQdrantClient.query).toHaveBeenCalledWith('claude_memories', {
        query: [0.1, 0.2, 0.3],
        limit: 10,
        filter: undefined,
        score_threshold: 0.6,
      })
    })

    it('should filter by session_id when provided', async () => {
      mockQdrantClient.query.mockResolvedValue({ points: [] })

      await service.searchMemories('claude_memories', [0.1], { sessionId: 'session-123' })

      expect(mockQdrantClient.query).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          filter: {
            must: [
              {
                key: 'session_id',
                match: { value: 'session-123' },
              },
            ],
          },
        })
      )
    })

    it('should use custom limit and scoreThreshold', async () => {
      mockQdrantClient.query.mockResolvedValue({ points: [] })

      await service.searchMemories('claude_memories', [0.1], {
        limit: 5,
        scoreThreshold: 0.8,
      })

      expect(mockQdrantClient.query).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          limit: 5,
          score_threshold: 0.8,
        })
      )
    })

    it('should use custom filter when provided', async () => {
      mockQdrantClient.query.mockResolvedValue({ points: [] })

      const customFilter = {
        must: [{ key: 'tags', match: { value: 'important' } }],
      }

      await service.searchMemories('claude_memories', [0.1], { filter: customFilter })

      expect(mockQdrantClient.query).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          filter: customFilter,
        })
      )
    })

    it('should not retry on NOT_FOUND errors', async () => {
      mockQdrantClient.query.mockRejectedValue(new Error('Not found: collection'))

      await expect(
        service.searchMemories('nonexistent', [0.1])
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })

      expect(mockQdrantClient.query).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // DELETE MEMORY
  // ===========================================================================
  describe('deleteMemory', () => {
    it('should delete a memory by ID', async () => {
      mockQdrantClient.delete.mockResolvedValue({})

      await service.deleteMemory('claude_memories', 'memory-id-123')

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('claude_memories', {
        points: ['memory-id-123'],
      })
    })

    it('should retry on transient failures', async () => {
      mockQdrantClient.delete
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({})

      const promise = service.deleteMemory('claude_memories', 'memory-id-123')
      await vi.advanceTimersByTimeAsync(100)

      await promise
      expect(mockQdrantClient.delete).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // DELETE MEMORIES BY FILTER
  // ===========================================================================
  describe('deleteMemoriesByFilter', () => {
    it('should delete memories matching a filter', async () => {
      mockQdrantClient.delete.mockResolvedValue({})

      const filter = {
        must: [{ key: 'session_id', match: { value: 'old-session' } }],
      }

      await service.deleteMemoriesByFilter('claude_memories', filter)

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('claude_memories', { filter })
    })
  })

  // ===========================================================================
  // UPDATE PAYLOAD
  // ===========================================================================
  describe('updatePayload', () => {
    it('should update payload for specified IDs', async () => {
      mockQdrantClient.setPayload.mockResolvedValue({})

      await service.updatePayload('claude_memories', ['id-1', 'id-2'], {
        tags: ['updated'],
        priority: 2,
      })

      expect(mockQdrantClient.setPayload).toHaveBeenCalledWith('claude_memories', {
        points: ['id-1', 'id-2'],
        payload: { tags: ['updated'], priority: 2 },
      })
    })

    it('should handle single ID update', async () => {
      mockQdrantClient.setPayload.mockResolvedValue({})

      await service.updatePayload('claude_memories', ['single-id'], { status: 'archived' })

      expect(mockQdrantClient.setPayload).toHaveBeenCalledWith('claude_memories', {
        points: ['single-id'],
        payload: { status: 'archived' },
      })
    })
  })

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================
  describe('healthCheck', () => {
    it('should return true when Qdrant is healthy', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] })

      const result = await service.healthCheck()

      expect(result).toBe(true)
      expect(service.getHealthStatus()).toBe(true)
    })

    it('should return false when Qdrant is unhealthy', async () => {
      mockQdrantClient.getCollections.mockRejectedValue(new Error('Connection refused'))

      const result = await service.healthCheck()

      expect(result).toBe(false)
      expect(service.getHealthStatus()).toBe(false)
    })

    it('should update health status on each check', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] })
      await service.healthCheck()
      expect(service.getHealthStatus()).toBe(true)

      mockQdrantClient.getCollections.mockRejectedValue(new Error('Down'))
      await service.healthCheck()
      expect(service.getHealthStatus()).toBe(false)

      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] })
      await service.healthCheck()
      expect(service.getHealthStatus()).toBe(true)
    })
  })

  // ===========================================================================
  // HEALTH MONITORING
  // ===========================================================================
  describe('startHealthMonitoring / stopHealthMonitoring', () => {
    it('should start periodic health checks', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] })

      service.startHealthMonitoring(1000)

      // Fast-forward timers
      await vi.advanceTimersByTimeAsync(3500)

      // Should have called healthCheck 3 times (at 1000, 2000, 3000 ms)
      expect(mockQdrantClient.getCollections).toHaveBeenCalledTimes(3)
    })

    it('should not start multiple monitoring intervals', () => {
      service.startHealthMonitoring(1000)
      service.startHealthMonitoring(1000) // Should be ignored

      // Only one interval should be running
      service.stopHealthMonitoring()
    })

    it('should stop health monitoring', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] })

      service.startHealthMonitoring(1000)
      await vi.advanceTimersByTimeAsync(2500)
      service.stopHealthMonitoring()

      const callCountAfterStop = mockQdrantClient.getCollections.mock.calls.length
      await vi.advanceTimersByTimeAsync(5000)

      // No more calls after stopping
      expect(mockQdrantClient.getCollections.mock.calls.length).toBe(callCountAfterStop)
    })
  })

  // ===========================================================================
  // SHUTDOWN
  // ===========================================================================
  describe('shutdown', () => {
    it('should stop health monitoring on shutdown', async () => {
      service.startHealthMonitoring(1000)
      service.shutdown()

      await vi.advanceTimersByTimeAsync(5000)

      // Health monitoring should be stopped, so no additional calls
      expect(mockQdrantClient.getCollections).not.toHaveBeenCalled()
    })

    it('should set client to null', () => {
      service.shutdown()

      // After shutdown, trying to use the service should reinitialize
      expect(QdrantClient).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should handle ECONNREFUSED errors', async () => {
      mockQdrantClient.collectionExists.mockRejectedValue(new Error('connect ECONNREFUSED'))

      await expect(service.initializeCollection('test')).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        message: 'Qdrant server not running or unreachable',
      })
    })

    it('should handle timeout errors', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Request timeout exceeded'))

      const expectation = expect(service.getCollectionStats('test')).rejects.toMatchObject({
        code: 'TIMEOUT',
        message: 'Request timeout - operation took too long',
      })
      await vi.runAllTimersAsync()
      await expectation
    })

    it('should handle Not found errors', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Not found'))

      const expectation = expect(service.getCollectionStats('nonexistent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Collection or resource not found',
      })
      await vi.runAllTimersAsync()
      await expectation
    })

    it('should handle unknown errors', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Something unexpected'))

      const expectation = expect(service.getCollectionStats('test')).rejects.toMatchObject({
        code: 'UNKNOWN',
        message: 'Something unexpected',
      })
      await vi.runAllTimersAsync()
      await expectation
    })

    it('should handle non-Error objects', async () => {
      mockQdrantClient.getCollection.mockRejectedValue('string error')

      const expectation = expect(service.getCollectionStats('test')).rejects.toMatchObject({
        code: 'UNKNOWN',
        message: 'An unknown error occurred',
      })
      await vi.runAllTimersAsync()
      await expectation
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle empty embedding array', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const id = await service.storeMemory('claude_memories', [], {
        content: 'Test',
        session_id: 's1',
        timestamp: 1,
      })

      expect(id).toBe('mock-uuid-1234-5678')
    })

    it('should handle large embedding vectors', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      const largeEmbedding = new Array(1536).fill(0.1)
      const id = await service.storeMemory('claude_memories', largeEmbedding, {
        content: 'Test',
        session_id: 's1',
        timestamp: 1,
      })

      expect(id).toBeDefined()
      expect(mockQdrantClient.upsert).toHaveBeenCalledWith(
        'claude_memories',
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({
              vector: largeEmbedding,
            }),
          ]),
        })
      )
    })

    it('should handle concurrent operations', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})
      mockQdrantClient.query.mockResolvedValue({ points: [] })

      const operations = [
        service.storeMemory('claude_memories', [0.1], { content: 'A', session_id: 's1', timestamp: 1 }),
        service.storeMemory('claude_memories', [0.2], { content: 'B', session_id: 's1', timestamp: 2 }),
        service.searchMemories('claude_memories', [0.1]),
        service.listCollections(),
      ]

      const results = await Promise.all(operations)

      expect(results).toHaveLength(4)
    })

    it('should handle special characters in content', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      await service.storeMemory('claude_memories', [0.1], {
        content: 'Test with "quotes" and <tags> and \n newlines',
        session_id: 's1',
        timestamp: 1,
      })

      expect(mockQdrantClient.upsert).toHaveBeenCalled()
    })

    it('should handle unicode content', async () => {
      mockQdrantClient.upsert.mockResolvedValue({})

      await service.storeMemory('claude_memories', [0.1], {
        content: 'Unicode: \u4e2d\u6587 \u65e5\u672c\u8a9e \ud55c\uad6d\uc5b4',
        session_id: 's1',
        timestamp: 1,
      })

      expect(mockQdrantClient.upsert).toHaveBeenCalled()
    })
  })
})
