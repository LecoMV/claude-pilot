// Transcript Parser Service - Streaming parser for Claude Code transcript.jsonl files
// Uses Node.js streams for memory-efficient parsing of large transcripts

import {
  createReadStream,
  statSync,
  existsSync,
  watch,
  FSWatcher,
  promises as fsPromises,
} from 'fs'
import split2 from 'split2'
import { EventEmitter } from 'events'

// Chunk size for reverse reading (64KB is a good balance)
const REVERSE_READ_CHUNK_SIZE = 64 * 1024

// Transcript message types based on Claude Code's transcript format
export type TranscriptMessageType =
  | 'file-history-snapshot'
  | 'progress'
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'summary'
  | 'system'

export interface TranscriptMessage {
  type: TranscriptMessageType
  parentUuid?: string | null
  isSidechain?: boolean
  userType?: 'external' | 'internal'
  cwd?: string
  sessionId?: string
  version?: string
  gitBranch?: string
  uuid?: string
  timestamp?: string
  message?: {
    role: 'user' | 'assistant'
    content: string | ContentBlock[]
  }
  data?: unknown
  toolUseID?: string
  parentToolUseID?: string
  snapshot?: {
    messageId: string
    trackedFileBackups: Record<string, unknown>
    timestamp: string
  }
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: unknown
  content?: string
  is_error?: boolean
}

export interface TranscriptStats {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  toolCalls: number
  fileSize: number
  parseTime: number
}

export interface ParseOptions {
  /** Filter by message type */
  types?: TranscriptMessageType[]
  /** Maximum number of messages to return */
  limit?: number
  /** Skip this many messages from the start */
  offset?: number
  /** Only return messages after this timestamp */
  after?: Date
  /** Only return messages before this timestamp */
  before?: Date
  /** Search content for this string */
  search?: string
}

