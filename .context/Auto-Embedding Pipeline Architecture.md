# Enterprise Auto-Embedding Pipeline Architecture

## Executive Summary

This document outlines the architecture for an enterprise-grade auto-embedding pipeline that automatically generates and stores vector embeddings for Claude Code session content. The system watches active sessions, extracts content, generates embeddings via Ollama, and stores them in pgvector/Qdrant for semantic search.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Claude Command Center                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │  SessionWatcher  │───▶│ EmbeddingPipeline│───▶│   VectorStore        │  │
│  │  (fs.watch)      │    │ (PQueue + DLQ)   │    │ (pgvector + Qdrant)  │  │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────────┘  │
│           │                       │                         ▲               │
│           ▼                       ▼                         │               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │  ContentChunker  │    │ OllamaEmbedding  │    │   EmbeddingCache     │  │
│  │  (semantic split)│    │ Service (warmup) │    │   (better-sqlite3)   │  │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│                          ┌──────────────────┐                              │
│                          │   Ollama API     │                              │
│                          │ (mxbai-embed-lg) │                              │
│                          └──────────────────┘                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │ MetricsCollector │    │   AlertManager   │    │  CheckpointManager   │  │
│  │ (latency, QPS)   │    │ (threshold-based)│    │  (resume support)    │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. OllamaEmbeddingService

**Purpose**: Manages Ollama embedding model lifecycle with warmup, health checks, and optimized batching.

**Model Selection**: `mxbai-embed-large` (1024 dimensions)
- MTEB Score: 64.68 (vs 53.01 for nomic-embed-text)
- Better for code/technical content
- 1.2GB VRAM requirement

**Configuration**:
```typescript
interface OllamaConfig {
  model: 'mxbai-embed-large';
  dimensions: 1024;
  keepAlive: '-1';           // Keep model loaded indefinitely
  batchSize: 64;             // Optimal for mxbai-embed-large
  maxConcurrent: 4;          // Match OLLAMA_NUM_PARALLEL
  healthCheckInterval: 30000; // 30s health checks
  warmupOnInit: true;
}
```

**Key Features**:
- Model warmup on app startup
- Periodic health checks (30s interval)
- Batch embedding support (up to 64 items)
- Connection pooling with keep-alive
- Exponential backoff retry (3 attempts)
- Graceful degradation when unavailable

### 2. EmbeddingPipeline

**Purpose**: Orchestrates the embedding workflow with queue management, backpressure handling, and reliability guarantees.

**Queue Configuration**:
```typescript
interface PipelineConfig {
  concurrency: 4;            // Parallel processing
  intervalCap: 10;           // Rate limit: 10 ops/sec
  timeout: 30000;            // 30s per operation
  maxQueueDepth: 1000;       // Backpressure threshold
  checkpointInterval: 100;   // Checkpoint every 100 items
  maxRetries: 3;             // Retry failed items
}
```

**Backpressure Strategy**:
- Circuit breaker opens at 90% queue capacity
- Low-priority items dropped at max capacity
- Exponential backoff for retries
- Dead letter queue for persistent failures

**Idempotency**:
- Keys: `sha256(sourceId + contentHash + timestamp)`
- Deduplication via SQLite tracking table
- Content-based hashing prevents reprocessing

### 3. ContentChunker

**Purpose**: Splits content into optimal chunks for embedding while preserving semantic coherence.

**Chunk Configurations**:
| Content Type | Chunk Size | Overlap | Strategy |
|--------------|-----------|---------|----------|
| Code | 400-500 tokens | 25 tokens | Function/class boundaries |
| Conversations | 300 tokens | 75 tokens | Message boundaries |
| Documentation | 800 tokens | 80 tokens | Section boundaries |
| Tool Results | 200 tokens | 20 tokens | Complete results |

**Metadata Preservation**:
```typescript
interface ChunkMetadata {
  sourceId: string;          // Session/file ID
  sourceType: 'code' | 'conversation' | 'tool_result' | 'learning';
  chunkIndex: number;
  totalChunks: number;
  timestamp: number;
  sessionId?: string;
  filePath?: string;
  lineRange?: { start: number; end: number };
  speaker?: 'user' | 'assistant';
  toolName?: string;
}
```

