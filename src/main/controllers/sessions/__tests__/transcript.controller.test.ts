/**
 * Transcript Controller Tests
 *
 * Comprehensive tests for the transcript tRPC controller.
 * Tests all 4 procedures: parse, stats, last, watch
 *
 * @module transcript.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcriptRouter } from '../transcript.controller'
import { transcriptService } from '../../../services/transcript'

// Mock the transcript service
vi.mock('../../../services/transcript', () => ({
  transcriptService: {
    parseAll: vi.fn(),
    getStats: vi.fn(),
    getLastMessages: vi.fn(),
    watchTranscript: vi.fn(),
    unwatchTranscript: vi.fn(),
  },
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => transcriptRouter.createCaller({})

describe('transcript.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // PARSE PROCEDURE
  // ===========================================================================
  describe('parse', () => {
    it('should reject empty file path', async () => {
      await expect(caller.parse({ filePath: '' })).rejects.toThrow()
    })

    it('should parse transcript without options', async () => {
      const mockMessages = [
        { type: 'user', message: { role: 'user', content: 'Hello' } },
        { type: 'assistant', message: { role: 'assistant', content: 'Hi there' } },
      ]
      vi.mocked(transcriptService.parseAll).mockResolvedValue(mockMessages as never)

      const result = await caller.parse({ filePath: '/path/to/transcript.jsonl' })

      expect(result).toEqual(mockMessages)
      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        {}
      )
    })

    it('should pass type filters to service', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: {
          types: ['user', 'assistant'],
        },
      })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        expect.objectContaining({
          types: ['user', 'assistant'],
        })
      )
    })

    it('should accept all valid message types', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: {
          types: [
            'file-history-snapshot',
            'progress',
            'user',
            'assistant',
            'tool_use',
            'tool_result',
            'summary',
            'system',
          ],
        },
      })

      expect(transcriptService.parseAll).toHaveBeenCalled()
    })

    it('should reject invalid message types', async () => {
      await expect(
        caller.parse({
          filePath: '/path/to/transcript.jsonl',
          options: {
            types: ['invalid_type' as never],
          },
        })
      ).rejects.toThrow()
    })

    it('should pass limit option to service', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: { limit: 50 },
      })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        expect.objectContaining({ limit: 50 })
      )
    })

    it('should reject non-positive limit', async () => {
      await expect(
        caller.parse({
          filePath: '/path/to/transcript.jsonl',
          options: { limit: 0 },
        })
      ).rejects.toThrow()

      await expect(
        caller.parse({
          filePath: '/path/to/transcript.jsonl',
          options: { limit: -5 },
        })
      ).rejects.toThrow()
    })

    it('should pass offset option to service', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: { offset: 10 },
      })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        expect.objectContaining({ offset: 10 })
      )
    })

    it('should reject negative offset', async () => {
      await expect(
        caller.parse({
          filePath: '/path/to/transcript.jsonl',
          options: { offset: -1 },
        })
      ).rejects.toThrow()
    })

    it('should accept offset of 0', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      const result = await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: { offset: 0 },
      })

      expect(result).toEqual([])
    })

    it('should pass date filters to service', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      const afterDate = new Date('2024-01-01')
      const beforeDate = new Date('2024-12-31')

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: {
          after: afterDate,
          before: beforeDate,
        },
      })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        expect.objectContaining({
          after: expect.any(Date),
          before: expect.any(Date),
        })
      )
    })

    it('should coerce string dates to Date objects', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: {
          after: '2024-01-01' as unknown as Date,
          before: '2024-12-31' as unknown as Date,
        },
      })

      const callArgs = vi.mocked(transcriptService.parseAll).mock.calls[0][1]
      expect(callArgs?.after).toBeInstanceOf(Date)
      expect(callArgs?.before).toBeInstanceOf(Date)
    })

    it('should pass search option to service', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: { search: 'authentication' },
      })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        expect.objectContaining({ search: 'authentication' })
      )
    })

    it('should return empty array on service error', async () => {
      vi.mocked(transcriptService.parseAll).mockRejectedValue(new Error('File not found'))

      const result = await caller.parse({ filePath: '/nonexistent/transcript.jsonl' })

      expect(result).toEqual([])
    })

    it('should pass multiple options together', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      await caller.parse({
        filePath: '/path/to/transcript.jsonl',
        options: {
          types: ['user', 'assistant'],
          limit: 100,
          offset: 20,
          search: 'test',
        },
      })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        {
          types: ['user', 'assistant'],
          limit: 100,
          offset: 20,
          search: 'test',
        }
      )
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should reject empty file path', async () => {
      await expect(caller.stats({ filePath: '' })).rejects.toThrow()
    })

    it('should return transcript statistics', async () => {
      const mockStats = {
        totalMessages: 150,
        userMessages: 50,
        assistantMessages: 75,
        toolCalls: 25,
        fileSize: 1024000,
        parseTime: 45,
      }
      vi.mocked(transcriptService.getStats).mockResolvedValue(mockStats)

      const result = await caller.stats({ filePath: '/path/to/transcript.jsonl' })

      expect(result).toEqual(mockStats)
      expect(transcriptService.getStats).toHaveBeenCalledWith('/path/to/transcript.jsonl')
    })

    it('should return zeroed stats on service error', async () => {
      vi.mocked(transcriptService.getStats).mockRejectedValue(new Error('File not found'))

      const result = await caller.stats({ filePath: '/nonexistent/transcript.jsonl' })

      expect(result).toEqual({
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        toolCalls: 0,
        fileSize: 0,
        parseTime: 0,
      })
    })
  })

  // ===========================================================================
  // LAST PROCEDURE
  // ===========================================================================
  describe('last', () => {
    it('should reject empty file path', async () => {
      await expect(caller.last({ filePath: '', count: 10 })).rejects.toThrow()
    })

    it('should reject non-positive count', async () => {
      await expect(
        caller.last({ filePath: '/path/to/transcript.jsonl', count: 0 })
      ).rejects.toThrow()

      await expect(
        caller.last({ filePath: '/path/to/transcript.jsonl', count: -5 })
      ).rejects.toThrow()
    })

    it('should return last N messages', async () => {
      const mockMessages = [
        { type: 'user', message: { role: 'user', content: 'Message 1' } },
        { type: 'assistant', message: { role: 'assistant', content: 'Message 2' } },
      ]
      vi.mocked(transcriptService.getLastMessages).mockResolvedValue(mockMessages as never)

      const result = await caller.last({
        filePath: '/path/to/transcript.jsonl',
        count: 10,
      })

      expect(result).toEqual(mockMessages)
      expect(transcriptService.getLastMessages).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        10
      )
    })

    it('should use default count of 10', async () => {
      vi.mocked(transcriptService.getLastMessages).mockResolvedValue([])

      // Schema has default(10) for count, so omitting it should use 10
      const input = { filePath: '/path/to/transcript.jsonl' } as { filePath: string; count: number }
      await caller.last(input)

      expect(transcriptService.getLastMessages).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        10
      )
    })

    it('should return empty array on service error', async () => {
      vi.mocked(transcriptService.getLastMessages).mockRejectedValue(
        new Error('File not found')
      )

      const result = await caller.last({
        filePath: '/nonexistent/transcript.jsonl',
        count: 10,
      })

      expect(result).toEqual([])
    })

    it('should handle large count values', async () => {
      vi.mocked(transcriptService.getLastMessages).mockResolvedValue([])

      await caller.last({
        filePath: '/path/to/transcript.jsonl',
        count: 1000,
      })

      expect(transcriptService.getLastMessages).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl',
        1000
      )
    })
  })

  // ===========================================================================
  // WATCH PROCEDURE
  // ===========================================================================
  describe('watch', () => {
    it('should reject empty file path', async () => {
      await expect(caller.watch({ filePath: '', enable: true })).rejects.toThrow()
    })

    it('should enable watching when enable is true', async () => {
      const result = await caller.watch({
        filePath: '/path/to/transcript.jsonl',
        enable: true,
      })

      expect(result).toBe(true)
      expect(transcriptService.watchTranscript).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl'
      )
      expect(transcriptService.unwatchTranscript).not.toHaveBeenCalled()
    })

    it('should disable watching when enable is false', async () => {
      const result = await caller.watch({
        filePath: '/path/to/transcript.jsonl',
        enable: false,
      })

      expect(result).toBe(true)
      expect(transcriptService.unwatchTranscript).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl'
      )
      expect(transcriptService.watchTranscript).not.toHaveBeenCalled()
    })

    it('should always return true', async () => {
      const enableResult = await caller.watch({
        filePath: '/path/to/transcript.jsonl',
        enable: true,
      })
      expect(enableResult).toBe(true)

      const disableResult = await caller.watch({
        filePath: '/path/to/transcript.jsonl',
        enable: false,
      })
      expect(disableResult).toBe(true)
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should accept absolute file paths', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      // Absolute paths should be allowed
      await caller.parse({ filePath: '/home/user/.claude/sessions/transcript.jsonl' })
      await caller.parse({ filePath: '/var/log/transcript.jsonl' })

      expect(transcriptService.parseAll).toHaveBeenCalledTimes(2)
    })

    it('should accept relative file paths', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      // The controller doesn't sanitize paths - it relies on the service
      // These should be passed through
      await caller.parse({ filePath: './transcript.jsonl' })
      await caller.parse({ filePath: 'data/transcript.jsonl' })

      expect(transcriptService.parseAll).toHaveBeenCalledTimes(2)
    })

    it('should pass path traversal attempts to service (service handles security)', async () => {
      vi.mocked(transcriptService.parseAll).mockRejectedValue(new Error('File not found'))

      // The controller passes paths to the service which validates them
      // Path traversal should result in "file not found" or similar error
      const result = await caller.parse({
        filePath: '../../../etc/passwd',
      })

      // Error handling returns empty array
      expect(result).toEqual([])
    })

    it('should not log sensitive transcript content', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const sensitiveMessages = [
        {
          type: 'user',
          message: { role: 'user', content: 'API_KEY=secret123' },
        },
      ]
      vi.mocked(transcriptService.parseAll).mockResolvedValue(sensitiveMessages as never)

      await caller.parse({ filePath: '/path/to/transcript.jsonl' })

      // Verify that sensitive content was not logged
      const allCalls = [...consoleSpy.mock.calls, ...consoleInfoSpy.mock.calls]
      const hasSensitive = allCalls.some((call) =>
        call.some(
          (arg) => typeof arg === 'string' && arg.includes('secret123')
        )
      )

      expect(hasSensitive).toBe(false)

      consoleSpy.mockRestore()
      consoleInfoSpy.mockRestore()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent parse calls', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      const results = await Promise.all([
        caller.parse({ filePath: '/path/1.jsonl' }),
        caller.parse({ filePath: '/path/2.jsonl' }),
        caller.parse({ filePath: '/path/3.jsonl' }),
      ])

      expect(results).toHaveLength(3)
      expect(transcriptService.parseAll).toHaveBeenCalledTimes(3)
    })

    it('should handle very long file paths', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      const longPath = '/very/long/path/' + 'a'.repeat(200) + '/transcript.jsonl'
      await caller.parse({ filePath: longPath })

      expect(transcriptService.parseAll).toHaveBeenCalledWith(longPath, {})
    })

    it('should handle empty transcript', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])
      vi.mocked(transcriptService.getStats).mockResolvedValue({
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        toolCalls: 0,
        fileSize: 0,
        parseTime: 1,
      })

      const parseResult = await caller.parse({ filePath: '/empty/transcript.jsonl' })
      const statsResult = await caller.stats({ filePath: '/empty/transcript.jsonl' })

      expect(parseResult).toEqual([])
      expect(statsResult.totalMessages).toBe(0)
    })

    it('should handle special characters in file path', async () => {
      vi.mocked(transcriptService.parseAll).mockResolvedValue([])

      // Paths with spaces and special chars should be accepted
      await caller.parse({ filePath: '/path with spaces/transcript.jsonl' })
      await caller.parse({ filePath: '/path-with-dashes/transcript.jsonl' })
      await caller.parse({ filePath: '/path_with_underscores/transcript.jsonl' })

      expect(transcriptService.parseAll).toHaveBeenCalledTimes(3)
    })

    it('should handle watch toggle rapidly', async () => {
      await caller.watch({ filePath: '/path/transcript.jsonl', enable: true })
      await caller.watch({ filePath: '/path/transcript.jsonl', enable: false })
      await caller.watch({ filePath: '/path/transcript.jsonl', enable: true })
      await caller.watch({ filePath: '/path/transcript.jsonl', enable: false })

      expect(transcriptService.watchTranscript).toHaveBeenCalledTimes(2)
      expect(transcriptService.unwatchTranscript).toHaveBeenCalledTimes(2)
    })

    it('should handle messages with complex content structures', async () => {
      const complexMessages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Here is the result:' },
              { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: '/test.ts' } },
            ],
          },
        },
        {
          type: 'tool_result',
          toolUseID: 'tool_1',
          content: 'File contents here',
        },
      ]
      vi.mocked(transcriptService.parseAll).mockResolvedValue(complexMessages as never)

      const result = await caller.parse({ filePath: '/path/transcript.jsonl' })

      expect(result).toEqual(complexMessages)
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('workflow tests', () => {
    it('should handle typical transcript workflow', async () => {
      // Mock stats first
      vi.mocked(transcriptService.getStats).mockResolvedValue({
        totalMessages: 100,
        userMessages: 40,
        assistantMessages: 50,
        toolCalls: 10,
        fileSize: 50000,
        parseTime: 25,
      })

      // Check stats
      const stats = await caller.stats({ filePath: '/session/transcript.jsonl' })
      expect(stats.totalMessages).toBe(100)

      // Then get last few messages
      vi.mocked(transcriptService.getLastMessages).mockResolvedValue([
        { type: 'user', message: { role: 'user', content: 'Last question' } },
        { type: 'assistant', message: { role: 'assistant', content: 'Final answer' } },
      ] as never)

      const lastMessages = await caller.last({
        filePath: '/session/transcript.jsonl',
        count: 5,
      })
      expect(lastMessages).toHaveLength(2)

      // Start watching for new messages
      await caller.watch({
        filePath: '/session/transcript.jsonl',
        enable: true,
      })

      expect(transcriptService.watchTranscript).toHaveBeenCalled()

      // Stop watching
      await caller.watch({
        filePath: '/session/transcript.jsonl',
        enable: false,
      })

      expect(transcriptService.unwatchTranscript).toHaveBeenCalled()
    })

    it('should handle filtering specific message types', async () => {
      const userMessages = [
        { type: 'user', message: { role: 'user', content: 'Question 1' } },
        { type: 'user', message: { role: 'user', content: 'Question 2' } },
      ]
      vi.mocked(transcriptService.parseAll).mockResolvedValue(userMessages as never)

      const result = await caller.parse({
        filePath: '/session/transcript.jsonl',
        options: {
          types: ['user'],
          limit: 100,
        },
      })

      expect(result).toEqual(userMessages)
      expect(transcriptService.parseAll).toHaveBeenCalledWith(
        '/session/transcript.jsonl',
        { types: ['user'], limit: 100 }
      )
    })
  })
})
