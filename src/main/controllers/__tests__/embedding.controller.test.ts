/**
 * Embedding Controller Tests
 *
 * Comprehensive tests for the embedding tRPC controller.
 * Tests all procedures for the auto-embedding pipeline.
 *
 * @module embedding.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { embeddingRouter } from '../embedding.controller'
import type {
  EmbeddingManagerStatus,
  PipelineMetrics,
  SearchResult,
  DeadLetterItem,
  CacheStats,
} from '../../services/embeddings'

// Mock the embedding manager initialization
const mockEmbeddingManager = {
  getStatus: vi.fn(),
  getMetrics: vi.fn(),
  getCacheStats: vi.fn(),
  getVectorStoreStats: vi.fn(),
  resetMetrics: vi.fn(),
  startAutoEmbedding: vi.fn(),
  stopAutoEmbedding: vi.fn(),
  embed: vi.fn(),
  embedAndStore: vi.fn(),
  search: vi.fn(),
  warmupModel: vi.fn(),
  unloadModel: vi.fn(),
  updateOllamaConfig: vi.fn(),
  pruneCache: vi.fn(),
  clearCache: vi.fn(),
  getDeadLetterQueue: vi.fn(),
  retryDeadLetterQueue: vi.fn(),
  clearDeadLetterQueue: vi.fn(),
  processSessionFile: vi.fn(),
  resetSessionPosition: vi.fn(),
  resetAllSessionPositions: vi.fn(),
  deleteSessionEmbeddings: vi.fn(),
}

vi.mock('../../services/embeddings', () => ({
  getEmbeddingManager: vi.fn(() => mockEmbeddingManager),
  initializeEmbeddingManager: vi.fn(() => Promise.resolve(mockEmbeddingManager)),
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => embeddingRouter.createCaller({})

describe('embedding.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // STATUS PROCEDURE
  // ===========================================================================
  describe('status', () => {
    it('should return embedding system status', async () => {
      const mockStatus: EmbeddingManagerStatus = {
        initialized: true,
        autoEmbeddingActive: true,
        watchedSessions: 5,
        pipelineStatus: {
          enabled: true,
          processing: false,
          queueDepth: 10,
          pendingOperations: 2,
          ollama: {
            healthy: true,
            modelLoaded: true,
            model: 'mxbai-embed-large',
            lastCheck: Date.now(),
          },
          pgvectorConnected: true,
          qdrantConnected: true,
          lastCheckpoint: Date.now(),
          circuitBreakerOpen: false,
        },
      }
      mockEmbeddingManager.getStatus.mockReturnValue(mockStatus)

      const result = await caller.status()

      expect(result).toEqual(mockStatus)
      expect(result.initialized).toBe(true)
      expect(result.autoEmbeddingActive).toBe(true)
    })

    it('should return status when system not initialized', async () => {
      const mockStatus: EmbeddingManagerStatus = {
        initialized: false,
        autoEmbeddingActive: false,
        watchedSessions: 0,
        pipelineStatus: {
          enabled: false,
          processing: false,
          queueDepth: 0,
          pendingOperations: 0,
          ollama: {
            healthy: false,
            modelLoaded: false,
            model: 'mxbai-embed-large',
            lastCheck: 0,
            error: 'Not connected',
          },
          pgvectorConnected: false,
          qdrantConnected: false,
          lastCheckpoint: 0,
          circuitBreakerOpen: false,
        },
      }
      mockEmbeddingManager.getStatus.mockReturnValue(mockStatus)

      const result = await caller.status()

      expect(result.initialized).toBe(false)
      expect(result.pipelineStatus.ollama.healthy).toBe(false)
    })
  })

  // ===========================================================================
  // METRICS PROCEDURE
  // ===========================================================================
  describe('metrics', () => {
    it('should return pipeline metrics', async () => {
      const mockMetrics: PipelineMetrics = {
        latency: { p50: 50, p95: 100, p99: 150 },
        embeddingsPerSecond: 10,
        embeddingsPerMinute: 600,
        queueDepth: 5,
        pendingOperations: 2,
        successRate: 0.99,
        errorRate: 0.01,
        cacheHitRate: 0.75,
        totalProcessed: 1000,
        totalFailed: 10,
        totalCached: 750,
        timestamp: Date.now(),
      }
      mockEmbeddingManager.getMetrics.mockReturnValue(mockMetrics)

      const result = await caller.metrics()

      expect(result).toEqual(mockMetrics)
      expect(result.successRate).toBe(0.99)
      expect(result.cacheHitRate).toBe(0.75)
    })

    it('should return zero metrics when pipeline is idle', async () => {
      const mockMetrics: PipelineMetrics = {
        latency: { p50: 0, p95: 0, p99: 0 },
        embeddingsPerSecond: 0,
        embeddingsPerMinute: 0,
        queueDepth: 0,
        pendingOperations: 0,
        successRate: 1,
        errorRate: 0,
        cacheHitRate: 0,
        totalProcessed: 0,
        totalFailed: 0,
        totalCached: 0,
        timestamp: Date.now(),
      }
      mockEmbeddingManager.getMetrics.mockReturnValue(mockMetrics)

      const result = await caller.metrics()

      expect(result.totalProcessed).toBe(0)
      expect(result.queueDepth).toBe(0)
    })
  })

  // ===========================================================================
  // CACHE STATS PROCEDURE
  // ===========================================================================
  describe('cacheStats', () => {
    it('should return cache statistics', async () => {
      const mockStats: CacheStats = {
        size: 500,
        hitRate: 0.8,
        missRate: 0.2,
        avgLookupTime: 2.5,
        memoryUsage: 50000000,
        oldestEntry: Date.now() - 86400000,
        newestEntry: Date.now(),
      }
      mockEmbeddingManager.getCacheStats.mockReturnValue(mockStats)

      const result = await caller.cacheStats()

      expect(result).toEqual(mockStats)
      expect(result.hitRate).toBe(0.8)
    })
  })

  // ===========================================================================
  // VECTOR STORE STATS PROCEDURE
  // ===========================================================================
  describe('vectorStoreStats', () => {
    it('should return vector store statistics', async () => {
      const mockStats = {
        pgvector: { count: 1000, dimensions: 1024, indexType: 'ivfflat' },
        qdrant: { collections: ['claude_memories'], totalPoints: 500 },
      }
      mockEmbeddingManager.getVectorStoreStats.mockResolvedValue(mockStats)

      const result = await caller.vectorStoreStats()

      expect(result).toEqual(mockStats)
    })
  })

  // ===========================================================================
  // RESET METRICS PROCEDURE
  // ===========================================================================
  describe('resetMetrics', () => {
    it('should reset pipeline metrics', async () => {
      mockEmbeddingManager.resetMetrics.mockImplementation(() => {})

      await caller.resetMetrics()

      expect(mockEmbeddingManager.resetMetrics).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // START AUTO EMBED PROCEDURE
  // ===========================================================================
  describe('startAutoEmbed', () => {
    it('should start auto-embedding successfully', async () => {
      mockEmbeddingManager.startAutoEmbedding.mockReturnValue(true)

      const result = await caller.startAutoEmbed()

      expect(result).toBe(true)
      expect(mockEmbeddingManager.startAutoEmbedding).toHaveBeenCalledTimes(1)
    })

    it('should return false when start fails', async () => {
      mockEmbeddingManager.startAutoEmbedding.mockReturnValue(false)

      const result = await caller.startAutoEmbed()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // STOP AUTO EMBED PROCEDURE
  // ===========================================================================
  describe('stopAutoEmbed', () => {
    it('should stop auto-embedding', async () => {
      mockEmbeddingManager.stopAutoEmbedding.mockResolvedValue(undefined)

      await caller.stopAutoEmbed()

      expect(mockEmbeddingManager.stopAutoEmbedding).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // EMBED PROCEDURE
  // ===========================================================================
  describe('embed', () => {
    it('should embed text and return vector', async () => {
      const mockEmbedding = new Array(1024).fill(0.1)
      mockEmbeddingManager.embed.mockResolvedValue({
        embedding: mockEmbedding,
        model: 'mxbai-embed-large',
        processingTime: 50,
        cached: false,
      })

      const result = await caller.embed({ text: 'Hello world' })

      expect(result).toEqual(mockEmbedding)
      expect(mockEmbeddingManager.embed).toHaveBeenCalledWith('Hello world')
    })

    it('should return null when embedding fails', async () => {
      mockEmbeddingManager.embed.mockResolvedValue(null)

      const result = await caller.embed({ text: 'Hello world' })

      expect(result).toBeNull()
    })

    it('should reject empty text', async () => {
      await expect(caller.embed({ text: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // EMBED AND STORE PROCEDURE
  // ===========================================================================
  describe('embedAndStore', () => {
    it('should embed and store content', async () => {
      mockEmbeddingManager.embedAndStore.mockResolvedValue(1)

      const result = await caller.embedAndStore({
        content: 'Test content to embed',
        contentType: 'learning',
        metadata: {
          sourceId: 'test-123',
          sessionId: 'session-abc',
        },
      })

      expect(result).toBe(1)
      expect(mockEmbeddingManager.embedAndStore).toHaveBeenCalledWith(
        'Test content to embed',
        'learning',
        expect.objectContaining({ sourceId: 'test-123' })
      )
    })

    it('should handle different content types', async () => {
      mockEmbeddingManager.embedAndStore.mockResolvedValue(1)

      const contentTypes = ['code', 'conversation', 'tool_result', 'learning', 'documentation'] as const

      for (const contentType of contentTypes) {
        await caller.embedAndStore({
          content: 'Test content',
          contentType,
        })
      }

      expect(mockEmbeddingManager.embedAndStore).toHaveBeenCalledTimes(5)
    })

    it('should reject empty content', async () => {
      await expect(
        caller.embedAndStore({ content: '', contentType: 'code' })
      ).rejects.toThrow()
    })

    it('should reject invalid content type', async () => {
      await expect(
        caller.embedAndStore({
          content: 'Test',
          contentType: 'invalid' as never,
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SEARCH PROCEDURE
  // ===========================================================================
  describe('search', () => {
    it('should search for similar content', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'r1',
          score: 0.95,
          content: 'Similar content 1',
          metadata: {
            sourceId: 's1',
            sourceType: 'learning',
            chunkIndex: 0,
            totalChunks: 1,
            timestamp: Date.now(),
          },
        },
        {
          id: 'r2',
          score: 0.85,
          metadata: {
            sourceId: 's2',
            sourceType: 'code',
            chunkIndex: 0,
            totalChunks: 1,
            timestamp: Date.now(),
          },
        },
      ]
      mockEmbeddingManager.search.mockResolvedValue(mockResults)

      const result = await caller.search({
        query: 'test query',
        options: { limit: 10 },
      })

      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(0.95)
    })

    it('should search with all options', async () => {
      mockEmbeddingManager.search.mockResolvedValue([])

      await caller.search({
        query: 'test',
        options: {
          limit: 20,
          threshold: 0.5,
          sourceType: 'code',
          sessionId: 'session-123',
          projectPath: '/path/to/project',
          includeContent: false,
        },
      })

      expect(mockEmbeddingManager.search).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          limit: 20,
          threshold: 0.5,
          sourceType: 'code',
          sessionId: 'session-123',
        })
      )
    })

    it('should reject empty query', async () => {
      await expect(caller.search({ query: '' })).rejects.toThrow()
    })

    it('should use default options when not provided', async () => {
      mockEmbeddingManager.search.mockResolvedValue([])

      await caller.search({ query: 'test' })

      expect(mockEmbeddingManager.search).toHaveBeenCalledWith('test', undefined)
    })
  })

  // ===========================================================================
  // WARMUP MODEL PROCEDURE
  // ===========================================================================
  describe('warmupModel', () => {
    it('should warmup model successfully', async () => {
      mockEmbeddingManager.warmupModel.mockResolvedValue(true)

      const result = await caller.warmupModel()

      expect(result).toBe(true)
    })

    it('should return false when warmup fails', async () => {
      mockEmbeddingManager.warmupModel.mockResolvedValue(false)

      const result = await caller.warmupModel()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // UNLOAD MODEL PROCEDURE
  // ===========================================================================
  describe('unloadModel', () => {
    it('should unload model successfully', async () => {
      mockEmbeddingManager.unloadModel.mockResolvedValue(true)

      const result = await caller.unloadModel()

      expect(result).toBe(true)
    })

    it('should return false when unload fails', async () => {
      mockEmbeddingManager.unloadModel.mockResolvedValue(false)

      const result = await caller.unloadModel()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // UPDATE OLLAMA CONFIG PROCEDURE
  // ===========================================================================
  describe('updateOllamaConfig', () => {
    it('should update Ollama configuration', async () => {
      mockEmbeddingManager.updateOllamaConfig.mockResolvedValue(undefined)

      await caller.updateOllamaConfig({
        model: 'nomic-embed-text',
        dimensions: 768,
        batchSize: 32,
      })

      expect(mockEmbeddingManager.updateOllamaConfig).toHaveBeenCalledWith({
        model: 'nomic-embed-text',
        dimensions: 768,
        batchSize: 32,
      })
    })

    it('should update partial config', async () => {
      mockEmbeddingManager.updateOllamaConfig.mockResolvedValue(undefined)

      await caller.updateOllamaConfig({
        keepAlive: '5m',
      })

      expect(mockEmbeddingManager.updateOllamaConfig).toHaveBeenCalledWith({
        keepAlive: '5m',
      })
    })

    it('should reject invalid baseUrl', async () => {
      await expect(
        caller.updateOllamaConfig({
          baseUrl: 'not-a-valid-url',
        })
      ).rejects.toThrow()
    })

    it('should accept valid baseUrl', async () => {
      mockEmbeddingManager.updateOllamaConfig.mockResolvedValue(undefined)

      await caller.updateOllamaConfig({
        baseUrl: 'http://localhost:11434',
      })

      expect(mockEmbeddingManager.updateOllamaConfig).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // PRUNE CACHE PROCEDURE
  // ===========================================================================
  describe('pruneCache', () => {
    it('should prune cache with parameters', async () => {
      mockEmbeddingManager.pruneCache.mockResolvedValue(50)

      const result = await caller.pruneCache({
        maxEntries: 1000,
        maxAge: 86400000,
      })

      expect(result).toBe(50)
      expect(mockEmbeddingManager.pruneCache).toHaveBeenCalledWith(1000, 86400000)
    })

    it('should prune cache with default parameters', async () => {
      mockEmbeddingManager.pruneCache.mockResolvedValue(0)

      const result = await caller.pruneCache({})

      expect(result).toBe(0)
      expect(mockEmbeddingManager.pruneCache).toHaveBeenCalledWith(undefined, undefined)
    })

    it('should reject maxEntries less than 1', async () => {
      await expect(caller.pruneCache({ maxEntries: 0 })).rejects.toThrow()
    })

    it('should reject maxAge less than 1', async () => {
      await expect(caller.pruneCache({ maxAge: 0 })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CLEAR CACHE PROCEDURE
  // ===========================================================================
  describe('clearCache', () => {
    it('should clear entire cache', async () => {
      mockEmbeddingManager.clearCache.mockResolvedValue(100)

      const result = await caller.clearCache()

      expect(result).toBe(100)
      expect(mockEmbeddingManager.clearCache).toHaveBeenCalledTimes(1)
    })

    it('should return 0 when cache is empty', async () => {
      mockEmbeddingManager.clearCache.mockResolvedValue(0)

      const result = await caller.clearCache()

      expect(result).toBe(0)
    })
  })

  // ===========================================================================
  // DEAD LETTER QUEUE PROCEDURE
  // ===========================================================================
  describe('deadLetterQueue', () => {
    it('should return dead letter queue items', async () => {
      const mockItems: DeadLetterItem[] = [
        {
          originalTask: {
            idempotencyKey: 'key1',
            text: 'Failed text',
            metadata: {
              sourceId: 's1',
              sourceType: 'code',
              chunkIndex: 0,
              totalChunks: 1,
              timestamp: Date.now(),
            },
            priority: 'normal',
            attemptCount: 3,
            createdAt: Date.now() - 60000,
          },
          error: 'Model not available',
          attemptCount: 3,
          timestamp: Date.now(),
        },
      ]
      mockEmbeddingManager.getDeadLetterQueue.mockReturnValue(mockItems)

      const result = await caller.deadLetterQueue()

      expect(result).toHaveLength(1)
      expect(result[0].error).toBe('Model not available')
    })

    it('should return empty array when no failed items', async () => {
      mockEmbeddingManager.getDeadLetterQueue.mockReturnValue([])

      const result = await caller.deadLetterQueue()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // RETRY DEAD LETTER QUEUE PROCEDURE
  // ===========================================================================
  describe('retryDeadLetterQueue', () => {
    it('should retry items in dead letter queue', async () => {
      mockEmbeddingManager.retryDeadLetterQueue.mockResolvedValue(5)

      const result = await caller.retryDeadLetterQueue()

      expect(result).toBe(5)
    })

    it('should return 0 when queue is empty', async () => {
      mockEmbeddingManager.retryDeadLetterQueue.mockResolvedValue(0)

      const result = await caller.retryDeadLetterQueue()

      expect(result).toBe(0)
    })
  })

  // ===========================================================================
  // CLEAR DEAD LETTER QUEUE PROCEDURE
  // ===========================================================================
  describe('clearDeadLetterQueue', () => {
    it('should clear dead letter queue', async () => {
      mockEmbeddingManager.clearDeadLetterQueue.mockResolvedValue(10)

      const result = await caller.clearDeadLetterQueue()

      expect(result).toBe(10)
    })
  })

  // ===========================================================================
  // PROCESS SESSION PROCEDURE
  // ===========================================================================
  describe('processSession', () => {
    it('should process session file', async () => {
      mockEmbeddingManager.processSessionFile.mockResolvedValue(50)

      const result = await caller.processSession({
        filePath: '/path/to/session/transcript.jsonl',
      })

      expect(result).toBe(50)
      expect(mockEmbeddingManager.processSessionFile).toHaveBeenCalledWith(
        '/path/to/session/transcript.jsonl'
      )
    })

    it('should reject empty file path', async () => {
      await expect(caller.processSession({ filePath: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // RESET SESSION POSITION PROCEDURE
  // ===========================================================================
  describe('resetSessionPosition', () => {
    it('should reset session position', async () => {
      mockEmbeddingManager.resetSessionPosition.mockImplementation(() => {})

      await caller.resetSessionPosition({
        filePath: '/path/to/session/transcript.jsonl',
      })

      expect(mockEmbeddingManager.resetSessionPosition).toHaveBeenCalledWith(
        '/path/to/session/transcript.jsonl'
      )
    })

    it('should reject empty file path', async () => {
      await expect(caller.resetSessionPosition({ filePath: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // RESET ALL SESSION POSITIONS PROCEDURE
  // ===========================================================================
  describe('resetAllSessionPositions', () => {
    it('should reset all session positions', async () => {
      mockEmbeddingManager.resetAllSessionPositions.mockImplementation(() => {})

      await caller.resetAllSessionPositions()

      expect(mockEmbeddingManager.resetAllSessionPositions).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // DELETE SESSION EMBEDDINGS PROCEDURE
  // ===========================================================================
  describe('deleteSessionEmbeddings', () => {
    it('should delete embeddings by session ID', async () => {
      mockEmbeddingManager.deleteSessionEmbeddings.mockResolvedValue(25)

      const result = await caller.deleteSessionEmbeddings({
        sessionId: 'session-abc-123',
      })

      expect(result).toBe(25)
      expect(mockEmbeddingManager.deleteSessionEmbeddings).toHaveBeenCalledWith(
        'session-abc-123'
      )
    })

    it('should reject empty session ID', async () => {
      await expect(caller.deleteSessionEmbeddings({ sessionId: '' })).rejects.toThrow()
    })

    it('should return 0 when no embeddings found', async () => {
      mockEmbeddingManager.deleteSessionEmbeddings.mockResolvedValue(0)

      const result = await caller.deleteSessionEmbeddings({
        sessionId: 'nonexistent-session',
      })

      expect(result).toBe(0)
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('embedding lifecycle', () => {
    it('should handle start-embed-stop cycle', async () => {
      mockEmbeddingManager.startAutoEmbedding.mockReturnValue(true)
      mockEmbeddingManager.embed.mockResolvedValue({
        embedding: new Array(1024).fill(0.1),
        model: 'mxbai-embed-large',
        processingTime: 50,
        cached: false,
      })
      mockEmbeddingManager.stopAutoEmbedding.mockResolvedValue(undefined)

      // Start
      const startResult = await caller.startAutoEmbed()
      expect(startResult).toBe(true)

      // Embed
      const embedResult = await caller.embed({ text: 'Test text' })
      expect(embedResult).toHaveLength(1024)

      // Stop
      await caller.stopAutoEmbed()
      expect(mockEmbeddingManager.stopAutoEmbedding).toHaveBeenCalled()
    })

    it('should handle cache warmup and clear cycle', async () => {
      mockEmbeddingManager.warmupModel.mockResolvedValue(true)
      mockEmbeddingManager.getCacheStats.mockReturnValue({
        size: 100,
        hitRate: 0.8,
        missRate: 0.2,
        avgLookupTime: 2.5,
        memoryUsage: 10000000,
        oldestEntry: Date.now() - 3600000,
        newestEntry: Date.now(),
      })
      mockEmbeddingManager.clearCache.mockResolvedValue(100)
      mockEmbeddingManager.unloadModel.mockResolvedValue(true)

      // Warmup
      const warmupResult = await caller.warmupModel()
      expect(warmupResult).toBe(true)

      // Check stats
      const stats = await caller.cacheStats()
      expect(stats.size).toBe(100)

      // Clear
      const clearResult = await caller.clearCache()
      expect(clearResult).toBe(100)

      // Unload
      const unloadResult = await caller.unloadModel()
      expect(unloadResult).toBe(true)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent embed requests', async () => {
      mockEmbeddingManager.embed.mockResolvedValue({
        embedding: new Array(1024).fill(0.1),
        model: 'mxbai-embed-large',
        processingTime: 50,
        cached: false,
      })

      const results = await Promise.all([
        caller.embed({ text: 'Text 1' }),
        caller.embed({ text: 'Text 2' }),
        caller.embed({ text: 'Text 3' }),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toHaveLength(1024)
      })
    })

    it('should handle concurrent search requests', async () => {
      mockEmbeddingManager.search.mockResolvedValue([])

      const results = await Promise.all([
        caller.search({ query: 'Query 1' }),
        caller.search({ query: 'Query 2' }),
        caller.search({ query: 'Query 3' }),
      ])

      expect(results).toHaveLength(3)
    })

    it('should handle high threshold value for search', async () => {
      mockEmbeddingManager.search.mockResolvedValue([])

      await caller.search({
        query: 'test',
        options: { threshold: 1 },
      })

      expect(mockEmbeddingManager.search).toHaveBeenCalled()
    })

    it('should handle low threshold value for search', async () => {
      mockEmbeddingManager.search.mockResolvedValue([])

      await caller.search({
        query: 'test',
        options: { threshold: 0 },
      })

      expect(mockEmbeddingManager.search).toHaveBeenCalled()
    })

    it('should handle max limit for search', async () => {
      mockEmbeddingManager.search.mockResolvedValue([])

      await caller.search({
        query: 'test',
        options: { limit: 100 },
      })

      expect(mockEmbeddingManager.search).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ limit: 100 })
      )
    })

    it('should reject limit exceeding max for search', async () => {
      await expect(
        caller.search({
          query: 'test',
          options: { limit: 101 },
        })
      ).rejects.toThrow()
    })
  })
})
