/**
 * EmbeddingManager
 *
 * Top-level orchestrator for the auto-embedding system.
 * Coordinates all components and provides unified API for:
 * - Lifecycle management (startup, shutdown)
 * - Manual embedding operations
 * - Search across vector stores
 * - Metrics and monitoring
 * - Configuration management
 */

import { EventEmitter } from 'events'
import { createOllamaEmbeddingService, OllamaEmbeddingService } from './OllamaEmbeddingService'
import { createEmbeddingPipeline, EmbeddingPipeline } from './EmbeddingPipeline'
import { createEmbeddingCache, EmbeddingCache } from './EmbeddingCache'
import { createContentChunker, ContentChunker } from './ContentChunker'
import { createSessionEmbeddingWorker, SessionEmbeddingWorker } from './SessionEmbeddingWorker'
import { createVectorStore, VectorStore } from './VectorStore'
import { randomUUID } from 'crypto'
import type {
  OllamaConfig,
  PipelineConfig,
  AutoEmbedConfig,
  PipelineMetrics,
  SearchOptions,
  SearchResult,
  StoredEmbedding,
  EmbeddingResult,
  ContentType,
  ChunkMetadata,
} from './types'

export interface EmbeddingManagerConfig {
  /** Ollama service configuration */
  ollama?: Partial<OllamaConfig>
  /** Pipeline configuration */
  pipeline?: Partial<PipelineConfig>
  /** Auto-embed configuration */
  autoEmbed?: Partial<AutoEmbedConfig>
  /** pgvector connection string */
  pgvectorUrl?: string
  /** Qdrant endpoint */
  qdrantUrl?: string
  /** Enable auto-embedding on startup */
  autoStart?: boolean
}

export interface EmbeddingManagerStatus {
  /** Overall system status */
  initialized: boolean
  /** Auto-embedding active */
  autoEmbedding: boolean
  /** Ollama status */
  ollama: {
    healthy: boolean
    modelLoaded: boolean
    model: string
  }
  /** Vector store status */
  vectorStore: {
    pgvectorConnected: boolean
    qdrantConnected: boolean
  }
  /** Pipeline status */
  pipeline: {
    processing: boolean
    queueDepth: number
    circuitBreakerOpen: boolean
  }
  /** Session worker status */
  sessionWorker: {
    enabled: boolean
    watchedFiles: number
    processing: number
  }
}

export class EmbeddingManager extends EventEmitter {
  private config: EmbeddingManagerConfig
  private ollamaService: OllamaEmbeddingService
  private cache: EmbeddingCache
  private chunker: ContentChunker
  private pipeline: EmbeddingPipeline
  private vectorStore: VectorStore
  private sessionWorker: SessionEmbeddingWorker

  private initialized = false
  private autoEmbeddingActive = false

  constructor(config: EmbeddingManagerConfig = {}) {
    super()
    this.config = config

    // Initialize components
    this.ollamaService = createOllamaEmbeddingService(config.ollama)
    this.cache = createEmbeddingCache()
    this.chunker = createContentChunker()
    this.pipeline = createEmbeddingPipeline(this.ollamaService, this.cache, config.pipeline)
    this.vectorStore = createVectorStore({
      pgvectorUrl: config.pgvectorUrl,
      qdrantUrl: config.qdrantUrl,
    })
    this.sessionWorker = createSessionEmbeddingWorker(
      this.pipeline,
      this.chunker,
      config.autoEmbed
    )

    // Wire up events
    this.setupEventHandlers()
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true
    }

    console.info('[EmbeddingManager] Initializing...')