### 4. VectorStore

**Purpose**: Dual storage in pgvector (PostgreSQL) and Qdrant for redundancy and different query patterns.

**pgvector Schema**:
```sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  embedding VECTOR(1024),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  session_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX idx_embeddings_hnsw ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 100);

-- Payload indexes for filtering
CREATE INDEX idx_embeddings_source ON embeddings (source_type, source_id);
CREATE INDEX idx_embeddings_session ON embeddings (session_id);
CREATE INDEX idx_embeddings_metadata ON embeddings USING GIN (metadata);
```

**Qdrant Collection**:
```typescript
const qdrantConfig = {
  collection: 'claude_memories',
  vectorParams: {
    size: 1024,
    distance: 'Cosine',
    onDisk: false
  },
  hnswConfig: {
    m: 16,
    efConstruct: 100
  },
  quantization: {
    type: 'scalar',
    quantile: 0.99,
    alwaysRam: true  // 75% memory reduction
  },
  shardNumber: 2,
  payloadIndexes: ['session_id', 'source_type', 'project_path']
};
```

### 5. EmbeddingCache

**Purpose**: Local cache to avoid re-embedding identical content.

**Storage**: better-sqlite3 (sync, fast, Electron-friendly)

**Schema**:
```sql
CREATE TABLE embedding_cache (
  content_hash TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  embedding BLOB NOT NULL,  -- Float32Array as Buffer
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_cache_model ON embedding_cache (model);
```

**Cache Strategy**:
- Indefinite retention (embeddings are deterministic)
- Content hash includes model name for version safety
- Automatic invalidation on model version change

### 6. SessionEmbeddingWorker

**Purpose**: Watches session files and triggers embedding for new content.

**Workflow**:
1. Watch `~/.claude/projects/**/*.jsonl` for changes
2. Parse new entries since last processed position
3. Extract embeddable content (user messages, assistant responses, tool results)
4. Chunk content appropriately
5. Submit to EmbeddingPipeline
6. Track processed positions per session

**Auto-Embed Configuration**:
```typescript
interface AutoEmbedConfig {
  enableSessions: boolean;      // Embed session conversations
  enableLearnings: boolean;     // Embed /learn entries
  enableCode: boolean;          // Embed code snippets
  enableCommits: boolean;       // Embed git commit context
  excludePatterns: string[];    // Glob patterns to skip
  minContentLength: 50;         // Skip short content
  debounceMs: 1000;            // Debounce rapid changes
}
```

### 7. MetricsCollector

**Purpose**: Track pipeline performance for monitoring and alerting.

**Metrics**:
```typescript
interface PipelineMetrics {
  // Latency
  latency: { p50: number; p95: number; p99: number };

  // Throughput
  embeddingsPerSecond: number;
  embeddingsPerMinute: number;

  // Queue health
  queueDepth: number;
  pendingOperations: number;

  // Reliability
  successRate: number;
  errorRate: number;
  cacheHitRate: number;

  // Resource usage
  ollamaModelLoaded: boolean;
  ollamaMemoryUsage: number;
  cacheSize: number;

  // Totals
  totalProcessed: number;
  totalFailed: number;
  totalCached: number;
}
```

### 8. AlertManager

**Purpose**: Threshold-based alerting for pipeline health issues.

**Alert Thresholds**:
| Alert | Condition | Cooldown |
|-------|-----------|----------|
| HIGH_LATENCY | P99 > 1000ms | 5 min |
| HIGH_QUEUE_DEPTH | Depth > 1000 for 5min | 5 min |
| HIGH_ERROR_RATE | > 5% for 1min | 5 min |
| OLLAMA_UNHEALTHY | Health check fails | 1 min |
| MODEL_NOT_LOADED | Warmup fails | 5 min |

### 9. CheckpointManager

**Purpose**: Enable resume from failures without data loss.

**Checkpoint Data**:
```typescript
interface Checkpoint {
  version: 1;
  timestamp: number;
  sessionPositions: Map<string, number>;  // Session ID -> byte position
  queueState: EmbeddingTask[];
  lastProcessedId: string;
  metrics: Partial<PipelineMetrics>;
}
```

