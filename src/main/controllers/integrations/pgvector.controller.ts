/**
 * PgVector Controller
 *
 * Type-safe tRPC controller for PostgreSQL vector operations.
 * Manages vector embeddings, collections, and indexes for semantic search.
 *
 * Migrated from handlers.ts (6 handlers):
 * - pgvector:status
 * - pgvector:embed
 * - pgvector:collections
 * - pgvector:rebuildIndex
 * - pgvector:vacuum
 * - pgvector:getAutoConfig
 *
 * @module pgvector.controller
 */

import { z } from 'zod'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { postgresService } from '../../services/postgresql'
import type {
  PgVectorStatus,
  PgVectorCollection,
  PgVectorAutoEmbedConfig,
  PgVectorIndexConfig,
  PgVectorSearchResult,
  VectorIndexType,
} from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const PGVECTOR_CONFIG_PATH = join(HOME, '.config', 'claude-pilot', 'pgvector.json')
const OLLAMA_API = 'http://localhost:11434'

const defaultPgVectorConfig: PgVectorAutoEmbedConfig = {
  enableLearnings: true,
  enableSessions: false,
  enableCode: false,
  enableCommits: false,
  embeddingModel: 'nomic-embed-text',
  batchSize: 10,
  concurrentRequests: 2,
  rateLimit: 100,
}

// ============================================================================
// Schemas
// ============================================================================

const TableNameSchema = z.object({
  table: z
    .string()
    .min(1, 'Table name cannot be empty')
    .max(100, 'Table name cannot exceed 100 characters')
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      'Table name must start with a letter or underscore and contain only alphanumeric characters and underscores'
    ),
})

const EmbedTextSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty').max(32000, 'Text cannot exceed 32000 characters'),
})

const IndexConfigSchema = z.object({
  table: z
    .string()
    .min(1, 'Table name cannot be empty')
    .max(100, 'Table name cannot exceed 100 characters')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name format'),
  config: z.object({
    type: z.enum(['hnsw', 'ivfflat', 'none']),
    m: z.number().int().min(2).max(100).optional(),
    efConstruction: z.number().int().min(4).max(1000).optional(),
    efSearch: z.number().int().min(1).max(1000).optional(),
    lists: z.number().int().min(1).max(10000).optional(),
    probes: z.number().int().min(1).max(1000).optional(),
  }),
})

const SearchSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  table: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  threshold: z.number().min(0).max(1).default(0.5),
})

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Get pgvector configuration from disk
 */
function getPgVectorConfig(): PgVectorAutoEmbedConfig {
  try {
    if (existsSync(PGVECTOR_CONFIG_PATH)) {
      return {
        ...defaultPgVectorConfig,
        ...JSON.parse(readFileSync(PGVECTOR_CONFIG_PATH, 'utf-8')),
      }
    }
  } catch (error) {
    console.error('[pgvector] Failed to load config:', error)
  }
  return { ...defaultPgVectorConfig }
}

/**
 * Save pgvector configuration to disk
 */
