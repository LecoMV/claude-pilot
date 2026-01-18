/**
 * Memory Controller - Unified Memory System Access
 *
 * REFACTORED: Eliminated all execSync calls for enterprise-grade async operations.
 * Uses native database services instead of shell commands.
 *
 * @see src/main/services/postgresql.ts
 * @see src/main/services/memgraph.ts
 * @see src/main/services/memory/qdrant.service.ts
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import { memgraphService } from '../services/memgraph'
import { postgresService } from '../services/postgresql'
import QdrantService from '../services/memory/qdrant.service'
import type { Learning } from '../../shared/types'

// ============================================================================
// SCHEMAS
// ============================================================================

const LearningsQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.number().min(1).max(500).default(50),
  category: z.string().optional(),
})

type MemoryStats = {
  postgresql: { count: number }
  memgraph: { nodes: number; edges: number }
  qdrant: { vectors: number }
}

const GraphQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.number().min(1).max(1000).default(100),
})

const QdrantBrowseSchema = z.object({
  collection: z.string().default('mem0_memories'),
  limit: z.number().min(1).max(100).default(50),
  offset: z.string().optional(),
})

const QdrantSearchSchema = z.object({
  query: z.string().min(1),
  collection: z.string().default('mem0_memories'),
  limit: z.number().min(1).max(100).default(20),
})

const MemgraphSearchSchema = z.object({
  keyword: z.string().min(1),
  nodeType: z.string().optional(),
  limit: z.number().min(1).max(500).default(50),
})

const RawQuerySchema = z.object({
  source: z.enum(['postgresql', 'memgraph', 'qdrant']),
  query: z.string().min(1).max(10000),
})

const UnifiedSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(100).default(20),
})

// ============================================================================
// ASYNC HELPER FUNCTIONS (No execSync!)
// ============================================================================

/**
 * Query learnings using native pg driver (NOT shell command)
 */
