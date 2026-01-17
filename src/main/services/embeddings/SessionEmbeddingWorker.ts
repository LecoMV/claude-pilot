/**
 * SessionEmbeddingWorker
 *
 * Watches Claude session files and automatically embeds conversation content.
 * Features:
 * - File system watching with chokidar
 * - Incremental processing (tracks last position per file)
 * - Content extraction from JSONL entries
 * - Debounced processing for rapid changes
 * - Resume capability via checkpoints
 */

import { watch, FSWatcher } from 'chokidar'
import { createReadStream, existsSync, statSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { join, dirname, basename } from 'path'
import { EventEmitter } from 'events'
import type {
  AutoEmbedConfig,
  EmbeddingTask,
  ContentType,
  DEFAULT_AUTO_EMBED_CONFIG,
} from './types'
import type { EmbeddingPipeline } from './EmbeddingPipeline'
import type { ContentChunker } from './ContentChunker'

interface SessionPosition {
  /** File path */
  path: string
  /** Byte offset of last processed position */
  byteOffset: number
  /** Line number of last processed line */
  lineNumber: number
  /** Last modification time */
  mtime: number
  /** Session ID extracted from path */
  sessionId: string
}

interface SessionEntry {
  /** Entry type */
  type: 'user' | 'assistant' | 'tool_result' | 'system' | 'tool_use'
  /** Message content */
  message?: {
    role?: string
    content?: string | Array<{ type: string; text?: string; content?: string }>
  }
  /** Tool result content */
  toolResult?: {
    name?: string
    content?: string
  }
  /** Timestamp */
  timestamp?: string
  /** Session ID */
  sessionId?: string
}

export class SessionEmbeddingWorker extends EventEmitter {
  private config: AutoEmbedConfig
  private pipeline: EmbeddingPipeline
  private chunker: ContentChunker
  private watcher: FSWatcher | null = null
  private positions: Map<string, SessionPosition> = new Map()
  private processing: Set<string> = new Set()
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
  private enabled = false
  private positionsPath: string

  constructor(
    pipeline: EmbeddingPipeline,
    chunker: ContentChunker,
    config: Partial<AutoEmbedConfig> = {}
  ) {
    super()

    this.pipeline = pipeline
    this.chunker = chunker
    this.config = { ...DEFAULT_AUTO_EMBED_CONFIG, ...config }
    this.positionsPath = join(
      homedir(),
      '.config',
      'claude-pilot',
      'session-positions.json'
    )
  }

  /**
   * Start watching session files
   */
  async start(): Promise<void> {
    if (this.enabled) {
      return
    }

    console.info('[SessionWorker] Starting session embedding worker...')

    // Ensure positions directory exists
    const positionsDir = dirname(this.positionsPath)
    if (!existsSync(positionsDir)) {
      await mkdir(positionsDir, { recursive: true })
    }

    // Restore positions from disk
    await this.restorePositions()

    // Set up file watcher
    const watchPath = join(homedir(), '.claude', 'projects', '**', '*.jsonl')

    this.watcher = watch(watchPath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      ignored: this.config.excludePatterns,
    })

    this.watcher.on('add', (path) => this.onFileAdded(path))
    this.watcher.on('change', (path) => this.onFileChanged(path))
    this.watcher.on('error', (error) => this.onWatchError(error))

    this.enabled = true
    console.info('[SessionWorker] Session embedding worker started')
  }

  /**
   * Stop watching and clean up
   */
  async stop(): Promise<void> {
    if (!this.enabled) {
      return
    }

    console.info('[SessionWorker] Stopping session embedding worker...')

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()

    // Close watcher
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    // Save positions
    await this.savePositions()

    this.enabled = false
    console.info('[SessionWorker] Session embedding worker stopped')
  }

  /**
   * Process a session file from scratch
   */
  async processFile(filePath: string): Promise<number> {
    if (!this.enabled || !existsSync(filePath)) {
      return 0
    }

    const position = this.positions.get(filePath) || {
      path: filePath,
      byteOffset: 0,
      lineNumber: 0,
      mtime: 0,
      sessionId: this.extractSessionId(filePath),
    }

    return this.processFileFromPosition(filePath, position)
  }

  /**
   * Get current status
   */
  getStatus(): {
    enabled: boolean
    watchedFiles: number
    positions: number
    processing: number
  } {
    return {
      enabled: this.enabled,
      watchedFiles: this.watcher ? Object.keys(this.watcher.getWatched()).length : 0,
      positions: this.positions.size,
      processing: this.processing.size,
    }
  }

  /**
   * Get positions for all tracked sessions
   */
  getPositions(): SessionPosition[] {
    return Array.from(this.positions.values())
  }

  /**
   * Reset position for a specific file (reprocess from beginning)
   */
  resetPosition(filePath: string): void {
    this.positions.delete(filePath)
    this.savePositions().catch(console.error)
  }

  /**
   * Reset all positions
   */
  resetAllPositions(): void {
    this.positions.clear()
    this.savePositions().catch(console.error)
  }

  // ============================================================================
  // FILE WATCHING
  // ============================================================================

  private onFileAdded(filePath: string): void {
    if (!this.shouldProcess(filePath)) {
      return
    }

    console.info(`[SessionWorker] New session file detected: ${basename(filePath)}`)
    this.scheduleProcessing(filePath)
  }

  private onFileChanged(filePath: string): void {
    if (!this.shouldProcess(filePath)) {
      return
    }

    this.scheduleProcessing(filePath)
  }

  private onWatchError(error: Error): void {
    console.error('[SessionWorker] Watch error:', error)
    this.emit('error', error)
  }

  private shouldProcess(filePath: string): boolean {
    // Check if it's a transcript file
    if (!filePath.endsWith('.jsonl')) {
      return false
    }

    // Skip if in exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (filePath.includes(pattern.replace(/\*\*/g, '').replace(/\*/g, ''))) {
        return false
      }
    }

    return true
  }

  private scheduleProcessing(filePath: string): void {
    // Cancel existing timer
    const existingTimer = this.debounceTimers.get(filePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Schedule new processing
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath)
      this.processFileIncremental(filePath).catch(console.error)
    }, this.config.debounceMs)

    this.debounceTimers.set(filePath, timer)
  }

  // ============================================================================
  // FILE PROCESSING
  // ============================================================================

  private async processFileIncremental(filePath: string): Promise<void> {
    if (this.processing.has(filePath)) {
      return // Already processing
    }

    this.processing.add(filePath)

    try {
      const stat = statSync(filePath)
      let position = this.positions.get(filePath)

      // Check if file was modified
      if (position && stat.mtimeMs === position.mtime) {
        return // No changes
      }

      // Initialize position if needed
      if (!position) {
        position = {
          path: filePath,
          byteOffset: 0,
          lineNumber: 0,
          mtime: 0,
          sessionId: this.extractSessionId(filePath),
        }
      }

      const processed = await this.processFileFromPosition(filePath, position)

      if (processed > 0) {
        console.info(`[SessionWorker] Processed ${processed} entries from ${basename(filePath)}`)
        this.emit('processed', { filePath, entries: processed })
      }
    } catch (error) {
      console.error(`[SessionWorker] Error processing ${filePath}:`, error)
      this.emit('error', { filePath, error })
    } finally {
      this.processing.delete(filePath)
    }
  }

  private async processFileFromPosition(
    filePath: string,
    position: SessionPosition
  ): Promise<number> {
    const stat = statSync(filePath)
    let processedCount = 0
    let currentLine = 0
    let currentByte = 0

    const stream = createReadStream(filePath, {
      encoding: 'utf-8',
      start: position.byteOffset,
    })

    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      currentLine++
      currentByte += Buffer.byteLength(line, 'utf-8') + 1 // +1 for newline

      // Skip empty lines
      if (!line.trim()) {
        continue
      }

      try {
        const entry = JSON.parse(line) as SessionEntry
        const tasks = this.extractEmbeddingTasks(entry, position.sessionId, filePath)

        for (const task of tasks) {
          await this.pipeline.addTask(task)
          processedCount++
        }
      } catch {
        // Log but continue processing
        console.warn(`[SessionWorker] Failed to parse line ${position.lineNumber + currentLine}`)
      }
    }

    // Update position
    position.byteOffset += currentByte
    position.lineNumber += currentLine
    position.mtime = stat.mtimeMs
    this.positions.set(filePath, position)

    // Periodically save positions
    if (processedCount > 0 && processedCount % 100 === 0) {
      await this.savePositions()
    }

    return processedCount
  }

  // ============================================================================
  // CONTENT EXTRACTION
  // ============================================================================

  private extractEmbeddingTasks(
    entry: SessionEntry,
    sessionId: string,
    filePath: string
  ): EmbeddingTask[] {
    const tasks: EmbeddingTask[] = []
    const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now()

    // Extract content based on entry type
    let content: string | null = null
    let contentType: ContentType = 'conversation'
    let speaker: 'user' | 'assistant' | 'system' | undefined

    if (entry.type === 'user' && entry.message) {
      content = this.extractMessageContent(entry.message)
      speaker = 'user'
      contentType = 'conversation'
    } else if (entry.type === 'assistant' && entry.message) {
      content = this.extractMessageContent(entry.message)
      speaker = 'assistant'
      contentType = 'conversation'
    } else if (entry.type === 'tool_result' && entry.toolResult) {
      content = entry.toolResult.content || ''
      contentType = 'tool_result'

      // Detect code content
      if (this.looksLikeCode(content)) {
        contentType = 'code'
      }
    }

    // Skip if no content or too short
    if (!content || content.length < this.config.minContentLength) {
      return tasks
    }

    // Check if content type is enabled
    if (contentType === 'conversation' && !this.config.enableSessions) {
      return tasks
    }
    if (contentType === 'code' && !this.config.enableCode) {
      return tasks
    }

    // Chunk the content
    const chunks = this.chunker.chunk(content, contentType, {
      sourceId: `${sessionId}-${timestamp}`,
      timestamp,
      sessionId,
      speaker,
      projectPath: dirname(filePath),
    })

    // Create tasks from chunks
    for (const chunk of chunks) {
      const task: EmbeddingTask = {
        idempotencyKey: `${sessionId}-${chunk.contentHash}`,
        text: chunk.text,
        metadata: chunk.metadata,
        priority: 'normal',
        attemptCount: 0,
        createdAt: Date.now(),
      }

      tasks.push(task)
    }

    return tasks
  }

  private extractMessageContent(
    message: SessionEntry['message']
  ): string | null {
    if (!message) return null

    if (typeof message.content === 'string') {
      return message.content
    }

    if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text || part.content || '')
        .filter(Boolean)

      return textParts.length > 0 ? textParts.join('\n\n') : null
    }

    return null
  }

  private looksLikeCode(content: string): boolean {
    // Simple heuristics for code detection
    const codeIndicators = [
      /^(import|export|const|let|var|function|class|interface|type)\s+/m,
      /^(def|class|import|from|async def)\s+/m,
      /^(func|package|import|type|struct)\s+/m,
      /^\s*(public|private|protected)\s+(static\s+)?(void|int|String|class)/m,
      /\{\s*\n|\}\s*$/m,
      /=>\s*\{/,
      /\(\)\s*\{/,
    ]

    for (const pattern of codeIndicators) {
      if (pattern.test(content)) {
        return true
      }
    }

    return false
  }

  private extractSessionId(filePath: string): string {
    // Extract session ID from file path
    // Format: ~/.claude/projects/-home-user-project/session-id.jsonl
    const fileName = basename(filePath, '.jsonl')
    return fileName
  }

  // ============================================================================
  // POSITION PERSISTENCE
  // ============================================================================

  private async savePositions(): Promise<void> {
    try {
      const data = Array.from(this.positions.values())
      await writeFile(this.positionsPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('[SessionWorker] Failed to save positions:', error)
    }
  }

  private async restorePositions(): Promise<void> {
    try {
      if (!existsSync(this.positionsPath)) {
        return
      }

      const data = await readFile(this.positionsPath, 'utf-8')
      const positions: SessionPosition[] = JSON.parse(data)

      for (const position of positions) {
        // Validate file still exists
        if (existsSync(position.path)) {
          this.positions.set(position.path, position)
        }
      }

      console.info(`[SessionWorker] Restored ${this.positions.size} session positions`)
    } catch (error) {
      console.error('[SessionWorker] Failed to restore positions:', error)
    }
  }
}

// Export factory function
export function createSessionEmbeddingWorker(
  pipeline: EmbeddingPipeline,
  chunker: ContentChunker,
  config?: Partial<AutoEmbedConfig>
): SessionEmbeddingWorker {
  return new SessionEmbeddingWorker(pipeline, chunker, config)
}