class TranscriptService extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map()

  /**
   * Parse a transcript file and yield messages as an async generator
   * Memory efficient - doesn't load entire file into memory
   */
  async *parseStream(
    filePath: string,
    options: ParseOptions = {}
  ): AsyncGenerator<TranscriptMessage, void, unknown> {
    if (!existsSync(filePath)) {
      throw new Error(`Transcript file not found: ${filePath}`)
    }

    const { types, limit, offset = 0, after, before, search } = options
    let count = 0
    let yielded = 0

    const stream = createReadStream(filePath, { encoding: 'utf8' }).pipe(
      split2((line: string) => {
        try {
          return JSON.parse(line) as TranscriptMessage
        } catch {
          return null // Skip invalid lines
        }
      })
    )

    for await (const message of stream) {
      if (!message) continue

      count++

      // Apply filters
      if (count <= offset) continue
      if (types && !types.includes(message.type)) continue

      // Timestamp filters
      if (after || before) {
        const msgTime = message.timestamp || message.snapshot?.timestamp
        if (msgTime) {
          const msgDate = new Date(msgTime)
          if (after && msgDate < after) continue
          if (before && msgDate > before) continue
        }
      }

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const content = this.extractContent(message)
        if (!content.toLowerCase().includes(searchLower)) continue
      }

      yield message
      yielded++

      if (limit && yielded >= limit) break
    }
  }

  /**
   * Parse entire transcript and return all messages
   * Use for smaller files or when you need all messages
   */
  async parseAll(filePath: string, options: ParseOptions = {}): Promise<TranscriptMessage[]> {
    const messages: TranscriptMessage[] = []
    for await (const message of this.parseStream(filePath, options)) {
      messages.push(message)
    }
    return messages
  }

  /**
   * Get transcript statistics without loading all messages
   */
  async getStats(filePath: string): Promise<TranscriptStats> {
    const startTime = Date.now()
    const stats: TranscriptStats = {
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      fileSize: 0,
      parseTime: 0,
    }

    if (!existsSync(filePath)) {
      return stats
    }

    stats.fileSize = statSync(filePath).size

    for await (const message of this.parseStream(filePath)) {
      stats.totalMessages++

      if (message.type === 'user' || message.message?.role === 'user') {
        stats.userMessages++
      } else if (message.type === 'assistant' || message.message?.role === 'assistant') {
        stats.assistantMessages++
      } else if (message.type === 'tool_use') {
        stats.toolCalls++
      }
    }

    stats.parseTime = Date.now() - startTime
    return stats
  }

  /**
   * Get the last N messages from a transcript (efficiently)
   * Uses reverse reading for large files to avoid loading entire file into memory
   *
   * For files < 1MB: read all and take last N (simple and fast)
   * For files >= 1MB: read from end in chunks (memory efficient)
   */
  getLastMessages(filePath: string, count: number): Promise<TranscriptMessage[]> {
    if (!existsSync(filePath)) {
      return Promise.resolve([])
    }

    const stats = statSync(filePath)
    const fileSize = stats.size

    // For small files, use simple approach
    const SMALL_FILE_THRESHOLD = 1024 * 1024 // 1MB
    if (fileSize < SMALL_FILE_THRESHOLD) {
      return this.getLastMessagesSimple(filePath, count)
    }

    // For large files, use reverse reading
    return this.getLastMessagesReverse(filePath, count, fileSize)
  }

  /**
   * Simple approach for small files - read all and take last N
   */
  private async getLastMessagesSimple(
    filePath: string,
    count: number
  ): Promise<TranscriptMessage[]> {
    const messages: TranscriptMessage[] = []

    for await (const message of this.parseStream(filePath)) {
      messages.push(message)
      // Keep only last 'count * 3' to handle skipping non-message types
      if (messages.length > count * 3) {
        messages.splice(0, messages.length - count * 2)
      }
    }

    // Filter to actual messages and take last N
    return this.filterToUserAssistantMessages(messages).slice(-count)
  }

  /**
   * Efficient reverse reading for large files
   * Reads from the end of the file in chunks, parsing JSONL lines in reverse
   */
  private async getLastMessagesReverse(
    filePath: string,
    count: number,
    fileSize: number
  ): Promise<TranscriptMessage[]> {
    const messages: TranscriptMessage[] = []
    const targetCount = count * 3 // Collect more since some may be filtered out

    let position = fileSize
    let leftoverBuffer = ''

    const fd = await fsPromises.open(filePath, 'r')

    try {
      while (position > 0 && messages.length < targetCount) {
        // Calculate chunk position
        const chunkSize = Math.min(REVERSE_READ_CHUNK_SIZE, position)
        position -= chunkSize

        // Read chunk
        const buffer = Buffer.alloc(chunkSize)
        await fd.read(buffer, 0, chunkSize, position)
        const chunk = buffer.toString('utf8')

        // Combine with leftover from previous iteration
        const combined = chunk + leftoverBuffer

        // Split into lines
        const lines = combined.split('\n')

        // The first line may be partial (if we're in the middle of a line)
        // Save it for the next iteration
        leftoverBuffer = lines[0]

        // Process lines in reverse order (skip first which may be partial)
        for (let i = lines.length - 1; i > 0; i--) {
          const line = lines[i].trim()
          if (!line) continue

          try {
            const message = JSON.parse(line) as TranscriptMessage
            messages.unshift(message) // Add to front to maintain order
          } catch {
            // Skip invalid JSON lines
          }

          // Stop early if we have enough messages
          if (messages.length >= targetCount) break
        }
      }

      // Process any remaining leftover (first line of file)
      if (leftoverBuffer.trim()) {
        try {
          const message = JSON.parse(leftoverBuffer) as TranscriptMessage
          messages.unshift(message)
        } catch {
          // Skip invalid JSON
        }
      }
    } finally {
      await fd.close()
    }

    // Filter to user/assistant messages and take last N
    return this.filterToUserAssistantMessages(messages).slice(-count)
  }

  /**
   * Helper to filter messages to only user and assistant types
   */
  private filterToUserAssistantMessages(messages: TranscriptMessage[]): TranscriptMessage[] {
    return messages.filter(
      (m) =>
        m.type === 'user' ||
        m.type === 'assistant' ||
        m.message?.role === 'user' ||
        m.message?.role === 'assistant'
    )
  }

  /**
   * Watch a transcript file for changes
   * Emits 'message' events for new messages
   */
  watchTranscript(filePath: string): void {
    if (this.watchers.has(filePath)) return

    let lastSize = existsSync(filePath) ? statSync(filePath).size : 0

    const watcher = watch(filePath, { persistent: false }, async (eventType) => {
      if (eventType !== 'change') return

      try {
        const currentSize = statSync(filePath).size
        if (currentSize <= lastSize) {
          lastSize = currentSize
          return
        }

        // Read new content from the end
        const stream = createReadStream(filePath, {
          encoding: 'utf8',
          start: lastSize,
        }).pipe(
          split2((line: string) => {
            try {
              return JSON.parse(line) as TranscriptMessage
            } catch {
              return null
            }
          })
        )

        for await (const message of stream) {
          if (message) {
            this.emit('message', filePath, message)
          }
        }

        lastSize = currentSize
      } catch (error) {
        console.error('Error watching transcript:', error)
      }
    })

    this.watchers.set(filePath, watcher)
  }

  /**
   * Stop watching a transcript file
   */
  unwatchTranscript(filePath: string): void {
    const watcher = this.watchers.get(filePath)
    if (watcher) {
      watcher.close()
      this.watchers.delete(filePath)
    }
  }

  /**
   * Stop watching all transcript files
   */
  unwatchAll(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close()
      this.watchers.delete(path)
    }
  }

  /**
   * Extract readable content from a message
   */
  private extractContent(message: TranscriptMessage): string {
    // Check message.message.content first
    if (message.message?.content) {
      if (typeof message.message.content === 'string') {
        return message.message.content
      }
      // Array of content blocks
      return message.message.content.map((block) => block.text || block.content || '').join(' ')
    }

    // Check progress data
    if (message.data && typeof message.data === 'object') {
      const data = message.data as Record<string, unknown>
      if (data.hookName) return String(data.hookName)
      if (data.command) return String(data.command)
    }

    return ''
  }

  /**
   * Format a message for display
   */
  formatMessage(message: TranscriptMessage): string {
    const content = this.extractContent(message)
    const timestamp = message.timestamp || message.snapshot?.timestamp || ''
    const role = message.message?.role || message.type

    return `[${timestamp}] ${role}: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`
  }
}

// Export singleton instance
export const transcriptService = new TranscriptService()

// Export class for testing
export { TranscriptService }
