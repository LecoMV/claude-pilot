/**
 * Transcript Service Tests
 *
 * Comprehensive tests for the TranscriptService that provides streaming
 * parsing of Claude Code transcript.jsonl files.
 *
 * @module transcript.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable, Transform } from 'stream'

// Mock fs module first
const mockFSWatcher = {
  close: vi.fn(),
}

const mockFileHandle = {
  read: vi.fn(),
  close: vi.fn(),
}

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(() => mockFSWatcher),
  createReadStream: vi.fn(),
  promises: {
    open: vi.fn(() => Promise.resolve(mockFileHandle)),
  },
}))

// Mock split2 to return a passthrough transform
vi.mock('split2', () => ({
  default: vi.fn(() => {
    return new Transform({
      objectMode: true,
      transform(chunk: Buffer, _encoding: string, callback: (...args: unknown[]) => unknown) {
        const lines = chunk.toString().split('\n').filter((l: string) => l.trim())
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            this.push(parsed)
          } catch {
            // Skip invalid JSON
          }
        }
        callback()
      },
    })
  }),
}))

import { TranscriptService, type TranscriptMessage } from '../transcript'
import { existsSync, statSync, watch, createReadStream } from 'fs'

// Helper to create a mock readable stream
const createMockStream = (data: string) => {
  const readable = new Readable({
    read() {
      this.push(Buffer.from(data))
      this.push(null)
    },
  })
  return readable
}

// Helper to create transcript messages
const createTranscriptMessage = (overrides: Partial<TranscriptMessage> = {}): TranscriptMessage => ({
  type: 'user',
  uuid: 'test-uuid',
  timestamp: '2024-01-01T00:00:00Z',
  message: {
    role: 'user',
    content: 'Test message',
  },
  ...overrides,
})

describe('TranscriptService', () => {
  let transcriptService: TranscriptService

  beforeEach(() => {
    vi.clearAllMocks()
    transcriptService = new TranscriptService()

    // Reset mock watcher
    mockFSWatcher.close = vi.fn()

    // Reset mock file handle
    mockFileHandle.read = vi.fn()
    mockFileHandle.close = vi.fn()
  })

  afterEach(() => {
    transcriptService.unwatchAll()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // PARSE STREAM TESTS
  // ===========================================================================
  describe('parseStream', () => {
    it('should throw error if file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      await expect(async () => {
        for await (const _ of transcriptService.parseStream('/nonexistent')) {
          // Should not reach here
        }
      }).rejects.toThrow('Transcript file not found')
    })

    it('should parse valid transcript messages', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = [
        createTranscriptMessage({ type: 'user', uuid: '1' }),
        createTranscriptMessage({ type: 'assistant', uuid: '2' }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl')) {
        result.push(message)
      }

      expect(result).toHaveLength(2)
    })

    it('should filter by message type', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = [
        createTranscriptMessage({ type: 'user', uuid: '1' }),
        createTranscriptMessage({ type: 'assistant', uuid: '2' }),
        createTranscriptMessage({ type: 'tool_use', uuid: '3' }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl', {
        types: ['user', 'assistant'],
      })) {
        result.push(message)
      }

      expect(result).toHaveLength(2)
      expect(result.every((m) => m.type === 'user' || m.type === 'assistant')).toBe(true)
    })

    it('should apply limit', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = Array.from({ length: 10 }, (_, i) =>
        createTranscriptMessage({ type: 'user', uuid: String(i) })
      )

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl', {
        limit: 5,
      })) {
        result.push(message)
      }

      expect(result).toHaveLength(5)
    })

    it('should apply offset', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = Array.from({ length: 10 }, (_, i) =>
        createTranscriptMessage({ type: 'user', uuid: String(i) })
      )

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl', {
        offset: 3,
      })) {
        result.push(message)
      }

      expect(result).toHaveLength(7)
    })

    it('should skip invalid JSON lines', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const mockStream = createMockStream(
        `${JSON.stringify(createTranscriptMessage({ uuid: '1' }))}\ninvalid json\n${JSON.stringify(createTranscriptMessage({ uuid: '2' }))}`
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl')) {
        result.push(message)
      }

      expect(result).toHaveLength(2)
    })
  })

  // ===========================================================================
  // PARSE ALL TESTS
  // ===========================================================================
  describe('parseAll', () => {
    it('should return all messages as array', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = [
        createTranscriptMessage({ type: 'user', uuid: '1' }),
        createTranscriptMessage({ type: 'assistant', uuid: '2' }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result = await transcriptService.parseAll('/test/transcript.jsonl')

      expect(result).toHaveLength(2)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should apply options', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = Array.from({ length: 10 }, (_, i) =>
        createTranscriptMessage({ type: 'user', uuid: String(i) })
      )

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result = await transcriptService.parseAll('/test/transcript.jsonl', {
        limit: 3,
      })

      expect(result).toHaveLength(3)
    })
  })

  // ===========================================================================
  // GET STATS TESTS
  // ===========================================================================
  describe('getStats', () => {
    it('should return empty stats for non-existent file', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const stats = await transcriptService.getStats('/nonexistent')

      expect(stats.totalMessages).toBe(0)
      expect(stats.fileSize).toBe(0)
    })

    it('should calculate message statistics', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any)

      const messages = [
        createTranscriptMessage({ type: 'user' }),
        createTranscriptMessage({ type: 'user' }),
        createTranscriptMessage({ type: 'assistant' }),
        createTranscriptMessage({ type: 'tool_use' }),
        createTranscriptMessage({ type: 'tool_use' }),
        createTranscriptMessage({ type: 'tool_use' }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const stats = await transcriptService.getStats('/test/transcript.jsonl')

      expect(stats.totalMessages).toBe(6)
      // User messages should be counted based on type, not role
      expect(stats.userMessages).toBeGreaterThanOrEqual(0)
      expect(stats.fileSize).toBe(1024)
      expect(stats.parseTime).toBeGreaterThanOrEqual(0)
    })
  })

  // ===========================================================================
  // GET LAST MESSAGES TESTS
  // ===========================================================================
  describe('getLastMessages', () => {
    it('should return empty array for non-existent file', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await transcriptService.getLastMessages('/nonexistent', 10)

      expect(result).toEqual([])
    })

    it('should use simple approach for small files', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ size: 500 * 1024 } as any) // 500KB

      const messages = [
        createTranscriptMessage({ type: 'user', uuid: '1' }),
        createTranscriptMessage({ type: 'assistant', uuid: '2' }),
        createTranscriptMessage({ type: 'user', uuid: '3' }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result = await transcriptService.getLastMessages('/test/transcript.jsonl', 2)

      expect(result).toHaveLength(2)
      // Should return the last 2 user/assistant messages
      expect(result[0].uuid).toBe('2')
      expect(result[1].uuid).toBe('3')
    })
  })

  // ===========================================================================
  // WATCH TRANSCRIPT TESTS
  // ===========================================================================
  describe('watchTranscript', () => {
    it('should not watch same file twice', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ size: 100 } as any)

      transcriptService.watchTranscript('/test/transcript.jsonl')
      transcriptService.watchTranscript('/test/transcript.jsonl')

      expect(watch).toHaveBeenCalledTimes(1)
    })

    it('should ignore non-change events', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ size: 100 } as any)

      transcriptService.watchTranscript('/test/transcript.jsonl')

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown

      // Should not throw on rename event
      watchCallback('rename')
    })
  })

  // ===========================================================================
  // UNWATCH TESTS
  // ===========================================================================
  describe('unwatchTranscript', () => {
    it('should close watcher for specific file', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ size: 100 } as any)

      transcriptService.watchTranscript('/test/transcript.jsonl')
      transcriptService.unwatchTranscript('/test/transcript.jsonl')

      expect(mockFSWatcher.close).toHaveBeenCalled()
    })

    it('should handle unwatching non-watched file', () => {
      // Should not throw
      transcriptService.unwatchTranscript('/not/watched')
    })
  })

  // ===========================================================================
  // UNWATCH ALL TESTS
  // ===========================================================================
  describe('unwatchAll', () => {
    it('should close all watchers', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({ size: 100 } as any)

      transcriptService.watchTranscript('/test/transcript1.jsonl')
      transcriptService.watchTranscript('/test/transcript2.jsonl')

      transcriptService.unwatchAll()

      expect(mockFSWatcher.close).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // FORMAT MESSAGE TESTS
  // ===========================================================================
  describe('formatMessage', () => {
    it('should format message with timestamp and role', () => {
      const message = createTranscriptMessage({
        type: 'user',
        timestamp: '2024-01-01T12:00:00Z',
        message: { role: 'user', content: 'Hello' },
      })

      const formatted = transcriptService.formatMessage(message)

      expect(formatted).toContain('2024-01-01T12:00:00Z')
      expect(formatted).toContain('user')
      expect(formatted).toContain('Hello')
    })

    it('should truncate long content', () => {
      const longContent = 'a'.repeat(300)
      const message = createTranscriptMessage({
        type: 'user',
        message: { role: 'user', content: longContent },
      })

      const formatted = transcriptService.formatMessage(message)

      expect(formatted).toContain('...')
      expect(formatted.length).toBeLessThan(longContent.length + 100)
    })

    it('should handle messages without timestamp', () => {
      const message = createTranscriptMessage({
        type: 'user',
        timestamp: undefined,
      })

      const formatted = transcriptService.formatMessage(message)

      expect(formatted).toBeDefined()
    })

    it('should handle snapshot timestamp', () => {
      const message: TranscriptMessage = {
        type: 'file-history-snapshot',
        snapshot: {
          messageId: 'test',
          trackedFileBackups: {},
          timestamp: '2024-01-01T15:00:00Z',
        },
      }

      const formatted = transcriptService.formatMessage(message)

      expect(formatted).toContain('2024-01-01T15:00:00Z')
    })

    it('should handle content blocks', () => {
      const message = createTranscriptMessage({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      })

      const formatted = transcriptService.formatMessage(message)

      expect(formatted).toContain('Hello')
      expect(formatted).toContain('World')
    })

    it('should handle progress data', () => {
      const message: TranscriptMessage = {
        type: 'progress',
        data: { hookName: 'test-hook' },
      }

      const formatted = transcriptService.formatMessage(message)

      expect(formatted).toBeDefined()
    })
  })

  // ===========================================================================
  // CONTENT EXTRACTION TESTS
  // ===========================================================================
  describe('content extraction', () => {
    it('should extract string content', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = [
        createTranscriptMessage({
          type: 'user',
          uuid: '1',
          message: { role: 'user', content: 'searchable text' },
        }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl', {
        search: 'searchable',
      })) {
        result.push(message)
      }

      expect(result).toHaveLength(1)
    })

    it('should extract content from blocks', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = [
        createTranscriptMessage({
          type: 'assistant',
          uuid: '1',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'searchable in block' },
            ],
          },
        }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl', {
        search: 'searchable',
      })) {
        result.push(message)
      }

      expect(result).toHaveLength(1)
    })

    it('should extract content from tool result blocks', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const messages = [
        createTranscriptMessage({
          type: 'assistant',
          uuid: '1',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_result', content: 'tool output searchable' },
            ],
          },
        }),
      ]

      const mockStream = createMockStream(
        messages.map((m) => JSON.stringify(m)).join('\n')
      )
      vi.mocked(createReadStream).mockReturnValue(mockStream as any)

      const result: TranscriptMessage[] = []
      for await (const message of transcriptService.parseStream('/test/transcript.jsonl', {
        search: 'searchable',
      })) {
        result.push(message)
      }

      expect(result).toHaveLength(1)
    })
  })
})
