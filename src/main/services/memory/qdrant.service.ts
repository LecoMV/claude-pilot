/**
 * Qdrant Memory Service - Production Implementation
 *
 * Singleton service for managing vector memories in Qdrant.
 * Optimized for Claude Pilot with error handling, retry logic, and health monitoring.
 *
 * @module QdrantService
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import type { Filter, ScoredPoint } from '@qdrant/js-client-rest/dist/types'
import { randomUUID } from 'crypto'

// ============================================================================
// Configuration
// ============================================================================

const QDRANT_CONFIG = {
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  timeout: 60000, // 60 seconds
  retryAttempts: 3,
  retryBaseDelay: 1000,
} as const

const COLLECTIONS = {
  CLAUDE_MEMORIES: 'claude_memories',
  MEM0_MEMORIES: 'mem0_memories',
} as const

type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]

// ============================================================================
// Type Definitions
// ============================================================================

interface Memory {
  id: string
  content: string
  session_id: string
  timestamp: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

interface SearchOptions {
  limit?: number
  sessionId?: string
  scoreThreshold?: number
  filter?: Filter
}

interface CollectionStats {
  pointsCount: number
  indexedVectors: number
  segmentsCount: number
  status: string
  optimizerStatus: string
}

interface QdrantServiceError {
  code: 'CONNECTION_FAILED' | 'TIMEOUT' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'UNKNOWN'
  message: string
  originalError?: Error
}

// ============================================================================
// Service Implementation
// ============================================================================

class QdrantService {
  private static instance: QdrantService | null = null
  private client: QdrantClient | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private isHealthy = false

  private constructor() {
    this.initializeClient()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): QdrantService {
    if (!QdrantService.instance) {
      QdrantService.instance = new QdrantService()
    }
    return QdrantService.instance
  }

  /**
   * Initialize Qdrant client
   */
  private initializeClient(): void {
    this.client = new QdrantClient({
      url: QDRANT_CONFIG.url,
      timeout: QDRANT_CONFIG.timeout,
    })
  }

  /**
   * Get client instance with connection check
   */
  private getClient(): QdrantClient {
    if (!this.client) {
      this.initializeClient()
    }
    // client is guaranteed to be set after initializeClient()
    const client = this.client
    if (!client) {
      throw new Error('Failed to initialize Qdrant client')
    }
    return client
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private handleError(error: unknown): QdrantServiceError {
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

  /**
   * Retry operation with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean = () => true
  ): Promise<T> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < QDRANT_CONFIG.retryAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (!shouldRetry(error)) {
          throw error
        }

        const delay = QDRANT_CONFIG.retryBaseDelay * Math.pow(2, attempt)
        console.warn(
          `[QdrantService] Retry ${attempt + 1}/${QDRANT_CONFIG.retryAttempts} after ${delay}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  // ==========================================================================
  // Collection Management
  // ==========================================================================

  /**
   * Initialize collection with proper configuration
   */
  async initializeCollection(collectionName: CollectionName, vectorSize = 768): Promise<void> {
    try {
      const client = this.getClient()
      const exists = await client.collectionExists(collectionName)

      if (!exists) {
        console.info(`[QdrantService] Creating collection: ${collectionName}`)

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

        // Create payload indexes for filtering optimization
        await client.createPayloadIndex(collectionName, {
          field_name: 'session_id',
          field_schema: 'keyword',
        })

        await client.createPayloadIndex(collectionName, {
          field_name: 'timestamp',
          field_schema: 'integer',
        })

        console.info(`[QdrantService] Collection created: ${collectionName}`)
      }
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to initialize collection:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName: CollectionName): Promise<CollectionStats> {
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
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to get collection stats:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    try {
      const client = this.getClient()
      const { collections } = await this.withRetry(() => client.getCollections())
      return collections.map((c) => c.name)
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to list collections:', qdrantError)
      throw qdrantError
    }
  }

  // ==========================================================================
  // Memory Operations
  // ==========================================================================

  /**
   * Store a single memory
   */
  async storeMemory(
    collectionName: CollectionName,
    embedding: number[],
    memory: Omit<Memory, 'id'>
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

      console.info(`[QdrantService] Stored memory: ${id}`)
      return id
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to store memory:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * Batch upsert memories (efficient for large datasets)
   */
  async batchStoreMemories(
    collectionName: CollectionName,
    memories: Array<{
      embedding: number[]
      payload: Omit<Memory, 'id'>
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
        console.info(
          `[QdrantService] Batch ${Math.floor(i / batchSize) + 1}: Stored ${batch.length} memories`
        )
      }

      return ids
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to batch store memories:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * Search memories by vector similarity
   */
  async searchMemories(
    collectionName: CollectionName,
    embedding: number[],
    options: SearchOptions = {}
  ): Promise<Array<ScoredPoint & { payload: Memory }>> {
    try {
      const { limit = 10, sessionId, scoreThreshold = 0.6, filter } = options
      const client = this.getClient()

      // Build filter
      const searchFilter: Filter | undefined = filter
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
        // Don't retry on validation errors
        (error) => !(error instanceof Error && error.message.includes('Not found'))
      )

      return results.points as Array<ScoredPoint & { payload: Memory }>
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to search memories:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * Delete memory by ID
   */
  async deleteMemory(collectionName: CollectionName, id: string): Promise<void> {
    try {
      const client = this.getClient()
      await this.withRetry(() =>
        client.delete(collectionName, {
          points: [id],
        })
      )
      console.info(`[QdrantService] Deleted memory: ${id}`)
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to delete memory:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * Delete memories by filter (batch delete)
   */
  async deleteMemoriesByFilter(collectionName: CollectionName, filter: Filter): Promise<void> {
    try {
      const client = this.getClient()
      await this.withRetry(() => client.delete(collectionName, { filter }))
      console.info(`[QdrantService] Deleted memories by filter`)
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to delete memories by filter:', qdrantError)
      throw qdrantError
    }
  }

  /**
   * Update payload only (no vector change)
   */
  async updatePayload(
    collectionName: CollectionName,
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
      console.info(`[QdrantService] Updated payload for ${ids.length} memories`)
    } catch (error) {
      const qdrantError = this.handleError(error)
      console.error('[QdrantService] Failed to update payload:', qdrantError)
      throw qdrantError
    }
  }

  // ==========================================================================
  // Health Monitoring
  // ==========================================================================

  /**
   * Check if Qdrant is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient()
      await client.getCollections()
      this.isHealthy = true
      return true
    } catch (error) {
      this.isHealthy = false
      console.error('[QdrantService] Health check failed:', this.handleError(error))
      return false
    }
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring(intervalMs = 30000): void {
    if (this.healthCheckInterval) {
      console.warn('[QdrantService] Health monitoring already running')
      return
    }

    console.info(`[QdrantService] Starting health monitoring (interval: ${intervalMs}ms)`)

    this.healthCheckInterval = setInterval(async () => {
      const healthy = await this.healthCheck()
      console.info(`[QdrantService] Health status: ${healthy ? 'OK' : 'FAILED'}`)
    }, intervalMs)
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      console.info('[QdrantService] Health monitoring stopped')
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): boolean {
    return this.isHealthy
  }

  // ==========================================================================
  // Shutdown
  // ==========================================================================

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    console.info('[QdrantService] Shutting down...')
    this.stopHealthMonitoring()
    this.client = null
    QdrantService.instance = null
    console.info('[QdrantService] Shutdown complete')
  }
}

// ============================================================================
// Exports
// ============================================================================

export default QdrantService
export { COLLECTIONS, type Memory, type SearchOptions, type CollectionStats }
