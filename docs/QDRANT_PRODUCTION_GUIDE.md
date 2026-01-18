# Qdrant JS Client Production Guide

> **Package**: `@qdrant/js-client-rest`
> **Version**: Latest (1.11.0+)
> **TypeScript**: Full support with type definitions
> **Current Collections**: `claude_memories`, `mem0_memories` on `localhost:6333`

## Table of Contents

1. [Installation](#installation)
2. [Client Initialization](#client-initialization)
3. [Collection Management](#collection-management)
4. [Search Operations](#search-operations)
5. [Upsert Operations](#upsert-operations)
6. [Connection Pooling](#connection-pooling)
7. [Error Handling](#error-handling)
8. [Production Best Practices](#production-best-practices)

---

## Installation

```bash
npm install @qdrant/js-client-rest
```

**System Requirements:**

- Node.js ≥18.0.0
- TypeScript ≥4.5 (recommended)

---

## Client Initialization

### Basic Local Connection

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const client = new QdrantClient({
  url: 'http://localhost:6333',
})
```

### Production Configuration with Timeouts

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const client = new QdrantClient({
  url: 'http://localhost:6333',
  // API key for cloud deployments
  apiKey: process.env.QDRANT_API_KEY,
  // Request timeout in milliseconds (default: 30000)
  timeout: 60000,
  // Prefix for all requests (useful for proxies)
  prefix: '',
})
```

### Cloud Connection

```typescript
const client = new QdrantClient({
  url: 'https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.us-east-0-1.aws.cloud.qdrant.io',
  apiKey: process.env.QDRANT_API_KEY,
})
```

### Electron Main Process Singleton Pattern

```typescript
// src/main/services/memory/qdrant-client.ts
import { QdrantClient } from '@qdrant/js-client-rest'

class QdrantService {
  private static instance: QdrantClient | null = null

  static getInstance(): QdrantClient {
    if (!QdrantService.instance) {
      QdrantService.instance = new QdrantClient({
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        timeout: 60000,
      })
    }
    return QdrantService.instance
  }

  static async shutdown(): Promise<void> {
    // Qdrant REST client doesn't require explicit cleanup
    // but set instance to null for garbage collection
    QdrantService.instance = null
  }

  static async healthCheck(): Promise<boolean> {
    try {
      const client = this.getInstance()
      const collections = await client.getCollections()
      return collections.collections !== undefined
    } catch (error) {
      console.error('Qdrant health check failed:', error)
      return false
    }
  }
}

export default QdrantService
```

**Usage in IPC handlers:**

```typescript
import QdrantService from './qdrant-client'

ipcMain.handle('memory:search', async (event, query: string) => {
  const client = QdrantService.getInstance()
  // Use client...
})
```

---

## Collection Management

### Creating Collections with Vector Config

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const client = new QdrantClient({ url: 'http://localhost:6333' })

// Basic collection (single vector)
await client.createCollection('claude_memories', {
  vectors: {
    size: 768, // Dimension count (e.g., text-embedding-3-small)
    distance: 'Cosine', // 'Cosine' | 'Euclid' | 'Dot'
  },
})

// Multiple named vectors (multi-modal)
await client.createCollection('multimodal_memories', {
  vectors: {
    text: { size: 768, distance: 'Cosine' },
    image: { size: 512, distance: 'Dot' },
  },
})

// With uint8 datatype (memory optimization)
await client.createCollection('optimized_memories', {
  vectors: {
    size: 1024,
    distance: 'Cosine',
    datatype: 'uint8', // 'float32' | 'uint8' (default: float32)
  },
})
```

### HNSW Index Configuration

```typescript
await client.createCollection('production_memories', {
  vectors: { size: 768, distance: 'Cosine' },
  hnsw_config: {
    m: 16, // Edges per node (higher = better accuracy, more memory)
    ef_construct: 100, // Build quality (higher = better index, slower build)
    full_scan_threshold: 10000, // Switch to brute force below this count
    max_indexing_threads: 0, // 0 = auto-detect CPU cores
    on_disk: false, // Store HNSW index on disk (saves RAM)
  },
})
```

**HNSW Tuning Profiles:**

| Profile                | m   | ef_construct | Use Case                       |
| ---------------------- | --- | ------------ | ------------------------------ |
| **Memory Optimized**   | 8   | 100          | RAM-constrained environments   |
| **Balanced** (Default) | 16  | 100          | General production use         |
| **High Quality**       | 32  | 400          | Accuracy-critical applications |
| **Bulk Upload**        | 0   | 100          | Fast inserts, defer indexing   |

### Payload Indexing

**Create payload indexes BEFORE uploading data** for filter-aware HNSW:

```typescript
await client.createCollection('indexed_memories', {
  vectors: { size: 768, distance: 'Cosine' },
})

// Index specific payload fields for filtering
await client.createPayloadIndex('indexed_memories', {
  field_name: 'session_id',
  field_schema: 'keyword', // 'keyword' | 'integer' | 'float' | 'bool' | 'geo' | 'text'
})

await client.createPayloadIndex('indexed_memories', {
  field_name: 'timestamp',
  field_schema: 'integer',
})

await client.createPayloadIndex('indexed_memories', {
  field_name: 'tags',
  field_schema: 'keyword',
  is_array: true, // For array fields
})
```

**Best Practice**: Index fields with **high selectivity** (e.g., `user_id`, `session_id`) for maximum performance.

### Collection Updates

```typescript
// Update HNSW config for specific vector
await client.updateCollection('claude_memories', {
  vectors: {
    default: {
      hnsw_config: {
        m: 32,
        ef_construct: 200,
      },
      on_disk: true, // Move vectors to disk
    },
  },
})

// Update optimizer config
await client.updateCollection('claude_memories', {
  optimizers_config: {
    indexing_threshold: 20000, // Start indexing after 20K points
  },
})
```

### Collection Utilities

```typescript
// Check if collection exists
const exists = await client.collectionExists('claude_memories')

// Get collection info
const info = await client.getCollection('claude_memories')
console.log(info.config, info.points_count, info.status)

// List all collections
const { collections } = await client.getCollections()

// Delete collection
await client.deleteCollection('old_collection')
```

---

## Search Operations

### Basic Vector Search

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const client = new QdrantClient({ url: 'http://localhost:6333' })

// Simple search
const results = await client.query('claude_memories', {
  query: [0.1, 0.2, 0.3 /* ... 768 dims */],
  limit: 10,
})

results.points.forEach((point) => {
  console.log(`ID: ${point.id}, Score: ${point.score}`)
  console.log(`Payload:`, point.payload)
})
```

### Search with Filters

```typescript
const results = await client.query('claude_memories', {
  query: embedding,
  limit: 5,
  filter: {
    must: [
      {
        key: 'session_id',
        match: { value: 'abc123' },
      },
    ],
  },
})
```

**Filter Syntax:**

```typescript
interface Filter {
  must?: Condition[];      // AND conditions
  should?: Condition[];    // OR conditions (at least one)
  must_not?: Condition[];  // NOT conditions
}

// Condition types
{
  key: 'city',
  match: { value: 'London' }  // Exact match
}

{
  key: 'price',
  range: { gte: 10, lte: 100 }  // Range: gte, gt, lte, lt
}

{
  key: 'tags',
  match: { any: ['ml', 'ai'] }  // Match any in array
}

{
  key: 'category',
  match: { except: ['spam'] }  // Exclude values
}

{
  key: 'geolocation',
  geo_radius: {
    center: { lon: -73.935242, lat: 40.730610 },
    radius: 1000  // meters
  }
}
```

### Score Thresholds

```typescript
const results = await client.query('claude_memories', {
  query: embedding,
  limit: 10,
  score_threshold: 0.7, // Only return results with score >= 0.7
})
```

**Important**: Score interpretation depends on distance metric:

- **Cosine**: 1.0 = identical, 0.0 = orthogonal, -1.0 = opposite
- **Dot**: Higher = more similar (unbounded)
- **Euclid**: Lower = more similar (0 = identical)

### Pagination

```typescript
// First page
const page1 = await client.query('claude_memories', {
  query: embedding,
  limit: 20,
  offset: 0,
})

// Second page
const page2 = await client.query('claude_memories', {
  query: embedding,
  limit: 20,
  offset: 20,
})
```

**Warning**: Large `offset` values cause performance issues (retrieves `offset + limit` points internally).

### Search by Point ID

```typescript
const results = await client.query('claude_memories', {
  query: 'a1b2c3d4-5678-90ab-cdef-1234567890ab', // UUID or integer
  limit: 10,
})
```

### Batch Search

```typescript
const batchResults = await client.searchBatchPoints('claude_memories', {
  searches: [
    { vector: embedding1, limit: 5 },
    {
      vector: embedding2,
      limit: 5,
      filter: {
        must: [
          /* ... */
        ],
      },
    },
  ],
})
```

---

## Upsert Operations

### Single Point Upsert

```typescript
await client.upsert('claude_memories', {
  points: [
    {
      id: 1, // Integer or UUID string
      vector: [0.1, 0.2 /* ... 768 dims */],
      payload: {
        session_id: 'abc123',
        content: 'User asked about Qdrant integration',
        timestamp: Date.now(),
        tags: ['question', 'qdrant'],
      },
    },
  ],
})
```

### Batch Upsert (Record-Oriented)

```typescript
await client.upsert('claude_memories', {
  points: [
    {
      id: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
      vector: embedding1,
      payload: { content: 'Memory 1', session_id: 'session1' },
    },
    {
      id: 'b2c3d4e5-6789-01bc-def0-234567890abc',
      vector: embedding2,
      payload: { content: 'Memory 2', session_id: 'session1' },
    },
  ],
})
```

### Batch Upsert (Column-Oriented) - More Efficient

```typescript
await client.upsert('claude_memories', {
  batch: {
    ids: [1, 2, 3],
    vectors: [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
    ],
    payloads: [{ content: 'Memory 1' }, { content: 'Memory 2' }, { content: 'Memory 3' }],
  },
})
```

### Batch Size Recommendations

| Points Count | Method                 | Batch Size |
| ------------ | ---------------------- | ---------- |
| < 100K       | Single-threaded upsert | 100-1000   |
| 100K - 1M    | Parallel batches       | 1000-10000 |
| > 1M         | Stream from disk       | 5000-20000 |

### ID Generation Strategies

**1. Auto-Increment (simple, sequential):**

```typescript
let nextId = 1
const id = nextId++
```

**2. UUID v4 (distributed, collision-resistant):**

```typescript
import { randomUUID } from 'crypto'

const id = randomUUID() // 'a1b2c3d4-5678-90ab-cdef-1234567890ab'
```

**3. UUIDv7 (time-ordered, sortable):**

```typescript
// Requires external package: npm install uuidv7
import { uuidv7 } from 'uuidv7'

const id = uuidv7() // Time-based UUID
```

**4. Hash-based (deterministic, deduplication):**

```typescript
import { createHash } from 'crypto'

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32)
}

const id = contentHash(memory.content)
```

### Named Vectors (Multi-Modal)

```typescript
await client.upsert('multimodal_memories', {
  points: [
    {
      id: 1,
      vector: {
        text: textEmbedding, // 768 dims
        image: imageEmbedding, // 512 dims
      },
      payload: { type: 'multimodal' },
    },
  ],
})

// Search specific vector
const results = await client.query('multimodal_memories', {
  query: textEmbedding,
  using: 'text', // Specify which vector to search
  limit: 10,
})
```

### Update Payload Only (No Vector)

```typescript
await client.setPayload('claude_memories', {
  points: [1, 2, 3],
  payload: {
    reviewed: true,
    updated_at: Date.now(),
  },
})
```

### Delete Points

```typescript
// Delete by IDs
await client.delete('claude_memories', {
  points: [1, 2, 3],
})

// Delete by filter
await client.delete('claude_memories', {
  filter: {
    must: [{ key: 'session_id', match: { value: 'old_session' } }],
  },
})
```

---

## Connection Pooling

### Singleton Pattern (Recommended for Electron)

The REST client doesn't maintain persistent connections (uses HTTP/1.1 or HTTP/2), so connection pooling is handled by the underlying HTTP library. Reuse a single client instance:

```typescript
// src/main/services/memory/qdrant-service.ts
import { QdrantClient } from '@qdrant/js-client-rest'

class QdrantMemoryService {
  private client: QdrantClient

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      timeout: 60000,
    })
  }

  async search(embedding: number[], limit = 10) {
    return this.client.query('claude_memories', {
      query: embedding,
      limit,
    })
  }

  async store(id: string, embedding: number[], payload: Record<string, unknown>) {
    return this.client.upsert('claude_memories', {
      points: [{ id, vector: embedding, payload }],
    })
  }
}

// Export singleton
export default new QdrantMemoryService()
```

### Graceful Shutdown

```typescript
// src/main/index.ts
import { app } from 'electron'
import qdrantService from './services/memory/qdrant-service'

app.on('before-quit', async () => {
  // No explicit cleanup needed for REST client
  // But you can add logging
  console.log('Shutting down Qdrant connections')
})
```

### Health Monitoring

```typescript
class QdrantHealthMonitor {
  private client: QdrantClient
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(client: QdrantClient) {
    this.client = client
  }

  startMonitoring(intervalMs = 30000) {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const collections = await this.client.getCollections()
        console.log(`Qdrant healthy: ${collections.collections.length} collections`)
      } catch (error) {
        console.error('Qdrant health check failed:', error)
        // Trigger reconnection logic or alert
      }
    }, intervalMs)
  }

  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
  }
}
```

---

## Error Handling

### Typed Error Handling

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const client = new QdrantClient({ url: 'http://localhost:6333' })

async function searchWithErrorHandling(embedding: number[]) {
  try {
    const results = await client.query('claude_memories', {
      query: embedding,
      limit: 10,
    })
    return { success: true, data: results }
  } catch (error) {
    if (error instanceof Error) {
      // Network errors
      if (error.message.includes('ECONNREFUSED')) {
        return { success: false, error: 'Qdrant server not running' }
      }

      // Timeout errors
      if (error.message.includes('timeout')) {
        return { success: false, error: 'Request timeout' }
      }

      // Collection not found
      if (error.message.includes('Not found')) {
        return { success: false, error: 'Collection does not exist' }
      }
    }

    return { success: false, error: 'Unknown error occurred' }
  }
}
```

### Retry Logic with Exponential Backoff

```typescript
async function searchWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      // Don't retry on non-retryable errors
      if (error instanceof Error && error.message.includes('Not found')) {
        throw error
      }

      const delay = baseDelay * Math.pow(2, attempt)
      console.warn(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// Usage
const results = await searchWithRetry(() =>
  client.query('claude_memories', { query: embedding, limit: 10 })
)
```

### Validation

```typescript
import { z } from 'zod'

const MemoryPayloadSchema = z.object({
  session_id: z.string().uuid(),
  content: z.string().min(1),
  timestamp: z.number().int().positive(),
  tags: z.array(z.string()).optional(),
})

type MemoryPayload = z.infer<typeof MemoryPayloadSchema>

async function upsertWithValidation(id: string, vector: number[], payload: unknown) {
  // Validate payload
  const validPayload = MemoryPayloadSchema.parse(payload)

  // Validate vector dimensions
  if (vector.length !== 768) {
    throw new Error(`Invalid vector dimension: expected 768, got ${vector.length}`)
  }

  return client.upsert('claude_memories', {
    points: [{ id, vector, payload: validPayload }],
  })
}
```

---

## Production Best Practices

### 1. Collection Configuration

```typescript
// Create production-ready collection
await client.createCollection('claude_memories', {
  vectors: {
    size: 768,
    distance: 'Cosine',
    on_disk: false, // Keep vectors in RAM for speed
  },
  hnsw_config: {
    m: 16, // Balanced accuracy/memory
    ef_construct: 200, // High quality index
    full_scan_threshold: 10000,
    on_disk: false, // HNSW index in RAM
  },
  optimizers_config: {
    indexing_threshold: 20000, // Start indexing after 20K points
  },
  // For production: enable replication
  replication_factor: 2, // Requires cluster mode
  write_consistency_factor: 1,
})

// Create payload indexes BEFORE data upload
await client.createPayloadIndex('claude_memories', {
  field_name: 'session_id',
  field_schema: 'keyword',
})
```

### 2. Batch Processing

```typescript
async function batchUpsertMemories(
  memories: Array<{ id: string; vector: number[]; payload: object }>
) {
  const BATCH_SIZE = 1000

  for (let i = 0; i < memories.length; i += BATCH_SIZE) {
    const batch = memories.slice(i, i + BATCH_SIZE)

    await client.upsert('claude_memories', {
      points: batch.map(({ id, vector, payload }) => ({
        id,
        vector,
        payload,
      })),
    })

    console.log(`Uploaded ${Math.min(i + BATCH_SIZE, memories.length)}/${memories.length}`)
  }
}
```

### 3. Search Optimization

```typescript
// Use payload indexes for filtering
const results = await client.query('claude_memories', {
  query: embedding,
  limit: 10,
  filter: {
    must: [
      { key: 'session_id', match: { value: sessionId } }, // Indexed field
    ],
  },
  score_threshold: 0.7, // Filter out low-quality results
})

// Avoid large offsets - use scroll API instead
async function* scrollResults(embedding: number[], filter?: object) {
  let offset = 0
  const limit = 100

  while (true) {
    const results = await client.query('claude_memories', {
      query: embedding,
      limit,
      offset,
      filter,
    })

    if (results.points.length === 0) break

    yield results.points
    offset += limit

    if (results.points.length < limit) break // Last page
  }
}
```

### 4. Monitoring

```typescript
class QdrantMetrics {
  private client: QdrantClient

  constructor(client: QdrantClient) {
    this.client = client
  }

  async getCollectionStats(collectionName: string) {
    const info = await this.client.getCollection(collectionName)
    return {
      pointsCount: info.points_count,
      indexedVectors: info.indexed_vectors_count,
      segmentsCount: info.segments_count,
      status: info.status,
      optimizerStatus: info.optimizer_status,
    }
  }

  async getAllMetrics() {
    const { collections } = await this.client.getCollections()
    const metrics = await Promise.all(collections.map((c) => this.getCollectionStats(c.name)))

    return collections.map((c, i) => ({
      name: c.name,
      ...metrics[i],
    }))
  }
}
```

### 5. Current Claude Pilot Collections

```typescript
// Based on existing collections at localhost:6333
const COLLECTIONS = {
  CLAUDE_MEMORIES: {
    name: 'claude_memories',
    vectorSize: 768,
    distance: 'Cosine',
    hnswM: 16,
    hnswEfConstruct: 100,
  },
  MEM0_MEMORIES: {
    name: 'mem0_memories',
    vectorSize: 768,
    distance: 'Cosine',
    hnswM: 16,
    hnswEfConstruct: 100,
  },
} as const

// Type-safe collection access
type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]['name']

async function searchMemory(collection: CollectionName, embedding: number[], filter?: object) {
  return client.query(collection, {
    query: embedding,
    limit: 10,
    filter,
  })
}
```

---

## Full Example: Memory Service for Electron

```typescript
// src/main/services/memory/qdrant-memory.ts
import { QdrantClient } from '@qdrant/js-client-rest'
import type { Filter, ScoredPoint } from '@qdrant/js-client-rest/dist/types'
import { randomUUID } from 'crypto'

interface Memory {
  id: string
  content: string
  session_id: string
  timestamp: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

class QdrantMemoryService {
  private client: QdrantClient
  private collectionName = 'claude_memories'

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      timeout: 60000,
    })
  }

  async initialize(): Promise<void> {
    const exists = await this.client.collectionExists(this.collectionName)

    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: { size: 768, distance: 'Cosine' },
        hnsw_config: { m: 16, ef_construct: 200 },
      })

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'session_id',
        field_schema: 'keyword',
      })

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'timestamp',
        field_schema: 'integer',
      })
    }
  }

  async storeMemory(embedding: number[], memory: Omit<Memory, 'id'>): Promise<string> {
    const id = randomUUID()

    await this.client.upsert(this.collectionName, {
      points: [
        {
          id,
          vector: embedding,
          payload: memory,
        },
      ],
    })

    return id
  }

  async searchMemories(
    embedding: number[],
    options: {
      limit?: number
      sessionId?: string
      scoreThreshold?: number
    } = {}
  ): Promise<Array<ScoredPoint & { payload: Memory }>> {
    const { limit = 10, sessionId, scoreThreshold = 0.6 } = options

    const filter: Filter | undefined = sessionId
      ? {
          must: [
            {
              key: 'session_id',
              match: { value: sessionId },
            },
          ],
        }
      : undefined

    const results = await this.client.query(this.collectionName, {
      query: embedding,
      limit,
      filter,
      score_threshold: scoreThreshold,
    })

    return results.points as Array<ScoredPoint & { payload: Memory }>
  }

  async deleteMemory(id: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      points: [id],
    })
  }

  async getStats() {
    const info = await this.client.getCollection(this.collectionName)
    return {
      pointsCount: info.points_count,
      indexedVectors: info.indexed_vectors_count,
      status: info.status,
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections()
      return true
    } catch {
      return false
    }
  }
}

