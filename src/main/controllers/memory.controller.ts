/**
 * Memory Controller - Unified Memory System Access
 *
 * Migrated from handlers.ts to tRPC pattern.
 * Provides type-safe access to:
 * - PostgreSQL learnings (pgvector)
 * - Memgraph knowledge graph
 * - Qdrant vector search
 *
 * @see src/main/ipc/handlers.ts for legacy implementation
 * @see ~/.claude/integrations/memory/hybrid_memory.py for Python version
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import { execSync } from 'child_process'
import { memgraphService } from '../services/memgraph'
import { postgresService } from '../services/postgresql'
import type { Learning } from '../../shared/types'

// ============================================================================
// SCHEMAS
// ============================================================================

const LearningsQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.number().min(1).max(500).default(50),
  category: z.string().optional(),
})

// Memory stats type (defined inline, not as schema since we don't validate output)
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
// HELPER FUNCTIONS
// ============================================================================

function queryLearnings(query?: string, limit = 50, category?: string): Learning[] {
  try {
    // Use direct psql query since pg module connection is async
    let sqlQuery = 'SELECT id, topic, content, category, created_at FROM learnings'
    const conditions: string[] = []

    if (query && query.trim()) {
      const sanitizedQuery = query.replace(/'/g, "''")
      conditions.push(`(topic ILIKE '%${sanitizedQuery}%' OR content ILIKE '%${sanitizedQuery}%')`)
    }

    if (category && category.trim()) {
      const sanitizedCat = category.replace(/'/g, "''")
      conditions.push(`category = '${sanitizedCat}'`)
    }

    if (conditions.length > 0) {
      sqlQuery += ' WHERE ' + conditions.join(' AND ')
    }

    sqlQuery += ` ORDER BY created_at DESC LIMIT ${limit}`

    const result = execSync(
      `sudo -u postgres psql -h localhost -p 5433 -d claude_memory -t -A -F'|||' -c "${sqlQuery}"`,
      {
        encoding: 'utf-8',
        timeout: 5000,
      }
    )

    const lines = result
      .trim()
      .split('\n')
      .filter((l) => l.trim())
    return lines.map((line) => {
      const [id, topic, content, cat, created_at] = line.split('|||')
      return {
        id: parseInt(id) || 0,
        topic: topic || '',
        content: content || '',
        category: cat || 'general',
        createdAt: created_at || new Date().toISOString(),
        source: topic || undefined,
      }
    })
  } catch (error) {
    console.error('Failed to query learnings:', error)
    return []
  }
}

async function getMemoryStats(): Promise<MemoryStats> {
  const stats = {
    postgresql: { count: 0 },
    memgraph: { nodes: 0, edges: 0 },
    qdrant: { vectors: 0 },
  }

  // PostgreSQL count
  try {
    await postgresService.connect()
    const count = await postgresService.queryScalar<number>('SELECT COUNT(*) FROM learnings')
    stats.postgresql.count = count ?? 0
  } catch {
    // Ignore
  }

  // Memgraph counts
  try {
    await memgraphService.connect()
    const memgraphStats = await memgraphService.getStats()
    stats.memgraph.nodes = memgraphStats.nodes
    stats.memgraph.edges = memgraphStats.edges
  } catch (error) {
    console.error('Failed to get Memgraph stats:', error)
  }

  // Qdrant count
  try {
    const collectionsResult = execSync('curl -s http://localhost:6333/collections', {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const collections = JSON.parse(collectionsResult)
    let totalVectors = 0

    for (const col of collections.result?.collections || []) {
      try {
        const colResult = execSync(`curl -s http://localhost:6333/collections/${col.name}`, {
          encoding: 'utf-8',
          timeout: 2000,
        })
        const colData = JSON.parse(colResult)
        totalVectors += colData.result?.points_count || 0
      } catch {
        // Skip failed collection
      }
    }
    stats.qdrant.vectors = totalVectors
  } catch {
    // Ignore
  }

  return stats
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest',
        prompt: text,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.embedding || null
    }
  } catch (error) {
    console.error('Failed to generate embedding with Ollama:', error)
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
        }
      )

      if (searchResponse.ok) {
        const data = await searchResponse.json()
        if (data.result) {
          return data.result.map(
            (p: { id: string; score: number; payload: Record<string, unknown> }) => ({
              id: p.id,
              score: p.score,
              payload: p.payload,
            })
          )
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
      const data = await scrollResponse.json()
      const queryLower = query.toLowerCase()

      if (data.result?.points) {
        return data.result.points
          .filter((p: { payload: Record<string, unknown> }) => {
            const dataStr = String(p.payload?.data || '').toLowerCase()
            return dataStr.includes(queryLower)
          })
          .slice(0, limit)
          .map((p: { id: string; payload: Record<string, unknown> }, index: number) => ({
            id: p.id,
            score: 0.5 - index * 0.01,
            payload: p.payload,
          }))
      }
    }
  } catch (error) {
    console.error('Failed to search Qdrant:', error)
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
    console.error('Failed to search Memgraph:', error)
    return []
  }
}

// Dangerous query patterns to block
const DANGEROUS_PATTERNS = [
  /drop\s+/i,
  /truncate\s+/i,
  /delete\s+from\s+\w+\s*$/i, // DELETE without WHERE
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
        // Qdrant uses REST API, not query language
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

// ============================================================================
// MEMORY ROUTER
// ============================================================================

export const memoryRouter = router({
  /**
   * Query learnings from PostgreSQL
   */
  learnings: publicProcedure.input(LearningsQuerySchema).query(({ input }) => {
    return queryLearnings(input.query, input.limit, input.category)
  }),

  /**
   * Get memory statistics across all sources
   */
  stats: auditedProcedure.query(async () => {
    const stats = await getMemoryStats()
    return stats
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
      console.error('Failed to query Memgraph:', error)
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
        const data = await response.json()
        return {
          points: (data.result?.points || []).map(
            (p: { id: string; payload: Record<string, unknown> }) => ({
              id: p.id,
              payload: p.payload,
              created_at: p.payload?.created_at as string | undefined,
            })
          ),
          nextOffset: data.result?.next_page_offset || null,
        }
      }

      return { points: [], nextOffset: null }
    } catch (error) {
      console.error('Failed to browse Qdrant:', error)
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

    // Search PostgreSQL learnings
    try {
      const pgStart = Date.now()
      const learnings = queryLearnings(input.query, input.limit)
      stats.postgresql = Date.now() - pgStart

      for (const learning of learnings) {
        results.push({
          id: `pg-${learning.id}`,
          source: 'postgresql',
          title: learning.topic,
          content: learning.content,
          score: 0.8, // Keyword match gets high score
          metadata: { category: learning.category, createdAt: learning.createdAt },
        })
      }
    } catch (error) {
      console.error('PostgreSQL search failed:', error)
    }

    // Search Memgraph
    try {
      const mgStart = Date.now()
      const mgResults = await searchMemgraphNodes(input.query, undefined, input.limit)
      stats.memgraph = Date.now() - mgStart

      for (const node of mgResults) {
        results.push({
          id: `mg-${node.id}`,
          source: 'memgraph',
          title: node.label,
          content: String(node.properties.instruction || node.properties.output || ''),
          score: 0.7,
          metadata: { type: node.type, ...node.properties },
        })
      }
    } catch (error) {
      console.error('Memgraph search failed:', error)
    }

    // Search Qdrant
    try {
      const qdStart = Date.now()
      const qdResults = await searchQdrantMemories(input.query, 'claude_memories', input.limit)
      stats.qdrant = Date.now() - qdStart

      for (const point of qdResults) {
        results.push({
          id: `qd-${point.id}`,
          source: 'qdrant',
          title: String(point.payload.category || 'Memory'),
          content: String(point.payload.content || point.payload.data || ''),
          score: point.score,
          metadata: point.payload,
        })
      }
    } catch (error) {
      console.error('Qdrant search failed:', error)
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
      const response = await fetch('http://localhost:6333/collections')
      if (response.ok) {
        const data = await response.json()
        return data.result?.collections || []
      }
    } catch (error) {
      console.error('Failed to get Qdrant collections:', error)
    }
    return []
  }),

  /**
   * Health check for memory sources
   */
  health: publicProcedure.query(() => {
    const status = {
      postgresql: false,
      memgraph: false,
      qdrant: false,
      ollama: false,
    }

    try {
      execSync('pg_isready -h localhost -p 5433', { encoding: 'utf-8', timeout: 1000 })
      status.postgresql = true
    } catch {
      // Offline
    }

    try {
      execSync('nc -z localhost 7687', { encoding: 'utf-8', timeout: 1000 })
      status.memgraph = true
    } catch {
      // Offline
    }

    try {
      const result = execSync('curl -s http://localhost:6333/collections', {
        encoding: 'utf-8',
        timeout: 2000,
      })
      if (result.includes('result')) {
        status.qdrant = true
      }
    } catch {
      // Offline
    }

    try {
      const result = execSync('curl -s http://localhost:11434/api/tags', {
        encoding: 'utf-8',
        timeout: 2000,
      })
      if (result.includes('models')) {
        status.ollama = true
      }
    } catch {
      // Offline
    }

    return status
  }),
})

export type MemoryRouter = typeof memoryRouter
