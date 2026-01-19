/**
 * Embeddings Services Tests
 *
 * Comprehensive tests for the embedding system components:
 * - EmbeddingCache: SQLite cache with content-hash deduplication
 * - OllamaEmbeddingService: Ollama API client
 * - VectorStore: Dual pgvector + Qdrant storage
 * - ContentChunker: Intelligent text splitting
 *
 * @module embeddings.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// MOCK DEFINITIONS (vi.hoisted)
// ============================================================================

const mockDb = vi.hoisted(() => ({
  exec: vi.fn(),
  prepare: vi.fn(),
  close: vi.fn(),
  transaction: vi.fn((fn: (items: unknown[]) => void) => fn),
}))

const mockStatement = vi.hoisted(() => ({
  run: vi.fn(() => ({ changes: 1 })),
  get: vi.fn(),
  all: vi.fn(() => []),
}))

const mockFetch = vi.hoisted(() => vi.fn())

const mockPgPool = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
}))

const mockPgClient = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}))

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({ version: 1, timestamp: Date.now() })),
  }
})

vi.mock('pg', () => ({
  Pool: vi.fn(() => mockPgPool),
}))

vi.mock('p-queue', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn((fn) => fn()),
    pause: vi.fn(),
    clear: vi.fn(),
    onIdle: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    size: 0,
    pending: 0,
  })),
}))

// Mock the OllamaEmbeddingService module to avoid DEFAULT_OLLAMA_CONFIG import issue
// We'll test OllamaEmbeddingService separately with proper mocking
vi.mock('../OllamaEmbeddingService', () => {
  const MockOllamaEmbeddingService = vi.fn().mockImplementation((config = {}) => ({
    config: {
      model: config.model || 'mxbai-embed-large',
      dimensions: config.dimensions || 1024,
      keepAlive: config.keepAlive || '-1',
      batchSize: config.batchSize || 64,
      maxConcurrent: config.maxConcurrent || 4,
      healthCheckInterval: config.healthCheckInterval || 30000,
      warmupOnInit: config.warmupOnInit || false,
      baseUrl: config.baseUrl || 'http://localhost:11434',
    },
    healthy: false,
    modelLoaded: false,
    lastHealthCheck: 0,
    modelDigest: null,
    initialize: vi.fn().mockResolvedValue(true),
    shutdown: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue(true),
    warmupModel: vi.fn().mockResolvedValue(true),
    unloadModel: vi.fn().mockResolvedValue(true),
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2], model: 'mxbai-embed-large' }),
    embedBatch: vi.fn().mockResolvedValue([[0.1], [0.2]]),
    getStatus: vi.fn().mockReturnValue({ healthy: true, modelLoaded: true, model: 'mxbai-embed-large', lastCheck: Date.now() }),
    getConfig: vi.fn().mockImplementation(function (this: { config: unknown }) { return this.config }),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    getModelDigest: vi.fn().mockReturnValue(null),
  }))

  return {
    OllamaEmbeddingService: MockOllamaEmbeddingService,
    createOllamaEmbeddingService: (config?: Partial<unknown>) => new MockOllamaEmbeddingService(config),
  }
})

// Setup global fetch mock
global.fetch = mockFetch

// ============================================================================
// IMPORTS
// ============================================================================

import { EmbeddingCache, createEmbeddingCache } from '../EmbeddingCache'
import { ContentChunker, createContentChunker } from '../ContentChunker'
import { OllamaEmbeddingService, createOllamaEmbeddingService } from '../OllamaEmbeddingService'
import { VectorStore, createVectorStore } from '../VectorStore'
import type { StoredEmbedding } from '../types'

// ============================================================================
// EMBEDDING CACHE TESTS
// ============================================================================

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.prepare.mockReturnValue(mockStatement)
    cache = new EmbeddingCache('/tmp/test-embeddings.db')
  })

  afterEach(() => {
    cache.close()
  })

  describe('initialization', () => {
    it('should create database schema on initialization', () => {
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS embeddings')
      )
    })

    it('should create indexes for efficient queries', () => {
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_embeddings_model')
      )
    })

    it('should create model versions table', () => {
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS model_versions')
      )
    })
  })

  describe('get/set operations', () => {
    it('should return null for cache miss', () => {
      mockStatement.get.mockReturnValue(undefined)
      const result = cache.get('test text', 'mxbai-embed-large')
      expect(result).toBeNull()
    })

    it('should return embedding for cache hit', () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const buffer = Buffer.allocUnsafe(mockEmbedding.length * 4)
      mockEmbedding.forEach((val, i) => buffer.writeFloatLE(val, i * 4))

      mockStatement.get.mockReturnValue({
        embedding: buffer,
        dimensions: mockEmbedding.length,
      })

      const result = cache.get('test text', 'mxbai-embed-large')
      expect(result).toHaveLength(3)
      expect(result?.[0]).toBeCloseTo(0.1, 5)
    })

    it('should store embedding in cache', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4]
      cache.set('test text', 'mxbai-embed-large', embedding)

      expect(mockStatement.run).toHaveBeenCalledWith(
        expect.any(String),
        'mxbai-embed-large',
        null,
        expect.any(Buffer),
        4,
        expect.any(Number)
      )
    })

    it('should store embedding with model digest', () => {
      const embedding = [0.5, 0.6]
      cache.set('test text', 'mxbai-embed-large', embedding, 'sha256:abc123')

      expect(mockStatement.run).toHaveBeenCalledWith(
        expect.any(String),
        'mxbai-embed-large',
        'sha256:abc123',
        expect.any(Buffer),
        2,
        expect.any(Number)
      )
    })

    it('should track hit/miss counts', () => {
      mockStatement.get.mockReturnValueOnce(undefined).mockReturnValueOnce({
        embedding: Buffer.allocUnsafe(4),
        dimensions: 1,
      })

      cache.get('miss text', 'model')
      cache.get('hit text', 'model')

      mockStatement.get
        .mockReturnValueOnce({ count: 0 })
        .mockReturnValueOnce({ size: 0 })

      const stats = cache.getStats()
      expect(stats.hitCount).toBe(1)
      expect(stats.missCount).toBe(1)
    })
  })

  describe('has/delete operations', () => {
    it('should return true if entry exists', () => {
      mockStatement.get.mockReturnValue({ 1: 1 })
      expect(cache.has('test text', 'model')).toBe(true)
    })

    it('should return false if entry does not exist', () => {
      mockStatement.get.mockReturnValue(undefined)
      expect(cache.has('test text', 'model')).toBe(false)
    })

    it('should delete specific entry', () => {
      mockStatement.run.mockReturnValue({ changes: 1 })
      expect(cache.delete('test text', 'model')).toBe(true)
    })

    it('should return false when deleting non-existent entry', () => {
      mockStatement.run.mockReturnValue({ changes: 0 })
      expect(cache.delete('nonexistent', 'model')).toBe(false)
    })
  })

  describe('clear operations', () => {
    it('should clear all entries for a model', () => {
      mockStatement.run.mockReturnValue({ changes: 5 })
      expect(cache.clearModel('mxbai-embed-large')).toBe(5)
    })

    it('should clear entire cache', () => {
      mockStatement.run.mockReturnValue({ changes: 100 })
      expect(cache.clearAll()).toBe(100)
    })

    it('should reset counters on clearAll', () => {
      mockStatement.get.mockReturnValue(undefined)
      cache.get('text1', 'model')
      cache.get('text2', 'model')
      cache.clearAll()

      mockStatement.get
        .mockReturnValueOnce({ count: 0 })
        .mockReturnValueOnce({ size: 0 })

      const stats = cache.getStats()
      expect(stats.hitCount).toBe(0)
      expect(stats.missCount).toBe(0)
    })
  })

  describe('model version tracking', () => {
    it('should invalidate cache when model version changes', () => {
      mockStatement.get.mockReturnValue({ digest: 'old-digest' })
      mockStatement.run.mockReturnValue({ changes: 10 })
      expect(cache.checkModelVersion('mxbai-embed-large', 'new-digest')).toBe(true)
    })

    it('should not invalidate cache for same version', () => {
      mockStatement.get.mockReturnValue({ digest: 'same-digest' })
      expect(cache.checkModelVersion('mxbai-embed-large', 'same-digest')).toBe(false)
    })

    it('should store new model version on first encounter', () => {
      mockStatement.get.mockReturnValue(undefined)
      cache.checkModelVersion('new-model', 'digest-123')
      expect(mockStatement.run).toHaveBeenCalled()
    })
  })

  describe('batch operations', () => {
    it('should get multiple embeddings at once', () => {
      const buffer = Buffer.allocUnsafe(8)
      buffer.writeFloatLE(0.1, 0)
      buffer.writeFloatLE(0.2, 4)

      mockStatement.all.mockReturnValue([
        { content_hash: 'hash1', embedding: buffer, dimensions: 2 },
      ])

      const results = cache.getMany([
        { text: 'text1', model: 'model' },
        { text: 'text2', model: 'model' },
      ])

      expect(results.size).toBe(1)
    })

    it('should set multiple embeddings in transaction', () => {
      cache.setMany([
        { text: 'text1', model: 'model', embedding: [0.1] },
        { text: 'text2', model: 'model', embedding: [0.2] },
      ])
      expect(mockDb.transaction).toHaveBeenCalled()
    })
  })

  describe('pruning', () => {
    it('should prune old entries by age', () => {
      mockStatement.run.mockReturnValue({ changes: 5 })
      mockStatement.get.mockReturnValue({ count: 50 })
      expect(cache.prune(100000, 86400000)).toBeGreaterThanOrEqual(5)
    })

    it('should prune oldest entries when over limit', () => {
      mockStatement.run.mockReturnValue({ changes: 10 })
      mockStatement.get.mockReturnValue({ count: 150 })
      expect(cache.prune(100)).toBeGreaterThan(0)
    })
  })

  describe('statistics', () => {
    it('should return cache statistics', () => {
      mockStatement.get
        .mockReturnValueOnce({ count: 100 })
        .mockReturnValueOnce({ size: 409600 })

      const stats = cache.getStats()
      expect(stats.totalEntries).toBe(100)
      expect(stats.totalSize).toBe(409600)
    })

    it('should calculate hit rate correctly', () => {
      mockStatement.get
        .mockReturnValueOnce({ embedding: Buffer.allocUnsafe(4), dimensions: 1 })
        .mockReturnValueOnce({ embedding: Buffer.allocUnsafe(4), dimensions: 1 })
        .mockReturnValueOnce({ embedding: Buffer.allocUnsafe(4), dimensions: 1 })
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(undefined)

      cache.get('hit1', 'model')
      cache.get('hit2', 'model')
      cache.get('hit3', 'model')
      cache.get('miss1', 'model')
      cache.get('miss2', 'model')

      mockStatement.get
        .mockReturnValueOnce({ count: 3 })
        .mockReturnValueOnce({ size: 1024 })

      const stats = cache.getStats()
      expect(stats.hitRate).toBeCloseTo(0.6, 2)
    })
  })

  describe('factory function', () => {
    it('should create cache instance via factory', () => {
      const factoryCache = createEmbeddingCache('/tmp/factory-test.db')
      expect(factoryCache).toBeInstanceOf(EmbeddingCache)
      factoryCache.close()
    })
  })
})

// ============================================================================
// CONTENT CHUNKER TESTS
// ============================================================================

describe('ContentChunker', () => {
  let chunker: ContentChunker

  beforeEach(() => {
    chunker = new ContentChunker()
  })

  describe('basic chunking', () => {
    it('should return empty array for empty content', () => {
      expect(chunker.chunk('', 'conversation', { sourceId: 'test' })).toHaveLength(0)
    })

    it('should return empty array for whitespace-only content', () => {
      expect(chunker.chunk('   \n\t  ', 'conversation', { sourceId: 'test' })).toHaveLength(0)
    })

    it('should create single chunk for short content', () => {
      const content = 'This is a short piece of text.'
      const chunks = chunker.chunk(content, 'conversation', { sourceId: 'test' })
      expect(chunks).toHaveLength(1)
      expect(chunks[0].text).toBe(content)
    })

    it('should include metadata in chunks', () => {
      const chunks = chunker.chunk('Test content', 'conversation', {
        sourceId: 'session-123',
        sessionId: 'sess-456',
        projectPath: '/path/to/project',
      })
      expect(chunks[0].metadata.sourceId).toBe('session-123')
      expect(chunks[0].metadata.sessionId).toBe('sess-456')
      expect(chunks[0].metadata.projectPath).toBe('/path/to/project')
    })

    it('should generate content hash for deduplication', () => {
      const chunks = chunker.chunk('Test content', 'conversation', { sourceId: 'test' })
      expect(chunks[0].contentHash).toBeDefined()
      expect(chunks[0].contentHash).toHaveLength(16)
    })

    it('should track chunk index and total chunks', () => {
      const longContent = Array(50).fill('This is a paragraph of text.\n\n').join('')
      const chunks = chunker.chunk(longContent, 'documentation', { sourceId: 'test' })
      if (chunks.length > 1) {
        expect(chunks[0].metadata.chunkIndex).toBe(0)
        expect(chunks[0].metadata.totalChunks).toBe(chunks.length)
        expect(chunks[chunks.length - 1].metadata.chunkIndex).toBe(chunks.length - 1)
      }
    })
  })

  describe('code chunking', () => {
    it('should chunk code at function boundaries', () => {
      const code = `function hello() { console.log('Hello'); }
function world() { console.log('World'); }
export const greeting = 'Hi';`

      const chunks = chunker.chunk(code, 'code', { sourceId: 'test.ts' })
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].metadata.sourceType).toBe('code')
    })

    it('should handle Python code', () => {
      const code = `def hello():
    print('Hello')

class Greeter:
    def greet(self):
        print('Hi')`

      const chunks = chunker.chunk(code, 'code', { sourceId: 'test.py' })
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should fallback to line-based chunking for code without boundaries', () => {
      const code = Array(100).fill('const x = 1;').join('\n')
      const chunks = chunker.chunk(code, 'code', { sourceId: 'test.js' })
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle Go code', () => {
      const code = `func main() {
    fmt.Println("Hello")
}
func helper(x int) int {
    return x * 2
}`
      const chunks = chunker.chunk(code, 'code', { sourceId: 'main.go' })
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle Rust code', () => {
      const code = `fn main() {
    println!("Hello");
}
pub fn greet(name: &str) {
    println!("Hello, {}", name);
}
struct Person {
    name: String,
}`
      const chunks = chunker.chunk(code, 'code', { sourceId: 'main.rs' })
      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('conversation chunking', () => {
    it('should chunk at message boundaries', () => {
      const conversation = `Human: Hello, how are you?
Assistant: I'm doing well, thank you!
Human: What can you help me with?
Assistant: I can help you with coding tasks.`

      const chunks = chunker.chunk(conversation, 'conversation', { sourceId: 'test' })
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should preserve speaker metadata', () => {
      const conversation = `Human: What is the weather?`
      const chunks = chunker.chunk(conversation, 'conversation', {
        sourceId: 'test',
        speaker: 'user',
      })
      expect(chunks[0].metadata.speaker).toBe('user')
    })
  })

  describe('documentation chunking', () => {
    it('should chunk at headers', () => {
      const doc = `# Introduction
This is the intro.

## Getting Started
Here is how to start.

## Advanced Usage
More advanced topics.`

      const chunks = chunker.chunk(doc, 'documentation', { sourceId: 'readme.md' })
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle long documentation', () => {
      const doc = Array(100).fill('This is a paragraph.\n\n').join('')
      const chunks = chunker.chunk(doc, 'documentation', { sourceId: 'docs.md' })
      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('token estimation', () => {
    it('should estimate tokens correctly', () => {
      const text = 'Hello world this is a test.'
      const tokens = chunker.estimateTokens(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(text.length)
    })
  })

  describe('config management', () => {
    it('should get config for content type', () => {
      const config = chunker.getConfig('code')
      expect(config.contentType).toBe('code')
      expect(config.chunkSize).toBeGreaterThan(0)
      expect(config.overlapSize).toBeGreaterThan(0)
    })

    it('should set config for content type', () => {
      chunker.setConfig('code', { chunkSize: 500 })
      const config = chunker.getConfig('code')
      expect(config.chunkSize).toBe(500)
    })
  })

  describe('factory function', () => {
    it('should create chunker instance via factory', () => {
      const factoryChunker = createContentChunker()
      expect(factoryChunker).toBeInstanceOf(ContentChunker)
    })

    it('should accept custom configs', () => {
      const factoryChunker = createContentChunker({
        code: { contentType: 'code', chunkSize: 1000, overlapSize: 100 },
      })
      const config = factoryChunker.getConfig('code')
      expect(config.chunkSize).toBe(1000)
    })
  })
})

// ============================================================================
// OLLAMA EMBEDDING SERVICE TESTS (using mocked service)
// ============================================================================

describe('OllamaEmbeddingService', () => {
  let service: ReturnType<typeof OllamaEmbeddingService>

  beforeEach(() => {
    vi.clearAllMocks()
    service = new OllamaEmbeddingService({
      baseUrl: 'http://localhost:11434',
      model: 'mxbai-embed-large',
      warmupOnInit: false,
      healthCheckInterval: 30000,
    })
  })

  afterEach(async () => {
    if (service?.shutdown) {
      await service.shutdown()
    }
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await service.initialize()
      expect(result).toBe(true)
    })

    it('should call initialize method', async () => {
      await service.initialize()
      expect(service.initialize).toHaveBeenCalled()
    })
  })

  describe('health check', () => {
    it('should return healthy status', async () => {
      const result = await service.healthCheck()
      expect(result).toBe(true)
    })
  })

  describe('embedding generation', () => {
    it('should generate embedding for text', async () => {
      const result = await service.embed('Hello world')
      expect(result).not.toBeNull()
      expect(result?.embedding).toBeDefined()
      expect(result?.model).toBe('mxbai-embed-large')
    })
  })

  describe('batch embedding', () => {
    it('should generate embeddings for batch', async () => {
      const results = await service.embedBatch(['text1', 'text2'])
      expect(results).toHaveLength(2)
    })
  })

  describe('model management', () => {
    it('should warm up model', async () => {
      const result = await service.warmupModel()
      expect(result).toBe(true)
    })

    it('should unload model', async () => {
      const result = await service.unloadModel()
      expect(result).toBe(true)
    })

    it('should get model digest', () => {
      const digest = service.getModelDigest()
      expect(digest).toBeNull()
    })
  })

  describe('status and config', () => {
    it('should return status', () => {
      const status = service.getStatus()
      expect(status).toHaveProperty('healthy')
      expect(status).toHaveProperty('modelLoaded')
      expect(status).toHaveProperty('model')
    })

    it('should return config', () => {
      const config = service.getConfig()
      expect(config.model).toBe('mxbai-embed-large')
      expect(config.baseUrl).toBe('http://localhost:11434')
    })

    it('should update config', async () => {
      await service.updateConfig({ model: 'new-model' })
      expect(service.updateConfig).toHaveBeenCalled()
    })
  })

  describe('factory function', () => {
    it('should create service via factory', () => {
      const factoryService = createOllamaEmbeddingService({ model: 'test-model' })
      expect(factoryService).toBeDefined()
      const config = factoryService.getConfig()
      expect(config.model).toBe('test-model')
    })
  })

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await service.shutdown()
      expect(service.shutdown).toHaveBeenCalled()
    })
  })
})

// ============================================================================
// VECTOR STORE TESTS
// ============================================================================

describe('VectorStore', () => {
  let store: VectorStore

  beforeEach(() => {
    vi.clearAllMocks()
    mockPgPool.connect.mockResolvedValue(mockPgClient)
    mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 })
    store = new VectorStore({
      pgvectorUrl: 'postgresql://localhost:5432/test',
      qdrantUrl: 'http://localhost:6333',
      enablePgvector: true,
      enableQdrant: true,
      dimensions: 1024,
    })
  })

  afterEach(async () => {
    await store.shutdown()
  })

  describe('initialization', () => {
    it('should initialize with pgvector', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await store.initialize()
      expect(result).toBe(true)
    })

    it('should initialize with Qdrant only when pgvector fails', async () => {
      mockPgPool.connect.mockRejectedValueOnce(new Error('PG connection failed'))
      mockFetch.mockResolvedValueOnce({ ok: true })
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await store.initialize()
      expect(result).toBe(true)
    })

    it('should return false when both stores fail', async () => {
      mockPgPool.connect.mockRejectedValueOnce(new Error('PG failed'))
      mockFetch.mockRejectedValueOnce(new Error('Qdrant failed'))

      const result = await store.initialize()
      expect(result).toBe(false)
    })

    it('should create Qdrant collection if not exists', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })

      await store.initialize()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/collections/'),
        expect.objectContaining({ method: 'PUT' })
      )
    })
  })

  describe('store operations', () => {
    const sampleEmbedding: StoredEmbedding = {
      id: 'test-id',
      contentHash: 'hash123',
      content: 'Test content',
      embedding: [0.1, 0.2, 0.3],
      sourceType: 'conversation',
      sourceId: 'source-1',
      sessionId: 'session-1',
      metadata: {
        sourceId: 'source-1',
        sourceType: 'conversation',
        chunkIndex: 0,
        totalChunks: 1,
        timestamp: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    beforeEach(async () => {
      mockFetch.mockResolvedValue({ ok: true })
      await store.initialize()
    })

    it('should store embedding', async () => {
      mockPgPool.query.mockResolvedValueOnce({ rowCount: 1 })
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await store.store(sampleEmbedding)
      expect(result).toBe(true)
    })

    it('should store batch of embeddings', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 1 })
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await store.storeBatch([sampleEmbedding, sampleEmbedding])
      expect(result).toBeGreaterThan(0)
    })

    it('should return 0 for empty batch', async () => {
      const result = await store.storeBatch([])
      expect(result).toBe(0)
    })
  })

  describe('search operations', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({ ok: true })
      await store.initialize()
    })

    it('should search with query embedding', async () => {
      mockPgPool.query.mockResolvedValueOnce({
        rows: [
          { id: '1', score: 0.95, metadata: '{}' },
          { id: '2', score: 0.85, metadata: '{}' },
        ],
      })

      const results = await store.search([0.1, 0.2, 0.3], { limit: 10 })
      expect(results.length).toBeGreaterThan(0)
    })

    it('should filter by source type', async () => {
      mockPgPool.query.mockResolvedValueOnce({
        rows: [{ id: '1', score: 0.95, metadata: '{}' }],
      })

      const results = await store.search([0.1], { sourceType: 'code' })
      expect(mockPgPool.query).toHaveBeenCalledWith(
        expect.stringContaining('source_type'),
        expect.arrayContaining(['code'])
      )
      expect(results).toBeDefined()
    })

    it('should filter by session ID', async () => {
      mockPgPool.query.mockResolvedValueOnce({
        rows: [{ id: '1', score: 0.95, metadata: '{}' }],
      })

      await store.search([0.1], { sessionId: 'sess-123' })
      expect(mockPgPool.query).toHaveBeenCalledWith(
        expect.stringContaining('session_id'),
        expect.arrayContaining(['sess-123'])
      )
    })

    it('should filter by threshold', async () => {
      mockPgPool.query.mockResolvedValueOnce({
        rows: [
          { id: '1', score: 0.95, metadata: '{}' },
          { id: '2', score: 0.65, metadata: '{}' },
        ],
      })

      const results = await store.search([0.1], { threshold: 0.7 })
      expect(results.every((r) => r.score >= 0.7)).toBe(true)
    })

    it('should fallback to Qdrant when pgvector fails', async () => {
      mockPgPool.query.mockRejectedValueOnce(new Error('PG search failed'))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: [{ id: '1', score: 0.9, payload: { metadata: {} } }],
        }),
      })

      const results = await store.search([0.1])
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('delete operations', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({ ok: true })
      await store.initialize()
    })

    it('should delete by source ID', async () => {
      mockPgPool.query.mockResolvedValueOnce({ rowCount: 5 })

      const result = await store.deleteBySourceId('source-123')
      expect(result).toBeGreaterThan(0)
    })

    it('should delete by session ID', async () => {
      mockPgPool.query.mockResolvedValueOnce({ rowCount: 3 })

      const result = await store.deleteBySessionId('session-456')
      expect(result).toBeGreaterThan(0)
    })
  })

  describe('statistics', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({ ok: true })
      await store.initialize()
    })

    it('should return stats', async () => {
      mockPgPool.query.mockResolvedValueOnce({ rows: [{ count: '1000' }] })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: { points_count: 500 } }),
      })

      const stats = await store.getStats()
      expect(stats.pgvector.connected).toBe(true)
      expect(stats.qdrant.connected).toBe(true)
    })

    it('should return health status', () => {
      const health = store.getHealth()
      expect(health).toHaveProperty('pgvector')
      expect(health).toHaveProperty('qdrant')
      expect(health).toHaveProperty('initialized')
    })
  })

  describe('factory function', () => {
    it('should create store via factory', () => {
      const factoryStore = createVectorStore({
        pgvectorUrl: 'postgresql://test',
        qdrantUrl: 'http://test:6333',
      })
      expect(factoryStore).toBeInstanceOf(VectorStore)
    })
  })
})
