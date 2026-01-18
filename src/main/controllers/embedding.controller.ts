/**
 * Embedding Controller - Vector Operations and Auto-Embedding Pipeline
 *
 * Migrated from handlers.ts to tRPC pattern.
 * Provides type-safe embedding operations, search, and pipeline management.
 *
 * @see src/main/ipc/handlers.ts for legacy implementation
 * @see src/main/services/embeddings/ for core services
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import {
  getEmbeddingManager,
  initializeEmbeddingManager,
  type EmbeddingManagerStatus,
  type PipelineMetrics,
  type SearchResult,
  type DeadLetterItem,
  type ContentType,
  type ChunkMetadata,
  type OllamaConfig,
  type CacheStats,
} from '../services/embeddings'

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const ContentTypeSchema = z.enum([
  'code',
  'conversation',
  'tool_result',
  'learning',
  'documentation',
])

const SearchOptionsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(10),
  threshold: z.number().min(0).max(1).optional(),
  sourceType: ContentTypeSchema.optional(),
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  includeContent: z.boolean().optional().default(true),
})

const ChunkMetadataSchema = z.object({
  sourceId: z.string().optional(),
  sourceType: ContentTypeSchema.optional(),
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  filePath: z.string().optional(),
  timestamp: z.number().optional(),
})

const OllamaConfigSchema = z.object({
  model: z.string().optional(),
  dimensions: z.number().optional(),
  keepAlive: z.string().optional(),
  batchSize: z.number().optional(),
  maxConcurrent: z.number().optional(),
  healthCheckInterval: z.number().optional(),
  warmupOnInit: z.boolean().optional(),
  baseUrl: z.string().url().optional(),
})

const PruneCacheSchema = z.object({
  maxEntries: z.number().min(1).optional(),
  maxAge: z.number().min(1).optional(),
})

const FilePathSchema = z.object({
  filePath: z.string().min(1),
})

const SessionIdSchema = z.object({
  sessionId: z.string().min(1),
})

const EmbedAndStoreSchema = z.object({
  content: z.string().min(1),
  contentType: ContentTypeSchema,
  metadata: ChunkMetadataSchema.optional().default({}),
})

const SearchSchema = z.object({
  query: z.string().min(1),
  options: SearchOptionsSchema.optional(),
})

const EmbedTextSchema = z.object({
  text: z.string().min(1),
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

let embeddingManagerPromise: Promise<ReturnType<typeof getEmbeddingManager>> | null = null

/**
 * Lazy initialization of EmbeddingManager singleton
 */
function ensureEmbeddingManager(): Promise<ReturnType<typeof getEmbeddingManager>> {
  if (!embeddingManagerPromise) {
    embeddingManagerPromise = initializeEmbeddingManager()
  }
  return embeddingManagerPromise
}

// ============================================================================
// EMBEDDING ROUTER
// ============================================================================

