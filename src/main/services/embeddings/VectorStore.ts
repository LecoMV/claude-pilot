/**
 * VectorStore
 *
 * Unified interface for vector storage backends (pgvector + Qdrant).
 * Features:
 * - Dual-write to both stores for redundancy
 * - Hybrid search (semantic + metadata filtering)
 * - Batch upsert with transactions
 * - Connection health monitoring
 * - Automatic fallback between stores
 */

import { EventEmitter } from 'events'
import type {
  StoredEmbedding,
  SearchOptions,
  SearchResult,
  ChunkMetadata,
} from './types'

interface VectorStoreConfig {
  /** pgvector connection string */
  pgvectorUrl: string
  /** Qdrant endpoint */
  qdrantUrl: string
  /** Qdrant collection name */
  qdrantCollection: string
  /** Vector dimensions */
  dimensions: number
  /** Enable pgvector storage */
  enablePgvector: boolean
  /** Enable Qdrant storage */
  enableQdrant: boolean
  /** Use HNSW index for pgvector */
  useHnswIndex: boolean
}

const DEFAULT_CONFIG: VectorStoreConfig = {
  pgvectorUrl: 'postgresql://localhost:5433/claude_memory',
  qdrantUrl: 'http://localhost:6333',
  qdrantCollection: 'claude_embeddings',
  dimensions: 1024,
  enablePgvector: true,
  enableQdrant: true,
  useHnswIndex: true,
}

interface PgPool {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>
  connect: () => Promise<{ release: () => void; query: typeof this.query }>
  end: () => Promise<void>
}

export class VectorStore extends EventEmitter {
  private config: VectorStoreConfig
  private pgPool: PgPool | null = null
  private pgConnected = false
  private qdrantConnected = false
  private initialized = false

  constructor(config: Partial<VectorStoreConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize connections and create schemas
   */
  async initialize(): Promise<boolean> {
    console.info('[VectorStore] Initializing...')

    const results = await Promise.allSettled([
      this.config.enablePgvector ? this.initializePgvector() : Promise.resolve(false),
      this.config.enableQdrant ? this.initializeQdrant() : Promise.resolve(false),
    ])

    this.pgConnected = results[0].status === 'fulfilled' && results[0].value
    this.qdrantConnected = results[1].status === 'fulfilled' && results[1].value

    this.initialized = this.pgConnected || this.qdrantConnected

    if (!this.initialized) {
      console.error('[VectorStore] No vector stores available')
    } else {
      console.info(
        `[VectorStore] Initialized - pgvector: ${this.pgConnected}, qdrant: ${this.qdrantConnected}`
      )
    }

    return this.initialized
  }

  /**
   * Shutdown connections
   */
  async shutdown(): Promise<void> {
    console.info('[VectorStore] Shutting down...')

    if (this.pgPool) {
      await this.pgPool.end()
      this.pgPool = null
    }

    this.pgConnected = false
    this.qdrantConnected = false
    this.initialized = false

    console.info('[VectorStore] Shutdown complete')
  }

  /**
   * Store an embedding
   */
  async store(embedding: StoredEmbedding): Promise<boolean> {
    if (!this.initialized) {
      return false
    }

    const results = await Promise.allSettled([
      this.pgConnected ? this.storePgvector(embedding) : Promise.resolve(false),
      this.qdrantConnected ? this.storeQdrant(embedding) : Promise.resolve(false),
    ])

    const pgSuccess = results[0].status === 'fulfilled' && results[0].value
    const qdrantSuccess = results[1].status === 'fulfilled' && results[1].value

    return pgSuccess || qdrantSuccess
  }

  /**
   * Store multiple embeddings (batch)
   */
  async storeBatch(embeddings: StoredEmbedding[]): Promise<number> {
    if (!this.initialized || embeddings.length === 0) {
      return 0
    }

    let stored = 0

    // Process in batches of 100
    const batchSize = 100
    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize)

      const results = await Promise.allSettled([
        this.pgConnected ? this.storeBatchPgvector(batch) : Promise.resolve(0),
        this.qdrantConnected ? this.storeBatchQdrant(batch) : Promise.resolve(0),
      ])

      // Count successful stores (use max from either store)
      const pgCount = results[0].status === 'fulfilled' ? results[0].value : 0
      const qdrantCount = results[1].status === 'fulfilled' ? results[1].value : 0
      stored += Math.max(pgCount, qdrantCount)
    }