function savePgVectorConfig(config: PgVectorAutoEmbedConfig): boolean {
  try {
    const configDir = join(HOME, '.config', 'claude-pilot')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(PGVECTOR_CONFIG_PATH, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    console.error('[pgvector] Failed to save config:', error)
    return false
  }
}

/**
 * Generate embedding using Ollama
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_API}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest',
        prompt: text,
      }),
    })

    if (response.ok) {
      const data = (await response.json()) as { embedding?: number[] }
      return data.embedding || null
    }
  } catch (error) {
    console.error('[pgvector] Failed to generate embedding with Ollama:', error)
  }
  return null
}

/**
 * Check pgvector extension status and get collections
 */
async function checkPgVectorStatus(): Promise<PgVectorStatus> {
  const config = getPgVectorConfig()
  const status: PgVectorStatus = {
    enabled: false,
    defaultDimensions: 768, // nomic-embed-text dimensions
    embeddingModel: config.embeddingModel,
    collections: [],
  }

  try {
    await postgresService.connect()

    // Check if pgvector extension exists
    const extResult = await postgresService.query<{ version: string }>(
      `SELECT extversion as version FROM pg_extension WHERE extname = 'vector'`
    )

    if (extResult.length > 0) {
      status.enabled = true
      status.version = extResult[0].version
    }

    // Get all tables with vector columns
    if (status.enabled) {
      const tableResult = await postgresService.query<{
        table_name: string
        column_name: string
        dimensions: number
      }>(
        `SELECT c.relname as table_name, a.attname as column_name,
                CASE WHEN typname = 'vector' THEN atttypmod ELSE 0 END as dimensions
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid
         JOIN pg_type t ON t.oid = a.atttypid
         WHERE t.typname = 'vector' AND c.relkind = 'r'
         ORDER BY c.relname`
      )

      for (const row of tableResult) {
        // Get count and size for each table
        const countResult = await postgresService.queryScalar<number>(
          `SELECT COUNT(*) FROM "${row.table_name}"`
        )

        const sizeResult = await postgresService.queryScalar<string>(
          `SELECT pg_size_pretty(pg_table_size($1))`,
          [row.table_name]
        )

        // Check for index
        const indexResult = await postgresService.query<{
          indexname: string
          indexdef: string
        }>(
          `SELECT indexname, indexdef FROM pg_indexes
           WHERE tablename = $1 AND indexdef LIKE '%vector%'`,
          [row.table_name]
        )

        let indexType: VectorIndexType = 'none'
        let indexName: string | undefined
        if (indexResult.length > 0) {
          indexName = indexResult[0].indexname
          if (indexResult[0].indexdef.toLowerCase().includes('hnsw')) {
            indexType = 'hnsw'
          } else if (indexResult[0].indexdef.toLowerCase().includes('ivfflat')) {
            indexType = 'ivfflat'
          }
        }

        status.collections.push({
          name: row.table_name,
          tableName: row.table_name,
          vectorCount: countResult || 0,
          dimensions: row.dimensions || 768,
          indexType,
          indexName,
          sizeBytes: parseInt(sizeResult?.replace(/[^\d]/g, '') || '0') * 1024, // rough estimate
        })
      }
    }
  } catch (error) {
    console.error('[pgvector] Failed to check status:', error)
  }

  return status
}

/**
 * Create or rebuild index on a vector table
 */
async function createPgVectorIndex(
  tableName: string,
  config: PgVectorIndexConfig
): Promise<boolean> {
  try {
    await postgresService.connect()

    // Find the vector column
    const colsResult = await postgresService.query<{ column_name: string }>(
      `SELECT a.attname as column_name
       FROM pg_class c
       JOIN pg_attribute a ON a.attrelid = c.oid
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE c.relname = $1 AND t.typname = 'vector'`,
      [tableName]
    )

    if (colsResult.length === 0) {
      console.error('[pgvector] No vector column found in table:', tableName)
      return false
    }

    const vectorCol = colsResult[0].column_name
    const indexName = `idx_${tableName}_${vectorCol}_${config.type}`

    // Drop existing index if any
    await postgresService.queryRaw(`DROP INDEX IF EXISTS "${indexName}"`)

    if (config.type === 'none') {
      return true // Just dropped the index
    }

    // Build index creation query
    let indexSql: string
    if (config.type === 'hnsw') {
      const m = config.m || 16
      const efConstruction = config.efConstruction || 64
      indexSql = `CREATE INDEX "${indexName}" ON "${tableName}"
                  USING hnsw ("${vectorCol}" vector_cosine_ops)
                  WITH (m = ${m}, ef_construction = ${efConstruction})`
    } else {
      const lists = config.lists || 100
      indexSql = `CREATE INDEX "${indexName}" ON "${tableName}"
                  USING ivfflat ("${vectorCol}" vector_cosine_ops)
                  WITH (lists = ${lists})`
    }

    await postgresService.queryRaw(indexSql)
    return true
  } catch (error) {
    console.error('[pgvector] Failed to create index:', error)
    return false
  }
}

/**
 * Vacuum analyze a table for optimal performance
 */
async function vacuumPgVectorTable(tableName: string): Promise<boolean> {
  try {
    await postgresService.connect()
    // VACUUM cannot be run in a transaction, so we use a raw query
    await postgresService.queryRaw(`VACUUM ANALYZE "${tableName}"`)
    return true
  } catch (error) {
    console.error('[pgvector] Failed to vacuum table:', error)
    return false
  }
}

/**
 * Semantic search across vector tables
 */
async function searchPgVectors(
  query: string,
  tableName?: string,
  limit = 20,
  threshold = 0.5
): Promise<PgVectorSearchResult[]> {
  const results: PgVectorSearchResult[] = []

  try {
    // Generate embedding using Ollama
    const embedding = await generateEmbedding(query)
    if (!embedding || embedding.length === 0) {
      console.info('[pgvector] No embedding generated, falling back to text search')
      return results
    }

    await postgresService.connect()

    // If no table specified, search all tables with vectors
    let tables: string[] = []
    if (tableName) {
      tables = [tableName]
    } else {
      const tablesResult = await postgresService.query<{ table_name: string }>(
        `SELECT DISTINCT c.relname as table_name
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid
         JOIN pg_type t ON t.oid = a.atttypid
         WHERE t.typname = 'vector' AND c.relkind = 'r'`
      )
      tables = tablesResult.map((r) => r.table_name)
    }

    for (const table of tables) {
      try {
        // Find the vector column and content column
        const colsResult = await postgresService.query<{
          column_name: string
          data_type: string
        }>(
          `SELECT column_name, data_type FROM information_schema.columns
           WHERE table_name = $1`,
          [table]
        )

        const vectorCol =
          colsResult.find((c) => c.data_type === 'USER-DEFINED')?.column_name || 'embedding'
        const contentCol =
          colsResult.find((c) => c.column_name === 'content' || c.column_name === 'text')
            ?.column_name || 'content'
        const idCol = colsResult.find((c) => c.column_name === 'id')?.column_name || 'id'

        // Search for similar vectors
        const embeddingStr = `[${embedding.join(',')}]`
        const searchResult = await postgresService.query<{
          id: string | number
          content: string
          similarity: number
        }>(
          `SELECT "${idCol}" as id, "${contentCol}" as content,
                  1 - ("${vectorCol}" <=> $1::vector) as similarity
           FROM "${table}"
           WHERE 1 - ("${vectorCol}" <=> $1::vector) >= $2
           ORDER BY "${vectorCol}" <=> $1::vector
           LIMIT $3`,
          [embeddingStr, threshold, limit]
        )

        for (const row of searchResult) {
          results.push({
            id: row.id,
            tableName: table,
            content: row.content || '',
            similarity: row.similarity,
          })
        }
      } catch (error) {
        console.error(`[pgvector] Failed to search table ${table}:`, error)
      }
    }

    // Sort all results by similarity
    results.sort((a, b) => b.similarity - a.similarity)
    return results.slice(0, limit)
  } catch (error) {
    console.error('[pgvector] Search failed:', error)
    return results
  }
}

// ============================================================================
// Router
// ============================================================================

export const pgvectorRouter = router({
  /**
   * Get pgvector extension status and collections
   */
  status: publicProcedure.query((): Promise<PgVectorStatus> => {
    return checkPgVectorStatus()
  }),

  /**
   * Generate embedding for text using Ollama
   */
  embed: publicProcedure.input(EmbedTextSchema).query(({ input }): Promise<number[] | null> => {
    return generateEmbedding(input.text)
  }),

  /**
   * Get list of vector collections
   */
  collections: publicProcedure.query(async (): Promise<PgVectorCollection[]> => {
    const status = await checkPgVectorStatus()
    return status.collections
  }),

  /**
   * Rebuild index on a vector table
   */
  rebuildIndex: auditedProcedure
    .input(TableNameSchema)
    .mutation(async ({ input }): Promise<boolean> => {
      // Get current index config and rebuild
      const status = await checkPgVectorStatus()
      const collection = status.collections.find((c) => c.tableName === input.table)
      if (!collection || collection.indexType === 'none') {
        return false
      }
      return createPgVectorIndex(input.table, { type: collection.indexType })
    }),

  /**
   * Vacuum analyze a table for optimal performance
   */
  vacuum: auditedProcedure.input(TableNameSchema).mutation(({ input }): Promise<boolean> => {
    return vacuumPgVectorTable(input.table)
  }),

  /**
   * Get auto-embedding configuration
   */
  getAutoConfig: publicProcedure.query((): PgVectorAutoEmbedConfig => {
    return getPgVectorConfig()
  }),

  /**
   * Update auto-embedding configuration
   */
  setAutoConfig: auditedProcedure
    .input(
      z.object({
        config: z.object({
          enableLearnings: z.boolean(),
          enableSessions: z.boolean(),
          enableCode: z.boolean(),
          enableCommits: z.boolean(),
          embeddingModel: z.string().min(1),
          batchSize: z.number().int().min(1).max(100),
          concurrentRequests: z.number().int().min(1).max(10),
          rateLimit: z.number().int().min(1).max(1000),
        }),
      })
    )
    .mutation(({ input }): boolean => {
      return savePgVectorConfig(input.config)
    }),

  /**
   * Create or update index on a table
   */
  createIndex: auditedProcedure.input(IndexConfigSchema).mutation(({ input }): Promise<boolean> => {
    return createPgVectorIndex(input.table, input.config)
  }),

  /**
   * Semantic search across vector tables
   */
  search: publicProcedure
    .input(SearchSchema)
    .query(({ input }): Promise<PgVectorSearchResult[]> => {
      return searchPgVectors(input.query, input.table, input.limit, input.threshold)
    }),
})
