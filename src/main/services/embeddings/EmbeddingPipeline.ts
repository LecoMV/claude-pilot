/**
 * EmbeddingPipeline
 *
 * Enterprise-grade embedding orchestration with:
 * - Queue-based processing with backpressure
 * - Idempotency and deduplication
 * - Checkpointing for resume capability
 * - Dead letter queue for failed items
 * - Circuit breaker pattern
 * - Metrics collection
 */

import PQueue from 'p-queue'
import { EventEmitter } from 'events'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type {
  PipelineConfig,
  EmbeddingTask,
  EmbeddingResult,
  PipelineStatus,
  PipelineMetrics,
  Checkpoint,
  DeadLetterItem,
  Alert,
  AlertType,
  EmbeddingProgressEvent,
  DEFAULT_PIPELINE_CONFIG,
} from './types'
import type { OllamaEmbeddingService } from './OllamaEmbeddingService'
import type { EmbeddingCache } from './EmbeddingCache'

export class EmbeddingPipeline extends EventEmitter {
  private config: PipelineConfig
  private queue: PQueue
  private ollamaService: OllamaEmbeddingService
  private cache: EmbeddingCache

  // State
  private enabled = false
  private processing = false
  private circuitBreakerOpen = false
  private circuitBreakerResetTime = 0
  private processedIds: Set<string> = new Set()
  private deadLetterQueue: DeadLetterItem[] = []

  // Metrics tracking
  private latencies: number[] = []
  private successCount = 0
  private errorCount = 0
  private cacheHits = 0
  private totalProcessed = 0
  private metricsStartTime = Date.now()

  // Checkpointing
  private checkpointPath: string
  private itemsSinceCheckpoint = 0
  private lastCheckpoint = 0

  // Alert cooldowns
  private alertCooldowns: Map<AlertType, number> = new Map()
  private readonly ALERT_COOLDOWN_MS = 300000 // 5 minutes

  // External connection status (updated by EmbeddingManager)
  private pgvectorConnected = false
  private qdrantConnected = false

  // Session positions (updated by EmbeddingManager from SessionEmbeddingWorker)
  private sessionPositions: Record<string, number> = {}

  constructor(
    ollamaService: OllamaEmbeddingService,
    cache: EmbeddingCache,
    config: Partial<PipelineConfig> = {}
  ) {
    super()

    this.ollamaService = ollamaService
    this.cache = cache
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config }

    // Initialize queue with rate limiting
    this.queue = new PQueue({
      concurrency: this.config.concurrency,
      intervalCap: this.config.intervalCap,
      interval: this.config.interval,
      timeout: this.config.timeout,
      throwOnTimeout: false,
    })

    // Checkpoint path
    this.checkpointPath = join(homedir(), '.config', 'claude-pilot', 'embedding-checkpoint.json')