**Checkpoint Triggers**:
- Every 100 processed items
- On graceful shutdown
- On circuit breaker activation

## File Structure

```
src/main/services/embeddings/
├── index.ts                    # Public API exports
├── OllamaEmbeddingService.ts   # Ollama client wrapper
├── EmbeddingPipeline.ts        # Queue orchestration
├── ContentChunker.ts           # Text splitting
├── VectorStore.ts              # pgvector + Qdrant client
├── EmbeddingCache.ts           # Local cache
├── SessionEmbeddingWorker.ts   # Session file watcher
├── MetricsCollector.ts         # Performance tracking
├── AlertManager.ts             # Health alerts
├── CheckpointManager.ts        # Resume support
└── types.ts                    # Shared types
```

## IPC Handlers

```typescript
// Enable/disable auto-embedding
ipcMain.handle('embeddings:setEnabled', (enabled: boolean) => void)

// Get pipeline status
ipcMain.handle('embeddings:getStatus', () => EmbeddingStatus)

// Get metrics
ipcMain.handle('embeddings:getMetrics', () => PipelineMetrics)

// Manual embed request
ipcMain.handle('embeddings:embed', (text: string) => number[])

// Search similar content
ipcMain.handle('embeddings:search', (query: string, options?: SearchOptions) => SearchResult[])

// Configure auto-embed settings
ipcMain.handle('embeddings:getConfig', () => AutoEmbedConfig)
ipcMain.handle('embeddings:setConfig', (config: AutoEmbedConfig) => void)

// Warmup/unload model
ipcMain.handle('embeddings:warmup', () => boolean)
ipcMain.handle('embeddings:unload', () => boolean)
```

## Event Channels

```typescript
// Pipeline status changes
'embeddings:status' -> EmbeddingStatus

// Metrics updates (every 5s when active)
'embeddings:metrics' -> PipelineMetrics

// Alert notifications
'embeddings:alert' -> { type: string; message: string }

// Progress updates during bulk operations
'embeddings:progress' -> { processed: number; total: number; current: string }
```

## Startup Sequence

1. Initialize EmbeddingCache (SQLite)
2. Initialize VectorStore (pgvector + Qdrant connections)
3. Initialize OllamaEmbeddingService
4. Check Ollama health
5. Warmup embedding model (if healthy)
6. Load checkpoint (if exists)
7. Initialize EmbeddingPipeline
8. Start SessionEmbeddingWorker (if auto-embed enabled)
9. Start MetricsCollector
10. Resume from checkpoint (if applicable)

## Shutdown Sequence

1. Stop accepting new tasks
2. Pause SessionEmbeddingWorker
3. Wait for active operations (max 30s)
4. Save checkpoint
5. Close Qdrant connection
6. Close pgvector connection
7. Close EmbeddingCache
8. Unload model (optional, based on config)

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Embedding latency | < 100ms | Per single text |
| Batch throughput | > 500/min | 64-item batches |
| Cache hit rate | > 80% | After warm-up period |
| Queue depth | < 100 | Normal operation |
| Memory usage | < 100MB | Excluding Ollama |
| Startup time | < 5s | Including warmup |

## Error Handling

1. **Ollama unavailable**: Queue items, retry when healthy
2. **pgvector unavailable**: Continue with Qdrant only
3. **Qdrant unavailable**: Continue with pgvector only
4. **Both stores unavailable**: Queue items, alert user
5. **Cache corruption**: Clear cache, rebuild from stores
6. **Checkpoint corruption**: Start fresh, log warning

## Security Considerations

1. All content stays local (no external API calls)
2. Embeddings stored in user's databases only
3. No PII in metrics or alerts
4. Checkpoint files encrypted (if OS keychain available)
5. Rate limiting prevents resource exhaustion

## Future Enhancements

1. **Multi-model support**: Different models for different content types
2. **Incremental re-embedding**: Detect model updates, re-embed affected content
3. **Semantic deduplication**: Detect near-duplicate content
4. **Cross-session search**: Find similar conversations across projects
5. **Export/import**: Backup and restore embeddings