    return stored
  }

  /**
   * Search for similar embeddings
   */
  async search(
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      return []
    }

    const { limit = 10, threshold = 0.7, sourceType, sessionId, projectPath } = options

    // Try pgvector first, fall back to Qdrant
    if (this.pgConnected) {
      try {
        return await this.searchPgvector(queryEmbedding, {
          limit,
          threshold,
          sourceType,
          sessionId,
          projectPath,
          includeContent: options.includeContent,
        })
      } catch (error) {
        console.error('[VectorStore] pgvector search failed:', error)
      }
    }

    if (this.qdrantConnected) {
      try {
        return await this.searchQdrant(queryEmbedding, {
          limit,
          threshold,
          sourceType,
          sessionId,
          projectPath,
          includeContent: options.includeContent,
        })
      } catch (error) {
        console.error('[VectorStore] Qdrant search failed:', error)
      }
    }

    return []
  }

  /**
   * Delete embeddings by source ID
   */
  async deleteBySourceId(sourceId: string): Promise<number> {
    let deleted = 0

    if (this.pgConnected) {
      try {
        deleted += await this.deletePgvector({ sourceId })
      } catch (error) {
        console.error('[VectorStore] pgvector delete failed:', error)
      }
    }

    if (this.qdrantConnected) {
      try {
        deleted += await this.deleteQdrant({ sourceId })
      } catch (error) {
        console.error('[VectorStore] Qdrant delete failed:', error)
      }
    }

    return deleted
  }

  /**
   * Delete embeddings by session ID
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    let deleted = 0

    if (this.pgConnected) {
      try {
        deleted += await this.deletePgvector({ sessionId })
      } catch (error) {
        console.error('[VectorStore] pgvector delete failed:', error)
      }
    }

    if (this.qdrantConnected) {
      try {
        deleted += await this.deleteQdrant({ sessionId })
      } catch (error) {
        console.error('[VectorStore] Qdrant delete failed:', error)
      }
    }

    return deleted
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{
    pgvector: { connected: boolean; count: number }
    qdrant: { connected: boolean; count: number }
  }> {
    const stats = {
      pgvector: { connected: this.pgConnected, count: 0 },
      qdrant: { connected: this.qdrantConnected, count: 0 },
    }

    if (this.pgConnected && this.pgPool) {
      try {
        const result = await this.pgPool.query('SELECT COUNT(*) as count FROM embeddings')
        stats.pgvector.count = parseInt((result.rows[0] as { count: string }).count, 10)
      } catch {
        // Ignore
      }
    }

    if (this.qdrantConnected) {
      try {
        const response = await fetch(
          `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}`
        )
        if (response.ok) {
          const data = (await response.json()) as { result?: { points_count?: number } }
          stats.qdrant.count = data.result?.points_count || 0
        }
      } catch {
        // Ignore
      }
    }

    return stats
  }

  /**
   * Check connection health
   */
  getHealth(): { pgvector: boolean; qdrant: boolean; initialized: boolean } {
    return {
      pgvector: this.pgConnected,
      qdrant: this.qdrantConnected,
      initialized: this.initialized,
    }
  }

  // ============================================================================
  // PGVECTOR IMPLEMENTATION
  // ============================================================================

  private async initializePgvector(): Promise<boolean> {
    try {
      // Dynamic import to avoid hard dependency
      const { Pool } = await import('pg')

      this.pgPool = new Pool({
        connectionString: this.config.pgvectorUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })

      // Test connection
      const client = await this.pgPool.connect()

      try {
        // Create extension and table
        await client.query('CREATE EXTENSION IF NOT EXISTS vector')

        await client.query(`
          CREATE TABLE IF NOT EXISTS embeddings (
            id TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding vector(${this.config.dimensions}) NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            session_id TEXT,
            metadata JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)

        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_source_id ON embeddings (source_id)
        `)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_session_id ON embeddings (session_id)
        `)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_source_type ON embeddings (source_type)
        `)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash ON embeddings (content_hash)
        `)

        // Create HNSW index for fast similarity search
        if (this.config.useHnswIndex) {
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
            ON embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 100)
          `).catch(() => {
            // Index might already exist or HNSW not available
            console.warn('[VectorStore] HNSW index creation skipped')
          })
        }

        console.info('[VectorStore] pgvector initialized')
        return true
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('[VectorStore] pgvector initialization failed:', error)
      return false
    }
  }

  private async storePgvector(embedding: StoredEmbedding): Promise<boolean> {
    if (!this.pgPool) return false

    try {
      const vectorString = `[${embedding.embedding.join(',')}]`

      await this.pgPool.query(
        `
        INSERT INTO embeddings (id, content_hash, content, embedding, source_type, source_id, session_id, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, to_timestamp($9/1000.0), to_timestamp($10/1000.0))
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
        `,
        [
          embedding.id,
          embedding.contentHash,
          embedding.content,
          vectorString,
          embedding.sourceType,
          embedding.sourceId,
          embedding.sessionId || null,
          JSON.stringify(embedding.metadata),
          embedding.createdAt,
          embedding.updatedAt,
        ]
      )

      return true
    } catch (error) {
      console.error('[VectorStore] pgvector store failed:', error)
      return false
    }
  }

  private async storeBatchPgvector(embeddings: StoredEmbedding[]): Promise<number> {
    if (!this.pgPool || embeddings.length === 0) return 0

    const client = await this.pgPool.connect()

    try {
      await client.query('BEGIN')

      for (const embedding of embeddings) {
        const vectorString = `[${embedding.embedding.join(',')}]`

        await client.query(
          `
          INSERT INTO embeddings (id, content_hash, content, embedding, source_type, source_id, session_id, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, to_timestamp($9/1000.0), to_timestamp($10/1000.0))
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
          `,
          [
            embedding.id,
            embedding.contentHash,
            embedding.content,
            vectorString,
            embedding.sourceType,
            embedding.sourceId,
            embedding.sessionId || null,
            JSON.stringify(embedding.metadata),
            embedding.createdAt,
            embedding.updatedAt,
          ]
        )
      }

      await client.query('COMMIT')
      return embeddings.length
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('[VectorStore] pgvector batch store failed:', error)
      return 0
    } finally {
      client.release()
    }
  }

  private async searchPgvector(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    if (!this.pgPool) return []

    const { limit = 10, threshold = 0.7, sourceType, sessionId, projectPath, includeContent } =
      options

    const vectorString = `[${queryEmbedding.join(',')}]`

    // Build WHERE clause
    const conditions: string[] = []
    const params: unknown[] = [vectorString, limit]
    let paramIndex = 3

    if (sourceType) {
      conditions.push(`source_type = $${paramIndex}`)
      params.push(sourceType)
      paramIndex++
    }

    if (sessionId) {
      conditions.push(`session_id = $${paramIndex}`)
      params.push(sessionId)
      paramIndex++
    }

    if (projectPath) {
      conditions.push(`metadata->>'projectPath' = $${paramIndex}`)
      params.push(projectPath)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const contentSelect = includeContent ? ', content' : ''

    const result = await this.pgPool.query(
      `
      SELECT
        id,
        1 - (embedding <=> $1::vector) as score,
        metadata
        ${contentSelect}
      FROM embeddings
      ${whereClause}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
      `,
      params
    )

    return (result.rows as Array<{ id: string; score: number; metadata: string; content?: string }>)
      .filter((row) => row.score >= threshold)
      .map((row) => ({
        id: row.id,
        score: row.score,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        content: row.content,
      }))
  }

  private async deletePgvector(filter: {
    sourceId?: string
    sessionId?: string
  }): Promise<number> {
    if (!this.pgPool) return 0

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (filter.sourceId) {
      conditions.push(`source_id = $${paramIndex}`)
      params.push(filter.sourceId)
      paramIndex++
    }

    if (filter.sessionId) {
      conditions.push(`session_id = $${paramIndex}`)
      params.push(filter.sessionId)
      paramIndex++
    }

    if (conditions.length === 0) return 0

    const result = await this.pgPool.query(
      `DELETE FROM embeddings WHERE ${conditions.join(' AND ')}`,
      params
    )

    return result.rowCount
  }

  // ============================================================================
  // QDRANT IMPLEMENTATION
  // ============================================================================

  private async initializeQdrant(): Promise<boolean> {
    try {
      // Check if Qdrant is reachable
      const healthResponse = await fetch(`${this.config.qdrantUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      })

      if (!healthResponse.ok) {
        throw new Error('Qdrant health check failed')
      }

      // Create or verify collection
      const collectionResponse = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}`
      )

      if (!collectionResponse.ok) {
        // Create collection
        const createResponse = await fetch(
          `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vectors: {
                size: this.config.dimensions,
                distance: 'Cosine',
              },
              optimizers_config: {
                indexing_threshold: 10000,
              },
              quantization_config: {
                scalar: {
                  type: 'int8',
                  quantile: 0.99,
                  always_ram: true,
                },
              },
            }),
          }
        )

        if (!createResponse.ok) {
          const error = await createResponse.text()
          throw new Error(`Failed to create collection: ${error}`)
        }

        // Create payload indexes
        await this.createQdrantPayloadIndex('source_type', 'keyword')
        await this.createQdrantPayloadIndex('session_id', 'keyword')
        await this.createQdrantPayloadIndex('source_id', 'keyword')
      }

      console.info('[VectorStore] Qdrant initialized')
      return true
    } catch (error) {
      console.error('[VectorStore] Qdrant initialization failed:', error)
      return false
    }
  }

  private async createQdrantPayloadIndex(
    fieldName: string,
    fieldType: 'keyword' | 'integer' | 'float' | 'bool'
  ): Promise<void> {
    try {
      await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/index`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field_name: fieldName,
            field_schema: fieldType,
          }),
        }
      )
    } catch {
      // Index might already exist
    }
  }

  private async storeQdrant(embedding: StoredEmbedding): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [
              {
                id: embedding.id,
                vector: embedding.embedding,
                payload: {
                  content_hash: embedding.contentHash,
                  content: embedding.content,
                  source_type: embedding.sourceType,
                  source_id: embedding.sourceId,
                  session_id: embedding.sessionId,
                  metadata: embedding.metadata,
                  created_at: embedding.createdAt,
                  updated_at: embedding.updatedAt,
                },
              },
            ],
          }),
        }
      )

      return response.ok
    } catch (error) {
      console.error('[VectorStore] Qdrant store failed:', error)
      return false
    }
  }

  private async storeBatchQdrant(embeddings: StoredEmbedding[]): Promise<number> {
    try {
      const points = embeddings.map((embedding) => ({
        id: embedding.id,
        vector: embedding.embedding,
        payload: {
          content_hash: embedding.contentHash,
          content: embedding.content,
          source_type: embedding.sourceType,
          source_id: embedding.sourceId,
          session_id: embedding.sessionId,
          metadata: embedding.metadata,
          created_at: embedding.createdAt,
          updated_at: embedding.updatedAt,
        },
      }))

      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        }
      )

      return response.ok ? embeddings.length : 0
    } catch (error) {
      console.error('[VectorStore] Qdrant batch store failed:', error)
      return 0
    }
  }

  private async searchQdrant(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    try {
      const { limit = 10, threshold = 0.7, sourceType, sessionId, projectPath, includeContent } =
        options

      // Build filter
      const must: Array<{ key: string; match: { value: string } }> = []

      if (sourceType) {
        must.push({ key: 'source_type', match: { value: sourceType } })
      }
      if (sessionId) {
        must.push({ key: 'session_id', match: { value: sessionId } })
      }
      if (projectPath) {
        must.push({ key: 'metadata.projectPath', match: { value: projectPath } })
      }

      const filter = must.length > 0 ? { must } : undefined

      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryEmbedding,
            limit,
            score_threshold: threshold,
            filter,
            with_payload: true,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`)
      }

      const data = (await response.json()) as {
        result: Array<{
          id: string
          score: number
          payload: {
            content?: string
            metadata: ChunkMetadata
          }
        }>
      }

      return data.result.map((hit) => ({
        id: String(hit.id),
        score: hit.score,
        metadata: hit.payload.metadata,
        content: includeContent ? hit.payload.content : undefined,
      }))
    } catch (error) {
      console.error('[VectorStore] Qdrant search failed:', error)
      return []
    }
  }

  private async deleteQdrant(filter: {
    sourceId?: string
    sessionId?: string
  }): Promise<number> {
    try {
      const must: Array<{ key: string; match: { value: string } }> = []

      if (filter.sourceId) {
        must.push({ key: 'source_id', match: { value: filter.sourceId } })
      }
      if (filter.sessionId) {
        must.push({ key: 'session_id', match: { value: filter.sessionId } })
      }

      if (must.length === 0) return 0

      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { must },
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`)
      }

      // Qdrant doesn't return count, estimate
      return 1
    } catch (error) {
      console.error('[VectorStore] Qdrant delete failed:', error)
      return 0
    }
  }
}

// Export factory function
export function createVectorStore(config?: Partial<VectorStoreConfig>): VectorStore {
  return new VectorStore(config)
}