    // Monitor queue for backpressure
    this.queue.on('add', () => this.checkBackpressure())
    this.queue.on('completed', () => this.onTaskCompleted())
    this.queue.on('error', (error) => this.onTaskError(error))
  }

  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<boolean> {
    console.info('[EmbeddingPipeline] Initializing...')

    // Ensure checkpoint directory exists
    const checkpointDir = dirname(this.checkpointPath)
    if (!existsSync(checkpointDir)) {
      mkdirSync(checkpointDir, { recursive: true })
    }

    // Try to restore from checkpoint
    const restored = this.restoreCheckpoint()
    if (restored) {
      console.info('[EmbeddingPipeline] Restored from checkpoint')
    }

    this.enabled = true
    console.info('[EmbeddingPipeline] Initialized')
    return true
  }

  /**
   * Shutdown the pipeline gracefully
   */
  async shutdown(): Promise<void> {
    console.info('[EmbeddingPipeline] Shutting down...')

    this.enabled = false

    // Pause queue to stop accepting new tasks
    this.queue.pause()

    // Wait for active operations to complete (max 30s)
    const timeout = setTimeout(() => {
      console.warn('[EmbeddingPipeline] Shutdown timeout, forcing close')
      this.queue.clear()
    }, 30000)

    await this.queue.onIdle()
    clearTimeout(timeout)

    // Save final checkpoint
    this.saveCheckpoint()

    console.info('[EmbeddingPipeline] Shutdown complete')
  }

  /**
   * Add a task to the processing queue
   */
  async addTask(task: EmbeddingTask): Promise<boolean> {
    if (!this.enabled) {
      return false
    }

    // Circuit breaker check
    if (this.circuitBreakerOpen) {
      if (Date.now() < this.circuitBreakerResetTime) {
        this.sendAlert('HIGH_QUEUE_DEPTH', 'Circuit breaker open - system overloaded', 'critical')
        return false
      }
      // Reset circuit breaker
      this.circuitBreakerOpen = false
    }

    // Idempotency check
    if (this.processedIds.has(task.idempotencyKey)) {
      return true // Already processed
    }

    // Cache check
    const cached = this.cache.get(task.text, this.ollamaService.getConfig().model)
    if (cached) {
      this.cacheHits++
      this.processedIds.add(task.idempotencyKey)
      this.emitResult({
        idempotencyKey: task.idempotencyKey,
        embedding: cached,
        model: this.ollamaService.getConfig().model,
        processingTime: 0,
        cached: true,
      })
      return true
    }

    // Load shedding for low priority when queue is deep
    if (task.priority === 'low' && this.queue.size > this.config.maxQueueDepth * 0.8) {
      return false
    }

    // Add to queue
    this.queue.add(() => this.processTask(task), {
      priority: task.priority === 'high' ? 0 : task.priority === 'normal' ? 1 : 2,
    })

    return true
  }

  /**
   * Add multiple tasks (batch)
   */
  async addTasks(tasks: EmbeddingTask[]): Promise<number> {
    let added = 0
    for (const task of tasks) {
      if (await this.addTask(task)) {
        added++
      }
    }
    return added
  }

  /**
   * Process a single embedding task
   */
  private async processTask(task: EmbeddingTask): Promise<void> {
    const startTime = Date.now()
    this.processing = true

    try {
      // Check if Ollama is healthy
      const status = this.ollamaService.getStatus()
      if (!status.healthy) {
        throw new Error('Ollama service unhealthy')
      }

      // Generate embedding
      const result = await this.ollamaService.embed(task.text)

      if (!result) {
        throw new Error('Embedding generation returned null')
      }

      // Cache the result
      const config = this.ollamaService.getConfig()
      this.cache.set(
        task.text,
        config.model,
        result.embedding,
        this.ollamaService.getModelDigest() || undefined
      )

      // Record success
      const latency = Date.now() - startTime
      this.recordLatency(latency)
      this.successCount++
      this.totalProcessed++
      this.processedIds.add(task.idempotencyKey)

      // Emit result
      this.emitResult(result)

      // Checkpoint if needed
      this.itemsSinceCheckpoint++
      if (this.itemsSinceCheckpoint >= this.config.checkpointInterval) {
        this.saveCheckpoint()
      }
    } catch (error) {
      this.errorCount++

      // Retry or move to DLQ
      if (task.attemptCount < this.config.maxRetries) {
        const delay =
          this.config.baseBackoffMs * Math.pow(this.config.backoffMultiplier, task.attemptCount)

        setTimeout(() => {
          this.addTask({
            ...task,
            attemptCount: task.attemptCount + 1,
          })
        }, delay)
      } else {
        this.moveToDeadLetterQueue(task, error as Error)
      }
    } finally {
      this.processing = this.queue.size > 0 || this.queue.pending > 0
    }
  }

  /**
   * Check and handle backpressure
   */
  private checkBackpressure(): void {
    const queueDepth = this.queue.size + this.queue.pending

    if (queueDepth > this.config.maxQueueDepth) {
      this.sendAlert('HIGH_QUEUE_DEPTH', `Queue depth: ${queueDepth}`, 'warning')
    }

    // Open circuit breaker at 90% capacity
    if (queueDepth > this.config.maxQueueDepth * 0.9) {
      this.circuitBreakerOpen = true
      this.circuitBreakerResetTime = Date.now() + 30000 // 30s reset
      this.sendAlert('HIGH_QUEUE_DEPTH', 'Circuit breaker activated', 'critical')
    }
  }

  /**
   * Move failed task to dead letter queue
   */
  private moveToDeadLetterQueue(task: EmbeddingTask, error: Error): void {
    const dlqItem: DeadLetterItem = {
      originalTask: task,
      error: error.message,
      attemptCount: task.attemptCount,
      timestamp: Date.now(),
      stackTrace: error.stack,
    }

    this.deadLetterQueue.push(dlqItem)
    console.error(`[EmbeddingPipeline] Task moved to DLQ: ${task.idempotencyKey}`)

    // Persist DLQ periodically
    if (this.deadLetterQueue.length % 10 === 0) {
      this.persistDeadLetterQueue()
    }
  }

  /**
   * Record latency for metrics
   */
  private recordLatency(latency: number): void {
    this.latencies.push(latency)

    // Keep only recent latencies (last 1000)
    if (this.latencies.length > 1000) {
      this.latencies.shift()
    }

    // Check for high latency alert
    const p99 = this.calculatePercentile(99)
    if (p99 > 1000) {
      this.sendAlert('HIGH_LATENCY', `P99 latency: ${p99}ms`, 'warning')
    }
  }

  /**
   * Calculate latency percentile
   */
  private calculatePercentile(percentile: number): number {
    if (this.latencies.length === 0) return 0
    const sorted = [...this.latencies].sort((a, b) => a - b)
    const index = Math.floor((percentile / 100) * sorted.length)
    return sorted[Math.min(index, sorted.length - 1)]
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics {
    const total = this.successCount + this.errorCount
    const elapsed = (Date.now() - this.metricsStartTime) / 1000

    return {
      latency: {
        p50: this.calculatePercentile(50),
        p95: this.calculatePercentile(95),
        p99: this.calculatePercentile(99),
      },
      embeddingsPerSecond: elapsed > 0 ? this.totalProcessed / elapsed : 0,
      embeddingsPerMinute: elapsed > 0 ? (this.totalProcessed / elapsed) * 60 : 0,
      queueDepth: this.queue.size,
      pendingOperations: this.queue.pending,
      successRate: total > 0 ? this.successCount / total : 1,
      errorRate: total > 0 ? this.errorCount / total : 0,
      cacheHitRate:
        this.totalProcessed > 0 ? this.cacheHits / (this.totalProcessed + this.cacheHits) : 0,
      totalProcessed: this.totalProcessed,
      totalFailed: this.errorCount,
      totalCached: this.cacheHits,
      timestamp: Date.now(),
    }
  }

  /**
   * Get current status
   */
  getStatus(): PipelineStatus {
    const ollamaStatus = this.ollamaService.getStatus()

    return {
      enabled: this.enabled,
      processing: this.processing,
      queueDepth: this.queue.size,
      pendingOperations: this.queue.pending,
      ollama: ollamaStatus,
      pgvectorConnected: this.pgvectorConnected,
      qdrantConnected: this.qdrantConnected,
      lastCheckpoint: this.lastCheckpoint,
      circuitBreakerOpen: this.circuitBreakerOpen,
    }
  }

  /**
   * Update connection status from external source (e.g., EmbeddingManager)
   * This allows the pipeline to report accurate connection status without
   * taking a dependency on VectorStore directly.
   */
  updateConnectionStatus(pgvector: boolean, qdrant: boolean): void {
    this.pgvectorConnected = pgvector
    this.qdrantConnected = qdrant
  }

  /**
   * Update session positions from external source (e.g., SessionEmbeddingWorker)
   * Used for checkpointing to record session file processing progress.
   */
  updateSessionPositions(positions: Record<string, number>): void {
    this.sessionPositions = positions
  }

  /**
   * Get dead letter queue items
   */
  getDeadLetterQueue(): DeadLetterItem[] {
    return [...this.deadLetterQueue]
  }

  /**
   * Retry items from dead letter queue
   */
  async retryDeadLetterQueue(): Promise<number> {
    const items = [...this.deadLetterQueue]
    this.deadLetterQueue = []

    let retried = 0
    for (const item of items) {
      const task: EmbeddingTask = {
        ...item.originalTask,
        attemptCount: 0, // Reset attempts
        createdAt: Date.now(),
      }

      if (await this.addTask(task)) {
        retried++
      }
    }

    return retried
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length
    this.deadLetterQueue = []
    return count
  }

  // ============================================================================
  // CHECKPOINTING
  // ============================================================================

  /**
   * Save checkpoint to disk
   */
  saveCheckpoint(): void {
    try {
      const checkpoint: Checkpoint = {
        version: 1,
        timestamp: Date.now(),
        sessionPositions: this.sessionPositions,
        queueState: [], // Don't persist queue state for simplicity
        lastProcessedId: Array.from(this.processedIds).pop() || '',
        metrics: this.getMetrics(),
      }

      writeFileSync(this.checkpointPath, JSON.stringify(checkpoint, null, 2))
      this.lastCheckpoint = checkpoint.timestamp
      this.itemsSinceCheckpoint = 0

      console.info('[EmbeddingPipeline] Checkpoint saved')
    } catch (error) {
      console.error('[EmbeddingPipeline] Failed to save checkpoint:', error)
      this.sendAlert('CHECKPOINT_FAILED', 'Failed to save checkpoint', 'warning')
    }
  }

  /**
   * Restore from checkpoint
   */
  private restoreCheckpoint(): boolean {
    try {
      if (!existsSync(this.checkpointPath)) {
        return false
      }

      const data = readFileSync(this.checkpointPath, 'utf-8')
      const checkpoint: Checkpoint = JSON.parse(data)

      // Validate checkpoint version
      if (checkpoint.version !== 1) {
        console.warn('[EmbeddingPipeline] Incompatible checkpoint version')
        return false
      }

      this.lastCheckpoint = checkpoint.timestamp
      console.info(
        `[EmbeddingPipeline] Restored checkpoint from ${new Date(checkpoint.timestamp).toISOString()}`
      )

      return true
    } catch (error) {
      console.error('[EmbeddingPipeline] Failed to restore checkpoint:', error)
      return false
    }
  }

  // ============================================================================
  // ALERTS AND EVENTS
  // ============================================================================

  /**
   * Send alert with cooldown
   */
  private sendAlert(
    type: AlertType,
    message: string,
    severity: 'warning' | 'error' | 'critical'
  ): void {
    const lastAlert = this.alertCooldowns.get(type)
    const now = Date.now()

    if (lastAlert && now - lastAlert < this.ALERT_COOLDOWN_MS) {
      return // Cooldown active
    }

    this.alertCooldowns.set(type, now)

    const alert: Alert = {
      type,
      message,
      severity,
      timestamp: now,
    }

    console.warn(`[EmbeddingPipeline] Alert: ${type} - ${message}`)
    this.emit('alert', alert)
  }

  /**
   * Emit embedding result
   */
  private emitResult(result: EmbeddingResult): void {
    this.emit('result', result)
  }

  /**
   * Task completed handler
   */
  private onTaskCompleted(): void {
    // Emit progress
    const progress: EmbeddingProgressEvent = {
      processed: this.totalProcessed,
      total: this.totalProcessed + this.queue.size + this.queue.pending,
      current: '',
    }
    this.emit('progress', progress)
  }

  /**
   * Task error handler
   */
  private onTaskError(_error: Error): void {
    // Check error rate
    const metrics = this.getMetrics()
    if (metrics.errorRate > 0.05) {
      this.sendAlert(
        'HIGH_ERROR_RATE',
        `Error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
        'error'
      )
    }
  }

  /**
   * Persist dead letter queue to disk
   */
  private persistDeadLetterQueue(): void {
    try {
      const dlqPath = this.checkpointPath.replace('.json', '-dlq.json')
      writeFileSync(dlqPath, JSON.stringify(this.deadLetterQueue, null, 2))
    } catch (error) {
      console.error('[EmbeddingPipeline] Failed to persist DLQ:', error)
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.latencies = []
    this.successCount = 0
    this.errorCount = 0
    this.cacheHits = 0
    this.totalProcessed = 0
    this.metricsStartTime = Date.now()
  }
}

// Export factory function
export function createEmbeddingPipeline(
  ollamaService: OllamaEmbeddingService,
  cache: EmbeddingCache,
  config?: Partial<PipelineConfig>
): EmbeddingPipeline {
  return new EmbeddingPipeline(ollamaService, cache, config)
}
