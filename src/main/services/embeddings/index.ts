/**
 * Enterprise Auto-Embedding Pipeline
 *
 * Automatic embedding generation for Claude sessions with:
 * - Ollama-based embedding generation (mxbai-embed-large)
 * - Queue-based processing with backpressure
 * - Dual-write to pgvector and Qdrant
 * - Content-aware chunking
 * - Local caching with model version tracking
 * - Checkpointing and resume capability
 */

// Types
export * from './types'

// Core Components
export { OllamaEmbeddingService, createOllamaEmbeddingService } from './OllamaEmbeddingService'
export { EmbeddingPipeline, createEmbeddingPipeline } from './EmbeddingPipeline'
export { EmbeddingCache, createEmbeddingCache } from './EmbeddingCache'
export type { CacheStats } from './EmbeddingCache'
export { ContentChunker, createContentChunker } from './ContentChunker'
export { SessionEmbeddingWorker, createSessionEmbeddingWorker } from './SessionEmbeddingWorker'
export { VectorStore, createVectorStore } from './VectorStore'

// Manager (orchestrates all components)
export {
  EmbeddingManager,
  createEmbeddingManager,
  getEmbeddingManager,
  initializeEmbeddingManager,
  shutdownEmbeddingManager,
} from './EmbeddingManager'
export type { EmbeddingManagerConfig, EmbeddingManagerStatus } from './EmbeddingManager'