export const embeddingRouter = router({
  // ─────────────────────────────────────────────────────────────────────────
  // STATUS & METRICS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get embedding system status
   */
  status: publicProcedure.query(async (): Promise<EmbeddingManagerStatus> => {
    const manager = await ensureEmbeddingManager()
    return manager.getStatus()
  }),

  /**
   * Get pipeline metrics (latency, throughput, error rates)
   */
  metrics: publicProcedure.query(async (): Promise<PipelineMetrics> => {
    const manager = await ensureEmbeddingManager()
    return manager.getMetrics()
  }),

  /**
   * Get cache statistics
   */
  cacheStats: publicProcedure.query(async (): Promise<CacheStats> => {
    const manager = await ensureEmbeddingManager()
    return manager.getCacheStats()
  }),

  /**
   * Get vector store statistics
   */
  vectorStoreStats: publicProcedure.query(async () => {
    const manager = await ensureEmbeddingManager()
    const stats = await manager.getVectorStoreStats()
    return stats
  }),

  /**
   * Reset pipeline metrics
   */
  resetMetrics: auditedProcedure.mutation(async (): Promise<void> => {
    const manager = await ensureEmbeddingManager()
    manager.resetMetrics()
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // AUTO-EMBEDDING CONTROL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start auto-embedding (watch session files)
   */
  startAutoEmbed: auditedProcedure.mutation(async (): Promise<boolean> => {
    const manager = await ensureEmbeddingManager()
    return manager.startAutoEmbedding()
  }),

  /**
   * Stop auto-embedding
   */
  stopAutoEmbed: auditedProcedure.mutation(async (): Promise<void> => {
    const manager = await ensureEmbeddingManager()
    await manager.stopAutoEmbedding()
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // EMBEDDING OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Embed text and return vector
   */
  embed: publicProcedure
    .input(EmbedTextSchema)
    .mutation(async ({ input }): Promise<number[] | null> => {
      const manager = await ensureEmbeddingManager()
      const result = await manager.embed(input.text)
      return result?.embedding || null
    }),

  /**
   * Embed content and store in vector stores
   */
  embedAndStore: auditedProcedure
    .input(EmbedAndStoreSchema)
    .mutation(async ({ input }): Promise<number> => {
      const manager = await ensureEmbeddingManager()
      return manager.embedAndStore(
        input.content,
        input.contentType as ContentType,
        input.metadata as Partial<ChunkMetadata>
      )
    }),

  /**
   * Search for similar content
   */
  search: publicProcedure.input(SearchSchema).query(async ({ input }): Promise<SearchResult[]> => {
    const manager = await ensureEmbeddingManager()
    return manager.search(input.query, input.options)
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // MODEL MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Warmup Ollama model (load into memory)
   */
  warmupModel: auditedProcedure.mutation(async (): Promise<boolean> => {
    const manager = await ensureEmbeddingManager()
    return manager.warmupModel()
  }),

  /**
   * Unload Ollama model from memory
   */
  unloadModel: auditedProcedure.mutation(async (): Promise<boolean> => {
    const manager = await ensureEmbeddingManager()
    return manager.unloadModel()
  }),

  /**
   * Update Ollama configuration
   */
  updateOllamaConfig: auditedProcedure
    .input(OllamaConfigSchema)
    .mutation(async ({ input }): Promise<void> => {
      const manager = await ensureEmbeddingManager()
      await manager.updateOllamaConfig(input as Partial<OllamaConfig>)
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // CACHE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Prune embedding cache
   */
  pruneCache: auditedProcedure
    .input(PruneCacheSchema)
    .mutation(async ({ input }): Promise<number> => {
      const manager = await ensureEmbeddingManager()
      return manager.pruneCache(input.maxEntries, input.maxAge)
    }),

  /**
   * Clear entire embedding cache
   */
  clearCache: auditedProcedure.mutation(async (): Promise<number> => {
    const manager = await ensureEmbeddingManager()
    return manager.clearCache()
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // DEAD LETTER QUEUE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get dead letter queue items
   */
  deadLetterQueue: publicProcedure.query(async (): Promise<DeadLetterItem[]> => {
    const manager = await ensureEmbeddingManager()
    return manager.getDeadLetterQueue()
  }),

  /**
   * Retry items in dead letter queue
   */
  retryDeadLetterQueue: auditedProcedure.mutation(async (): Promise<number> => {
    const manager = await ensureEmbeddingManager()
    return manager.retryDeadLetterQueue()
  }),

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue: auditedProcedure.mutation(async (): Promise<number> => {
    const manager = await ensureEmbeddingManager()
    return manager.clearDeadLetterQueue()
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process a specific session file
   */
  processSession: auditedProcedure
    .input(FilePathSchema)
    .mutation(async ({ input }): Promise<number> => {
      const manager = await ensureEmbeddingManager()
      return manager.processSessionFile(input.filePath)
    }),

  /**
   * Reset session position (reprocess from beginning)
   */
  resetSessionPosition: auditedProcedure
    .input(FilePathSchema)
    .mutation(async ({ input }): Promise<void> => {
      const manager = await ensureEmbeddingManager()
      manager.resetSessionPosition(input.filePath)
    }),

  /**
   * Reset all session positions
   */
  resetAllSessionPositions: auditedProcedure.mutation(async (): Promise<void> => {
    const manager = await ensureEmbeddingManager()
    manager.resetAllSessionPositions()
  }),

  /**
   * Delete embeddings by session ID
   */
  deleteSessionEmbeddings: auditedProcedure
    .input(SessionIdSchema)
    .mutation(async ({ input }): Promise<number> => {
      const manager = await ensureEmbeddingManager()
      return manager.deleteSessionEmbeddings(input.sessionId)
    }),
})

export type EmbeddingRouter = typeof embeddingRouter