async function queryLearningsAsync(
  query?: string,
  limit = 50,
  category?: string
): Promise<Learning[]> {
  try {
    // Ensure connection
    const connected = await postgresService.connect()
    if (!connected) {
      console.warn('[Memory] PostgreSQL not connected')
      return []
    }

    // Build parameterized query
    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (query && query.trim()) {
      conditions.push(`(topic ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`)
      params.push(`%${query}%`)
      paramIndex++
    }

    if (category && category.trim()) {
      conditions.push(`category = $${paramIndex}`)
      params.push(category)
      paramIndex++
    }

    let sql = 'SELECT id, topic, content, category, created_at FROM learnings'
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`
    params.push(limit)

    const rows = await postgresService.query<{
      id: number
      topic: string
      content: string
      category: string
      created_at: string
    }>(sql, params)

    return rows.map((row) => ({
      id: row.id,
      topic: row.topic || '',
      content: row.content || '',
      category: row.category || 'general',
      createdAt: row.created_at || new Date().toISOString(),
      source: row.topic || undefined,
    }))
  } catch (error) {
    console.error('[Memory] Failed to query learnings:', error)
    return []
  }
}

/**
 * Get memory stats using native clients (NOT shell commands)
 */
async function getMemoryStatsAsync(): Promise<MemoryStats> {
  const stats: MemoryStats = {
    postgresql: { count: 0 },
    memgraph: { nodes: 0, edges: 0 },
    qdrant: { vectors: 0 },
  }

  // All checks in parallel
  const [pgCount, mgStats, qdrantStats] = await Promise.allSettled([
    // PostgreSQL - native pg driver
    (async () => {
      await postgresService.connect()
      return postgresService.queryScalar<number>('SELECT COUNT(*) FROM learnings')
    })(),

    // Memgraph - native neo4j driver
    (async () => {
      await memgraphService.connect()
      return memgraphService.getStats()
    })(),

    // Qdrant - native client
    (async () => {
      const qdrant = QdrantService.getInstance()
      const collections = await qdrant.listCollections()
      let total = 0
      for (const name of collections) {
        try {
          const colStats = await qdrant.getCollectionStats(
            name as 'claude_memories' | 'mem0_memories'
          )
          total += colStats.pointsCount
        } catch {
          // Skip failed collection
        }
      }
      return total
    })(),
  ])

  if (pgCount.status === 'fulfilled' && pgCount.value !== null) {
    stats.postgresql.count = pgCount.value
  }

  if (mgStats.status === 'fulfilled') {
    stats.memgraph.nodes = mgStats.value.nodes
    stats.memgraph.edges = mgStats.value.edges
  }

  if (qdrantStats.status === 'fulfilled') {
    stats.qdrant.vectors = qdrantStats.value
  }

  return stats
}

/**
 * Generate embedding using native fetch (NOT curl)
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest',
        prompt: text,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      const data = (await response.json()) as { embedding?: number[] }
      return data.embedding || null
    }
  } catch (error) {
    console.error('[Memory] Failed to generate embedding:', error)
  }
  return null
}

async function searchQdrantMemories(
  query: string,
  collection: string,
  limit: number
): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
  try {
    const embedding = await generateEmbedding(query)

    if (embedding && embedding.length > 0) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const searchResponse = await fetch(
        `http://localhost:6333/collections/${collection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embedding,
            limit,
            with_payload: true,
            with_vector: false,
            score_threshold: 0.3,
          }),
          signal: controller.signal,
        }
      )

      clearTimeout(timeout)

      if (searchResponse.ok) {
        const data = (await searchResponse.json()) as {
          result?: Array<{ id: string; score: number; payload: Record<string, unknown> }>
        }
        if (data.result) {
          return data.result.map((p) => ({
            id: String(p.id),
            score: p.score,
            payload: p.payload,
          }))
        }
      }
    }

    // Fallback to keyword search
    console.info('[Qdrant] Falling back to keyword search')
    const scrollResponse = await fetch(
      `http://localhost:6333/collections/${collection}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: limit * 5,
          with_payload: true,
          with_vector: false,
        }),
      }
    )

    if (scrollResponse.ok) {
      const data = (await scrollResponse.json()) as {
        result?: { points?: Array<{ id: string; payload: Record<string, unknown> }> }
      }
      const queryLower = query.toLowerCase()

      if (data.result?.points) {
        return data.result.points
          .filter((p) => {
            const dataStr = String(p.payload?.data || '').toLowerCase()
            return dataStr.includes(queryLower)
          })
          .slice(0, limit)
          .map((p, index) => ({
            id: String(p.id),
            score: 0.5 - index * 0.01,
            payload: p.payload,
          }))
      }
    }
  } catch (error) {
    console.error('[Memory] Failed to search Qdrant:', error)
  }

  return []
}

async function searchMemgraphNodes(
  keyword: string,
  nodeType?: string,
  limit = 50
): Promise<
  Array<{
    id: string
    label: string
    type: string
    properties: Record<string, unknown>
    score?: number
  }>
> {
  try {
    await memgraphService.connect()

    const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9\s-_]/g, '')
    let cypher: string

    if (nodeType) {
      cypher = `
        MATCH (n:${nodeType})
        WHERE n.name =~ '(?i).*${sanitizedKeyword}.*'
           OR n.instruction =~ '(?i).*${sanitizedKeyword}.*'
           OR n.output =~ '(?i).*${sanitizedKeyword}.*'
        RETURN n, labels(n) as labels
        LIMIT ${limit}
      `
    } else {
      cypher = `
        MATCH (n)
        WHERE n.name =~ '(?i).*${sanitizedKeyword}.*'
           OR n.instruction =~ '(?i).*${sanitizedKeyword}.*'
           OR n.output =~ '(?i).*${sanitizedKeyword}.*'
        RETURN n, labels(n) as labels
        LIMIT ${limit}
      `
    }

    const results = await memgraphService.query(cypher)

    return results.map((row) => {
      const node = row.n as { id: number; properties: Record<string, unknown> }
      const labels = row.labels as string[]
      return {
        id: String(node.id),
        label: String(node.properties?.name || node.properties?.instruction || `Node ${node.id}`),
        type: labels[0] || 'Unknown',
        properties: node.properties,
      }
    })
  } catch (error) {
    console.error('[Memory] Failed to search Memgraph:', error)
    return []
  }
}

// Dangerous query patterns to block
const DANGEROUS_PATTERNS = [
  /drop\s+/i,
  /truncate\s+/i,
  /delete\s+from\s+\w+\s*$/i,
  /alter\s+/i,
  /create\s+role/i,
  /grant\s+/i,
  /revoke\s+/i,
]

function isQuerySafe(query: string): boolean {
  return !DANGEROUS_PATTERNS.some((pattern) => pattern.test(query))
}

async function executeRawQuery(
  source: 'postgresql' | 'memgraph' | 'qdrant',
  query: string
): Promise<{
  success: boolean
  data: unknown
  error?: string
  executionTime: number
}> {
  const start = Date.now()

  if (!isQuerySafe(query)) {
    return {
      success: false,
      data: null,
      error: 'Query contains potentially dangerous operations',
      executionTime: Date.now() - start,
    }
  }

  try {
    switch (source) {
      case 'postgresql': {
        await postgresService.connect()
        const result = await postgresService.query(query)
        return {
          success: true,
          data: result,
          executionTime: Date.now() - start,
        }
      }

      case 'memgraph': {
        await memgraphService.connect()
        const result = await memgraphService.query(query)
        return {
          success: true,
          data: result,
          executionTime: Date.now() - start,
        }
      }

      case 'qdrant': {
        return {
          success: false,
          data: null,
          error: 'Qdrant does not support raw queries. Use the search or browse endpoints.',
          executionTime: Date.now() - start,
        }
      }

      default:
        return {
          success: false,
          data: null,
          error: `Unknown source: ${source}`,
          executionTime: Date.now() - start,
        }
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - start,
    }
  }
}

/**
 * Health check using native clients (NOT shell commands)
 */
async function checkHealthAsync(): Promise<{
  postgresql: boolean
  memgraph: boolean
  qdrant: boolean
  ollama: boolean
}> {
  const [pg, mg, qd, ol] = await Promise.allSettled([
    // PostgreSQL - native driver
    postgresService.isConnected(),

    // Memgraph - native driver
    memgraphService.isConnected(),

    // Qdrant - native client
    QdrantService.getInstance().healthCheck(),

    // Ollama - native fetch
    (async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      const response = await fetch('http://localhost:11434/api/tags', {
        signal: controller.signal,
      })
      clearTimeout(timeout)
      return response.ok
    })(),
  ])

  return {
    postgresql: pg.status === 'fulfilled' && pg.value,
    memgraph: mg.status === 'fulfilled' && mg.value,
    qdrant: qd.status === 'fulfilled' && qd.value,
    ollama: ol.status === 'fulfilled' && ol.value,
  }
}

// ============================================================================
// MEMORY ROUTER (All procedures now async)
// ============================================================================

export const memoryRouter = router({
  /**
   * Query learnings from PostgreSQL
   */
  learnings: publicProcedure.input(LearningsQuerySchema).query(({ input }) => {
    return queryLearningsAsync(input.query, input.limit, input.category)
  }),

  /**
   * Get memory statistics across all sources
   */
  stats: auditedProcedure.query(() => {
    return getMemoryStatsAsync()
  }),

  /**
   * Query Memgraph knowledge graph
   */
  graph: auditedProcedure.input(GraphQuerySchema).query(async ({ input }) => {
    try {
      await memgraphService.connect()

      if (input.query && input.query.trim()) {
        const results = await memgraphService.query(input.query)
        const nodes: Array<{
          id: string
          label: string
          type: string
          properties: Record<string, unknown>
        }> = []
        const edges: Array<{
          id: string
          source: string
          target: string
          type: string
          properties: Record<string, unknown>
        }> = []

        for (const row of results) {
          for (const value of Object.values(row)) {
            if (value && typeof value === 'object' && 'id' in value && 'labels' in value) {
              const node = value as {
                id: number
                labels: string[]
                properties: Record<string, unknown>
              }
              nodes.push({
                id: String(node.id),
                label: String(node.properties.name || node.properties.title || `Node ${node.id}`),
                type: node.labels[0] || 'Unknown',
                properties: node.properties,
              })
            }
          }
        }

        return { nodes, edges }
      }

      return await memgraphService.getSampleGraph(input.limit)
    } catch (error) {
      console.error('[Memory] Failed to query Memgraph:', error)
      return { nodes: [], edges: [] }
    }
  }),

  /**
   * Browse Qdrant memories with pagination
   */
  qdrantBrowse: auditedProcedure.input(QdrantBrowseSchema).query(async ({ input }) => {
    try {
      const body: Record<string, unknown> = {
        limit: input.limit,
        with_payload: true,
        with_vector: false,
      }
      if (input.offset) {
        body.offset = input.offset
      }

      const response = await fetch(
        `http://localhost:6333/collections/${input.collection}/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )

      if (response.ok) {
        const data = (await response.json()) as {
          result?: {
            points?: Array<{ id: string; payload: Record<string, unknown> }>
            next_page_offset?: string
          }
        }
        return {
          points: (data.result?.points || []).map((p) => ({
            id: String(p.id),
            payload: p.payload,
            created_at: p.payload?.created_at as string | undefined,
          })),
          nextOffset: data.result?.next_page_offset || null,
        }
      }

      return { points: [], nextOffset: null }
    } catch (error) {
      console.error('[Memory] Failed to browse Qdrant:', error)
      return { points: [], nextOffset: null }
    }
  }),

  /**
   * Semantic search in Qdrant using Ollama embeddings
   */
  qdrantSearch: auditedProcedure.input(QdrantSearchSchema).query(async ({ input }) => {
    const results = await searchQdrantMemories(input.query, input.collection, input.limit)
    return { results }
  }),

  /**
   * Search Memgraph nodes by keyword
   */
  memgraphSearch: auditedProcedure.input(MemgraphSearchSchema).query(async ({ input }) => {
    const results = await searchMemgraphNodes(input.keyword, input.nodeType, input.limit)
    return { results }
  }),

  /**
   * Execute raw query (with safety checks)
   */
  raw: auditedProcedure.input(RawQuerySchema).mutation(async ({ input }) => {
    const result = await executeRawQuery(input.source, input.query)
    return result
  }),

  /**
   * Unified federated search across all memory sources
   */
  unifiedSearch: auditedProcedure.input(UnifiedSearchSchema).query(async ({ input }) => {
    const startTime = Date.now()
    const stats = { postgresql: 0, memgraph: 0, qdrant: 0, totalTime: 0 }

    const results: Array<{
      id: string
      source: 'postgresql' | 'memgraph' | 'qdrant'
      title: string
      content: string
      score: number
      metadata: Record<string, unknown>
    }> = []

    // Search all sources in parallel
    const [pgResults, mgResults, qdResults] = await Promise.allSettled([
      // PostgreSQL learnings
      (async () => {
        const pgStart = Date.now()
        const learnings = await queryLearningsAsync(input.query, input.limit)
        stats.postgresql = Date.now() - pgStart
        return learnings
      })(),

      // Memgraph nodes
      (async () => {
        const mgStart = Date.now()
        const nodes = await searchMemgraphNodes(input.query, undefined, input.limit)
        stats.memgraph = Date.now() - mgStart
        return nodes
      })(),

      // Qdrant vectors
      (async () => {
        const qdStart = Date.now()
        const points = await searchQdrantMemories(input.query, 'claude_memories', input.limit)
        stats.qdrant = Date.now() - qdStart
        return points
      })(),
    ])

    // Process PostgreSQL results
    if (pgResults.status === 'fulfilled') {
      for (const learning of pgResults.value) {
        results.push({
          id: `pg-${learning.id}`,
          source: 'postgresql',
          title: learning.topic,
          content: learning.content,
          score: 0.8,
          metadata: { category: learning.category, createdAt: learning.createdAt },
        })
      }
    }

    // Process Memgraph results
    if (mgResults.status === 'fulfilled') {
      for (const node of mgResults.value) {
        results.push({
          id: `mg-${node.id}`,
          source: 'memgraph',
          title: node.label,
          content: String(node.properties.instruction || node.properties.output || ''),
          score: 0.7,
          metadata: { type: node.type, ...node.properties },
        })
      }
    }

    // Process Qdrant results
    if (qdResults.status === 'fulfilled') {
      for (const point of qdResults.value) {
        results.push({
          id: `qd-${point.id}`,
          source: 'qdrant',
          title: String(point.payload.category || 'Memory'),
          content: String(point.payload.content || point.payload.data || ''),
          score: point.score,
          metadata: point.payload,
        })
      }
    }

    stats.totalTime = Date.now() - startTime

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score)

    return {
      results: results.slice(0, input.limit),
      stats,
    }
  }),

  /**
   * Generate embedding for text
   */
  embed: auditedProcedure
    .input(z.object({ text: z.string().min(1).max(10000) }))
    .mutation(async ({ input }) => {
      const embedding = await generateEmbedding(input.text)
      return { embedding, dimensions: embedding?.length || 0 }
    }),

  /**
   * Get Qdrant collections
   */
  qdrantCollections: publicProcedure.query(async () => {
    try {
      const qdrant = QdrantService.getInstance()
      return await qdrant.listCollections()
    } catch (error) {
      console.error('[Memory] Failed to get Qdrant collections:', error)
      return []
    }
  }),

  /**
   * Health check for memory sources (async, no execSync!)
   */
  health: publicProcedure.query(() => {
    return checkHealthAsync()
  }),
})

export type MemoryRouter = typeof memoryRouter
