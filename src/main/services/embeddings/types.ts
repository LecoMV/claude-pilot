/**
 * Enterprise Auto-Embedding Pipeline Types
 *
 * Type definitions for the embedding pipeline components.
 */

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface OllamaConfig {
  /** Embedding model to use */
  model: string
  /** Vector dimensions for the model */
  dimensions: number
  /** Keep model loaded: '-1' for indefinite, '5m', '1h', etc. */
  keepAlive: string
  /** Batch size for embedding requests */
  batchSize: number
  /** Max concurrent requests to Ollama */
  maxConcurrent: number
  /** Health check interval in ms */
  healthCheckInterval: number
  /** Whether to warmup model on initialization */
  warmupOnInit: boolean
  /** Ollama API base URL */
  baseUrl: string
}

export interface PipelineConfig {
  /** Parallel processing concurrency */
  concurrency: number
  /** Rate limit: max operations per interval */
  intervalCap: number
  /** Rate limit interval in ms */
  interval: number
  /** Timeout per operation in ms */
  timeout: number
  /** Max queue depth before backpressure */
  maxQueueDepth: number
  /** Checkpoint frequency (items processed) */
  checkpointInterval: number
  /** Max retry attempts for failed items */
  maxRetries: number
  /** Backoff multiplier for retries */
  backoffMultiplier: number
  /** Base backoff delay in ms */
  baseBackoffMs: number
}

export interface AutoEmbedConfig {
  /** Enable auto-embedding for session conversations */
  enableSessions: boolean
  /** Enable auto-embedding for /learn entries */
  enableLearnings: boolean
  /** Enable auto-embedding for code snippets */
  enableCode: boolean
  /** Enable auto-embedding for git commit context */
  enableCommits: boolean
  /** Glob patterns to exclude from embedding */
  excludePatterns: string[]
  /** Minimum content length to embed (chars) */
  minContentLength: number
  /** Debounce time for rapid file changes (ms) */
  debounceMs: number
  /** Embedding model to use */
  embeddingModel: string
}

export interface ChunkConfig {
  /** Content type being chunked */
  contentType: ContentType
  /** Target chunk size in tokens */
  chunkSize: number
  /** Overlap between chunks in tokens */
  overlapSize: number
}

// ============================================================================
// CONTENT TYPES
// ============================================================================

export type ContentType = 'code' | 'conversation' | 'tool_result' | 'learning' | 'documentation'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChunkMetadata {
  /** Unique source identifier */
  sourceId: string
  /** Type of content */
  sourceType: ContentType
  /** Chunk index within source */
  chunkIndex: number
  /** Total chunks from source */
  totalChunks: number
  /** Timestamp of original content */
  timestamp: number
  /** Session ID if from a session */
  sessionId?: string
  /** Project path */
  projectPath?: string
  /** File path if from a file */
  filePath?: string
  /** Line range if from code */
  lineRange?: { start: number; end: number }
  /** Speaker role if from conversation */
  speaker?: MessageRole
  /** Tool name if from tool result */
  toolName?: string
  /** Model used for embedding */
  embeddingModel?: string
}

export interface ContentChunk {
  /** Original text content */
  text: string
  /** Chunk metadata */
  metadata: ChunkMetadata
  /** Content hash for deduplication */
  contentHash: string
}

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

export interface EmbeddingTask {
  /** Idempotency key for deduplication */
  idempotencyKey: string
  /** Text to embed */
  text: string
  /** Task metadata */
  metadata: ChunkMetadata
  /** Task priority: 'high' | 'normal' | 'low' */
  priority: 'high' | 'normal' | 'low'
  /** Retry attempt count */
  attemptCount: number
  /** Created timestamp */
  createdAt: number
}

export interface EmbeddingResult {
  /** Idempotency key */
  idempotencyKey: string
  /** Generated embedding vector */
  embedding: number[]
  /** Model used */
  model: string
  /** Processing time in ms */
  processingTime: number
  /** Whether result was from cache */
  cached: boolean
}