    try {
      // Initialize components in parallel where possible
      const [ollamaOk, vectorStoreOk] = await Promise.all([
        this.ollamaService.initialize(),
        this.vectorStore.initialize(),
      ])

      // Initialize pipeline (depends on Ollama)
      if (ollamaOk) {
        await this.pipeline.initialize()

        // Check model version for cache invalidation
        const digest = this.ollamaService.getModelDigest()
        const config = this.ollamaService.getConfig()
        if (digest) {
          this.cache.checkModelVersion(config.model, digest)
        }
      }

      this.initialized = ollamaOk || vectorStoreOk

      if (this.initialized) {
        console.info('[EmbeddingManager] Initialized successfully')

        // Auto-start if configured
        if (this.config.autoStart) {
          await this.startAutoEmbedding()
        }
      } else {
        console.error('[EmbeddingManager] Initialization failed - no services available')
      }

      return this.initialized
    } catch (error) {
      console.error('[EmbeddingManager] Initialization error:', error)
      return false
    }
  }

  /**
   * Shutdown all components gracefully
   */
  async shutdown(): Promise<void> {
    console.info('[EmbeddingManager] Shutting down...')

    // Stop auto-embedding first
    await this.stopAutoEmbedding()

    // Shutdown components
    await Promise.all([
      this.pipeline.shutdown(),
      this.ollamaService.shutdown(),
      this.vectorStore.shutdown(),
    ])

    // Close cache
    this.cache.close()

    this.initialized = false
    console.info('[EmbeddingManager] Shutdown complete')
  }

  /**
   * Start auto-embedding (watch session files)
   */
  async startAutoEmbedding(): Promise<boolean> {
    if (!this.initialized) {
      console.warn('[EmbeddingManager] Cannot start auto-embedding - not initialized')
      return false
    }

    if (this.autoEmbeddingActive) {
      return true
    }

    console.info('[EmbeddingManager] Starting auto-embedding...')

    await this.sessionWorker.start()
    this.autoEmbeddingActive = true

    this.emit('autoEmbeddingStarted')
    return true
  }

  /**
   * Stop auto-embedding
   */
  async stopAutoEmbedding(): Promise<void> {
    if (!this.autoEmbeddingActive) {
      return
    }

    console.info('[EmbeddingManager] Stopping auto-embedding...')

    await this.sessionWorker.stop()
    this.autoEmbeddingActive = false

    this.emit('autoEmbeddingStopped')
  }

  /**
   * Embed a single piece of text
   */
  async embed(text: string): Promise<EmbeddingResult | null> {
    if (!this.initialized) {
      return null
    }

    return this.ollamaService.embed(text)
  }

  /**
   * Embed and store content
   */
  async embedAndStore(
    content: string,
    contentType: ContentType,
    metadata: Partial<ChunkMetadata>
  ): Promise<number> {
    if (!this.initialized) {
      return 0
    }

    // Chunk the content
    const chunks = this.chunker.chunk(content, contentType, metadata)

    if (chunks.length === 0) {
      return 0
    }

    // Generate embeddings
    const embeddings: StoredEmbedding[] = []

    for (const chunk of chunks) {
      // Check cache first
      const config = this.ollamaService.getConfig()
      const cached = this.cache.get(chunk.text, config.model)

      let embedding: number[]

      if (cached) {
        embedding = cached
      } else {
        const result = await this.ollamaService.embed(chunk.text)
        if (!result) continue

        embedding = result.embedding

        // Cache the result
        this.cache.set(
          chunk.text,
          config.model,
          embedding,
          this.ollamaService.getModelDigest() || undefined
        )
      }

      embeddings.push({
        id: randomUUID(),
        contentHash: chunk.contentHash,
        content: chunk.text,
        embedding,
        sourceType: chunk.metadata.sourceType,
        sourceId: chunk.metadata.sourceId,
        sessionId: chunk.metadata.sessionId,
        metadata: chunk.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    // Store in vector stores
    if (embeddings.length > 0) {
      return this.vectorStore.storeBatch(embeddings)
    }

    return 0
  }

  /**
   * Search for similar content
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.initialized) {
      return []
    }

    // Generate query embedding
    const result = await this.ollamaService.embed(query)
    if (!result) {
      return []
    }

    // Search vector stores
    return this.vectorStore.search(result.embedding, options)
  }

  /**
   * Search with pre-computed embedding
   */
  async searchByEmbedding(
    embedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      return []
    }

    return this.vectorStore.search(embedding, options)
  }

  /**
   * Get current status
   */
  getStatus(): EmbeddingManagerStatus {
    const ollamaStatus = this.ollamaService.getStatus()
    const vectorHealth = this.vectorStore.getHealth()
    const pipelineStatus = this.pipeline.getStatus()
    const workerStatus = this.sessionWorker.getStatus()

    return {
      initialized: this.initialized,
      autoEmbedding: this.autoEmbeddingActive,
      ollama: {
        healthy: ollamaStatus.healthy,
        modelLoaded: ollamaStatus.modelLoaded,
        model: ollamaStatus.model,
      },
      vectorStore: {
        pgvectorConnected: vectorHealth.pgvector,
        qdrantConnected: vectorHealth.qdrant,
      },
      pipeline: {
        processing: pipelineStatus.processing,
        queueDepth: pipelineStatus.queueDepth,
        circuitBreakerOpen: pipelineStatus.circuitBreakerOpen,
      },
      sessionWorker: {
        enabled: workerStatus.enabled,
        watchedFiles: workerStatus.watchedFiles,
        processing: workerStatus.processing,
      },
    }
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return this.pipeline.getMetrics()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }

  /**
   * Get vector store statistics
   */
  async getVectorStoreStats() {
    return this.vectorStore.getStats()
  }

  /**
   * Reset pipeline metrics
   */
  resetMetrics(): void {
    this.pipeline.resetMetrics()
  }

  /**
   * Get dead letter queue items
   */
  getDeadLetterQueue() {
    return this.pipeline.getDeadLetterQueue()
  }

  /**
   * Retry dead letter queue
   */
  async retryDeadLetterQueue(): Promise<number> {
    return this.pipeline.retryDeadLetterQueue()
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): number {
    return this.pipeline.clearDeadLetterQueue()
  }

  /**
   * Process a specific session file
   */
  async processSessionFile(filePath: string): Promise<number> {
    return this.sessionWorker.processFile(filePath)
  }

  /**
   * Reset session position (reprocess from beginning)
   */
  resetSessionPosition(filePath: string): void {
    this.sessionWorker.resetPosition(filePath)
  }

  /**
   * Reset all session positions
   */
  resetAllSessionPositions(): void {
    this.sessionWorker.resetAllPositions()
  }

  /**
   * Delete embeddings by session ID
   */
  async deleteSessionEmbeddings(sessionId: string): Promise<number> {
    return this.vectorStore.deleteBySessionId(sessionId)
  }

  /**
   * Warmup Ollama model
   */
  async warmupModel(): Promise<boolean> {
    return this.ollamaService.warmupModel()
  }

  /**
   * Unload Ollama model
   */
  async unloadModel(): Promise<boolean> {
    return this.ollamaService.unloadModel()
  }

  /**
   * Update Ollama configuration
   */
  async updateOllamaConfig(config: Partial<OllamaConfig>): Promise<void> {
    await this.ollamaService.updateConfig(config)

    // Check for cache invalidation if model changed
    const digest = this.ollamaService.getModelDigest()
    const currentConfig = this.ollamaService.getConfig()
    if (digest && config.model) {
      this.cache.checkModelVersion(currentConfig.model, digest)
    }
  }

  /**
   * Prune embedding cache
   */
  pruneCache(maxEntries?: number, maxAge?: number): number {
    return this.cache.prune(maxEntries, maxAge)
  }

  /**
   * Clear embedding cache
   */
  clearCache(): number {
    return this.cache.clearAll()
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  private setupEventHandlers(): void {
    // Pipeline events
    this.pipeline.on('result', (result: EmbeddingResult) => {
      this.storeEmbeddingResult(result).catch(console.error)
    })

    this.pipeline.on('alert', (alert) => {
      this.emit('alert', alert)
    })

    this.pipeline.on('progress', (progress) => {
      this.emit('progress', progress)
    })

    // Session worker events
    this.sessionWorker.on('processed', (data) => {
      this.emit('sessionProcessed', data)
    })

    this.sessionWorker.on('error', (error) => {
      this.emit('error', error)
    })
  }

  private async storeEmbeddingResult(_result: EmbeddingResult): Promise<void> {
    // This is called when pipeline processes a task
    // The task metadata should be used to construct StoredEmbedding
    // For now, we rely on the pipeline to emit results with full context
  }
}

// Export factory function
export function createEmbeddingManager(
  config?: EmbeddingManagerConfig
): EmbeddingManager {
  return new EmbeddingManager(config)
}

// Export singleton instance for app-wide use
let embeddingManagerInstance: EmbeddingManager | null = null

export function getEmbeddingManager(
  config?: EmbeddingManagerConfig
): EmbeddingManager {
  if (!embeddingManagerInstance) {
    embeddingManagerInstance = createEmbeddingManager(config)
  }
  return embeddingManagerInstance
}

export async function initializeEmbeddingManager(
  config?: EmbeddingManagerConfig
): Promise<EmbeddingManager> {
  const manager = getEmbeddingManager(config)
  await manager.initialize()
  return manager
}

export async function shutdownEmbeddingManager(): Promise<void> {
  if (embeddingManagerInstance) {
    await embeddingManagerInstance.shutdown()
    embeddingManagerInstance = null
  }
}