export default new QdrantMemoryService()
```

**Usage in tRPC Router:**

```typescript
// src/main/trpc/routers/memory.ts
import { z } from 'zod'
import { router, procedure } from '../trpc'
import qdrantMemory from '../../services/memory/qdrant-memory'

export const memoryRouter = router({
  search: procedure
    .input(
      z.object({
        embedding: z.array(z.number()),
        sessionId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(100).default(10),
      })
    )
    .query(async ({ input }) => {
      const results = await qdrantMemory.searchMemories(input.embedding, {
        limit: input.limit,
        sessionId: input.sessionId,
      })

      return results.map((r) => ({
        id: r.id,
        score: r.score,
        content: r.payload.content,
        sessionId: r.payload.session_id,
        timestamp: r.payload.timestamp,
        tags: r.payload.tags,
      }))
    }),

  store: procedure
    .input(
      z.object({
        embedding: z.array(z.number()).length(768),
        content: z.string().min(1),
        sessionId: z.string().uuid(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await qdrantMemory.storeMemory(input.embedding, {
        content: input.content,
        session_id: input.sessionId,
        timestamp: Date.now(),
        tags: input.tags,
      })

      return { id }
    }),

  stats: procedure.query(async () => {
    return qdrantMemory.getStats()
  }),
})
```

---

## References & Resources

### Official Documentation

- [@qdrant/js-client-rest on npm](https://www.npmjs.com/package/@qdrant/js-client-rest)
- [Qdrant JavaScript SDK GitHub](https://github.com/qdrant/qdrant-js)
- [Qdrant Official Documentation](https://qdrant.tech/documentation/)
- [Search Concepts](https://qdrant.tech/documentation/concepts/search/)
- [Points & Upsert](https://qdrant.tech/documentation/concepts/points/)
- [Collections](https://qdrant.tech/documentation/concepts/collections/)
- [Indexing](https://qdrant.tech/documentation/concepts/indexing/)
- [Filtering Guide](https://qdrant.tech/articles/vector-search-filtering/)

### Performance & Optimization

- [Optimize Performance Guide](https://qdrant.tech/documentation/guides/optimize/)
- [Vector Search Resource Optimization](https://qdrant.tech/articles/vector-search-resource-optimization/)
- [HNSW Indexing Fundamentals](https://qdrant.tech/course/essentials/day-2/what-is-hnsw/)
- [Balancing Accuracy and Speed](https://medium.com/@benitomartin/balancing-accuracy-and-speed-with-qdrant-hyperparameters-hydrid-search-and-semantic-caching-part-84b26037e594)

---

**Last Updated**: 2026-01-17
**Claude Pilot Version**: 0.1.0