export interface BatchEmbeddingResult {
  /** Successfully embedded items */
  results: EmbeddingResult[]
  /** Failed items */
  failed: Array<{ task: EmbeddingTask; error: string }>
  /** Total processing time */
  totalTime: number
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface StoredEmbedding {
  /** Unique ID */
  id: string
  /** Content hash for deduplication */
  contentHash: string
  /** Original text content */
  content: string
  /** Embedding vector */
  embedding: number[]
  /** Source type */
  sourceType: ContentType
  /** Source ID */
  sourceId: string
  /** Session ID if applicable */
  sessionId?: string
  /** Full metadata */
  metadata: ChunkMetadata
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
}

export interface SearchOptions {
  /** Maximum results to return */
  limit?: number
  /** Minimum similarity score threshold (0-1) */
  threshold?: number
  /** Filter by source type */
  sourceType?: ContentType
  /** Filter by session ID */
  sessionId?: string
  /** Filter by project path */
  projectPath?: string
  /** Include content in results */
  includeContent?: boolean
}

export interface SearchResult {
  /** Embedding ID */
  id: string
  /** Similarity score (0-1) */
  score: number
  /** Original content (if requested) */
  content?: string
  /** Chunk metadata */
  metadata: ChunkMetadata
}

// ============================================================================
// STATUS AND METRICS TYPES
// ============================================================================

export interface OllamaStatus {
  /** Whether Ollama is reachable */
  healthy: boolean
  /** Whether embedding model is loaded */
  modelLoaded: boolean
  /** Model name */
  model: string
  /** Model memory usage (if available) */
  memoryUsage?: number
  /** Last health check timestamp */
  lastCheck: number
  /** Error message if unhealthy */
  error?: string
}

export interface PipelineStatus {
  /** Whether pipeline is enabled */
  enabled: boolean
  /** Whether pipeline is currently processing */
  processing: boolean
  /** Current queue depth */
  queueDepth: number
  /** Pending operations count */
  pendingOperations: number
  /** Ollama status */
  ollama: OllamaStatus
  /** pgvector connection status */
  pgvectorConnected: boolean
  /** Qdrant connection status */
  qdrantConnected: boolean
  /** Last checkpoint timestamp */
  lastCheckpoint: number
  /** Circuit breaker state */
  circuitBreakerOpen: boolean
}

export interface LatencyMetrics {
  /** 50th percentile latency (ms) */
  p50: number
  /** 95th percentile latency (ms) */
  p95: number
  /** 99th percentile latency (ms) */
  p99: number
}

export interface PipelineMetrics {
  /** Latency percentiles */
  latency: LatencyMetrics
  /** Embeddings processed per second */
  embeddingsPerSecond: number
  /** Embeddings processed per minute */
  embeddingsPerMinute: number
  /** Current queue depth */
  queueDepth: number
  /** Active/pending operations */
  pendingOperations: number
  /** Success rate (0-1) */
  successRate: number
  /** Error rate (0-1) */
  errorRate: number
  /** Cache hit rate (0-1) */
  cacheHitRate: number
  /** Total items processed */
  totalProcessed: number
  /** Total items failed */
  totalFailed: number
  /** Total cache hits */
  totalCached: number
  /** Metrics collection timestamp */
  timestamp: number
}

// ============================================================================
// CHECKPOINT TYPES
// ============================================================================

export interface Checkpoint {
  /** Checkpoint format version */
  version: number
  /** Checkpoint timestamp */
  timestamp: number
  /** Session file positions (sessionId -> byte offset) */
  sessionPositions: Record<string, number>
  /** Pending queue state */
  queueState: EmbeddingTask[]
  /** Last processed item ID */
  lastProcessedId: string
  /** Partial metrics at checkpoint time */
  metrics: Partial<PipelineMetrics>
}

// ============================================================================
// DEAD LETTER TYPES
// ============================================================================

export interface DeadLetterItem {
  /** Original task that failed */
  originalTask: EmbeddingTask
  /** Error message */
  error: string
  /** Number of attempts made */
  attemptCount: number
  /** Timestamp when moved to DLQ */
  timestamp: number
  /** Stack trace if available */
  stackTrace?: string
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertType =
  | 'HIGH_LATENCY'
  | 'HIGH_QUEUE_DEPTH'
  | 'HIGH_ERROR_RATE'
  | 'OLLAMA_UNHEALTHY'
  | 'MODEL_NOT_LOADED'
  | 'STORAGE_UNAVAILABLE'
  | 'CHECKPOINT_FAILED'

export interface Alert {
  /** Alert type */
  type: AlertType
  /** Human-readable message */
  message: string
  /** Alert severity */
  severity: 'warning' | 'error' | 'critical'
  /** Alert timestamp */
  timestamp: number
  /** Additional context */
  context?: Record<string, unknown>
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export interface EmbeddingProgressEvent {
  /** Items processed so far */
  processed: number
  /** Total items to process */
  total: number
  /** Current item being processed */
  current: string
  /** Estimated time remaining (ms) */
  estimatedRemaining?: number
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  model: 'mxbai-embed-large',
  dimensions: 1024,
  keepAlive: '-1',
  batchSize: 64,
  maxConcurrent: 4,
  healthCheckInterval: 30000,
  warmupOnInit: true,
  baseUrl: 'http://localhost:11434',
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  concurrency: 4,
  intervalCap: 10,
  interval: 1000,
  timeout: 30000,
  maxQueueDepth: 1000,
  checkpointInterval: 100,
  maxRetries: 3,
  backoffMultiplier: 2,
  baseBackoffMs: 1000,
}

export const DEFAULT_AUTO_EMBED_CONFIG: AutoEmbedConfig = {
  enableSessions: true,
  enableLearnings: true,
  enableCode: false,
  enableCommits: false,
  excludePatterns: ['**/node_modules/**', '**/.git/**'],
  minContentLength: 50,
  debounceMs: 1000,
  embeddingModel: 'mxbai-embed-large',
}

export const CHUNK_CONFIGS: Record<ContentType, ChunkConfig> = {
  code: { contentType: 'code', chunkSize: 400, overlapSize: 25 },
  conversation: { contentType: 'conversation', chunkSize: 300, overlapSize: 75 },
  tool_result: { contentType: 'tool_result', chunkSize: 200, overlapSize: 20 },
  learning: { contentType: 'learning', chunkSize: 500, overlapSize: 50 },
  documentation: { contentType: 'documentation', chunkSize: 800, overlapSize: 80 },
}
