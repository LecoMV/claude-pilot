/**
 * OllamaEmbeddingService
 *
 * Enterprise-grade Ollama embedding client with:
 * - Model warmup and keep-alive
 * - Health monitoring
 * - Batch embedding support
 * - Connection pooling
 * - Exponential backoff retry
 * - Graceful degradation
 */

import { Agent } from 'http'
import { createHash } from 'crypto'
import type {
  OllamaConfig,
  OllamaStatus,
  EmbeddingResult,
  DEFAULT_OLLAMA_CONFIG,
} from './types'

export class OllamaEmbeddingService {
  private config: OllamaConfig
  private agent: Agent
  private healthy = false
  private modelLoaded = false
  private lastHealthCheck = 0
  private healthCheckTimer: NodeJS.Timeout | null = null
  private modelDigest: string | null = null

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_OLLAMA_CONFIG, ...config }

    // HTTP agent with keep-alive for connection pooling
    this.agent = new Agent({
      keepAlive: true,
      maxSockets: this.config.maxConcurrent,
      maxFreeSockets: 2,
      timeout: 60000,
    })
  }

  /**
   * Initialize the service - check health and optionally warmup model
   */
  async initialize(): Promise<boolean> {
    console.info('[Embeddings] Initializing OllamaEmbeddingService...')

    // Initial health check
    await this.healthCheck()

    if (!this.healthy) {
      console.warn('[Embeddings] Ollama not available at startup')
      return false
    }

    // Warmup model if configured
    if (this.config.warmupOnInit) {
      const warmed = await this.warmupModel()
      if (!warmed) {
        console.warn('[Embeddings] Model warmup failed')
      }
    }

    // Start periodic health checks
    this.startHealthChecks()

    console.info('[Embeddings] OllamaEmbeddingService initialized')
    return this.healthy
  }

  /**
   * Shutdown the service cleanly
   */
  async shutdown(): Promise<void> {
    console.info('[Embeddings] Shutting down OllamaEmbeddingService...')

    this.stopHealthChecks()
    this.agent.destroy()

    console.info('[Embeddings] OllamaEmbeddingService shutdown complete')
  }

  /**
   * Check if Ollama is healthy and reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      this.healthy = response.ok
      this.lastHealthCheck = Date.now()

      if (this.healthy) {
        // Check if our model is in the list
        const data = (await response.json()) as { models?: Array<{ name: string }> }
        const models = data.models || []
        const hasModel = models.some(
          (m) =>
            m.name === this.config.model ||
            m.name === `${this.config.model}:latest` ||
            m.name.startsWith(this.config.model)
        )

        if (!hasModel) {
          console.warn(`[Embeddings] Model ${this.config.model} not found in Ollama`)
        }
      }

      return this.healthy
    } catch (error) {
      this.healthy = false
      this.lastHealthCheck = Date.now()
      console.error('[Embeddings] Health check failed:', error)
      return false
    }
  }

  /**
   * Warmup the embedding model to keep it loaded in memory
   */
  async warmupModel(): Promise<boolean> {
    if (!this.healthy) {
      return false
    }

    try {
      console.info(`[Embeddings] Warming up model: ${this.config.model}`)

      const response = await fetch(`${this.config.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          input: 'warmup',
          keep_alive: this.config.keepAlive,
        }),
      })

      if (response.ok) {
        this.modelLoaded = true

        // Get model digest for version tracking
        await this.updateModelDigest()

        console.info(`[Embeddings] Model ${this.config.model} warmed up and loaded`)
        return true
      }

      const errorText = await response.text()
      console.error(`[Embeddings] Model warmup failed: ${errorText}`)
      return false
    } catch (error) {
      console.error('[Embeddings] Model warmup error:', error)
      return false
    }
  }

  /**
   * Unload the model from memory
   */
  async unloadModel(): Promise<boolean> {
    try {
      // Send request with keep_alive: 0 to unload
      const response = await fetch(`${this.config.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          input: 'unload',
          keep_alive: '0',
        }),
      })

      if (response.ok) {
        this.modelLoaded = false
        console.info(`[Embeddings] Model ${this.config.model} unloaded`)
        return true
      }

      return false
    } catch (error) {
      console.error('[Embeddings] Model unload error:', error)
      return false
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult | null> {
    const startTime = Date.now()

    if (!this.healthy) {
      console.warn('[Embeddings] Service unhealthy, skipping embed request')
      return null
    }

    try {
      const embedding = await this.embedWithRetry(text)

      if (embedding) {
        return {
          idempotencyKey: this.generateKey(text),
          embedding,
          model: this.config.model,
          processingTime: Date.now() - startTime,
          cached: false,
        }
      }

      return null
    } catch (error) {
      console.error('[Embeddings] Embed error:', error)
      return null
    }
  }

  /**
   * Generate embeddings for a batch of texts
   */
  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (!this.healthy || texts.length === 0) {
      return texts.map(() => null)
    }

    // Split into chunks based on batch size
    const chunks = this.chunkArray(texts, this.config.batchSize)
    const results: Array<number[] | null> = []

    for (const chunk of chunks) {
      try {
        const response = await fetch(`${this.config.baseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.model,
            input: chunk,
            keep_alive: this.config.keepAlive,
          }),
        })

        if (response.ok) {
          const data = (await response.json()) as { embeddings: number[][] }
          results.push(...data.embeddings)
        } else {
          // Mark all in chunk as failed
          results.push(...chunk.map(() => null))
        }
      } catch (error) {
        console.error('[Embeddings] Batch embed error:', error)
        results.push(...chunk.map(() => null))
      }
    }

    return results
  }

  /**
   * Get current service status
   */
  getStatus(): OllamaStatus {
    return {
      healthy: this.healthy,
      modelLoaded: this.modelLoaded,
      model: this.config.model,
      lastCheck: this.lastHealthCheck,
      error: this.healthy ? undefined : 'Ollama not reachable',
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config }
  }

  /**
   * Update configuration (requires re-warmup if model changed)
   */
  async updateConfig(config: Partial<OllamaConfig>): Promise<void> {
    const modelChanged = config.model && config.model !== this.config.model

    this.config = { ...this.config, ...config }

    if (modelChanged && this.config.warmupOnInit) {
      await this.warmupModel()
    }
  }

  /**
   * Get model digest for version tracking
   */
  getModelDigest(): string | null {
    return this.modelDigest
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async embedWithRetry(
    text: string,
    maxRetries = 3,
    baseBackoff = 1000
  ): Promise<number[] | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.baseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.model,
            input: text,
            keep_alive: this.config.keepAlive,
          }),
        })

        if (response.status === 503) {
          // Queue full - exponential backoff
          const delay = baseBackoff * Math.pow(2, attempt)
          console.warn(`[Embeddings] Ollama queue full, retrying in ${delay}ms`)
          await this.sleep(delay)
          continue
        }

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        const data = (await response.json()) as { embeddings: number[][] }
        return data.embeddings[0] || null
      } catch (error) {
        if (attempt === maxRetries - 1) {
          console.error('[Embeddings] Max retries exceeded:', error)
          return null
        }

        const delay = baseBackoff * Math.pow(2, attempt)
        console.warn(`[Embeddings] Retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
        await this.sleep(delay)
      }
    }

    return null
  }

  private async updateModelDigest(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.config.model }),
      })

      if (response.ok) {
        const data = (await response.json()) as { digest?: string }
        this.modelDigest = data.digest || null
      }
    } catch {
      // Ignore errors - digest is optional
    }
  }

  private startHealthChecks(): void {
    this.stopHealthChecks()

    this.healthCheckTimer = setInterval(async () => {
      const wasHealthy = this.healthy
      await this.healthCheck()

      // Log state changes
      if (wasHealthy && !this.healthy) {
        console.error('[Embeddings] Ollama became unhealthy')
      } else if (!wasHealthy && this.healthy) {
        console.info('[Embeddings] Ollama recovered')

        // Re-warmup model if it was loaded before
        if (this.config.warmupOnInit) {
          await this.warmupModel()
        }
      }
    }, this.config.healthCheckInterval)
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private generateKey(text: string): string {
    // Simple hash for idempotency key
    return createHash('sha256').update(`${this.config.model}:${text}`).digest('hex')
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Export default instance factory
export function createOllamaEmbeddingService(
  config?: Partial<OllamaConfig>
): OllamaEmbeddingService {
  return new OllamaEmbeddingService(config)
}
