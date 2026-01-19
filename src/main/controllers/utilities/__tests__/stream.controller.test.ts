/**
 * Stream Controller Tests
 *
 * Comprehensive tests for the stream tRPC controller.
 * Tests all 4 procedures: stats, list, getStatus, close
 *
 * @module stream.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamRouter } from '../stream.controller'

// Mock the streaming service
vi.mock('../../../services/streaming', () => ({
  messagePortStreamer: {
    getStats: vi.fn(),
    listStreams: vi.fn(),
    getStreamStatus: vi.fn(),
    closeStream: vi.fn(),
  },
}))

import { messagePortStreamer } from '../../../services/streaming'

// Create a test caller
const createTestCaller = () => streamRouter.createCaller({})

describe('stream.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return stream statistics', async () => {
      const mockStats = {
        activeStreams: 5,
        totalBytesTransferred: 1024000,
        streamsByType: { file: 3, data: 2 },
        maxConcurrent: 10,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result).toEqual(mockStats)
      expect(messagePortStreamer.getStats).toHaveBeenCalledTimes(1)
    })

    it('should return empty stats when no streams', async () => {
      const mockStats = {
        activeStreams: 0,
        totalBytesTransferred: 0,
        streamsByType: {},
        maxConcurrent: 10,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.activeStreams).toBe(0)
      expect(result.totalBytesTransferred).toBe(0)
      expect(result.streamsByType).toEqual({})
    })

    it('should return stats with all stream types', async () => {
      const mockStats = {
        activeStreams: 6,
        totalBytesTransferred: 5000000,
        streamsByType: { file: 2, data: 3, worker: 1 },
        maxConcurrent: 10,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.streamsByType.file).toBe(2)
      expect(result.streamsByType.data).toBe(3)
      expect(result.streamsByType.worker).toBe(1)
    })

    it('should return correct config values', async () => {
      const mockStats = {
        activeStreams: 0,
        totalBytesTransferred: 0,
        streamsByType: {},
        maxConcurrent: 20,
        chunkSize: 131072,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.maxConcurrent).toBe(20)
      expect(result.chunkSize).toBe(131072)
    })
  })

  // ===========================================================================
  // LIST PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return empty array when no streams', async () => {
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue([])

      const result = await caller.list()

      expect(result).toEqual([])
      expect(messagePortStreamer.listStreams).toHaveBeenCalledTimes(1)
    })

    it('should return list of active streams', async () => {
      const mockStreams = [
        {
          id: 'stream-1-1234567890',
          type: 'file' as const,
          createdAt: Date.now(),
          bytesTransferred: 50000,
          status: 'active' as const,
          metadata: { fileName: 'test.txt' },
        },
        {
          id: 'stream-2-1234567891',
          type: 'data' as const,
          createdAt: Date.now(),
          bytesTransferred: 10000,
          status: 'pending' as const,
        },
      ]
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue(mockStreams)

      const result = await caller.list()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('stream-1-1234567890')
      expect(result[0].type).toBe('file')
      expect(result[1].type).toBe('data')
    })

    it('should return streams with all status types', async () => {
      const mockStreams = [
        { id: 's1', type: 'file' as const, createdAt: 1, bytesTransferred: 0, status: 'pending' as const },
        { id: 's2', type: 'file' as const, createdAt: 2, bytesTransferred: 100, status: 'active' as const },
        { id: 's3', type: 'data' as const, createdAt: 3, bytesTransferred: 200, status: 'complete' as const },
        { id: 's4', type: 'worker' as const, createdAt: 4, bytesTransferred: 0, status: 'error' as const },
      ]
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue(mockStreams)

      const result = await caller.list()

      expect(result).toHaveLength(4)
      expect(result.map((s) => s.status)).toEqual(['pending', 'active', 'complete', 'error'])
    })

    it('should return streams with metadata', async () => {
      const mockStreams = [
        {
          id: 'stream-file',
          type: 'file' as const,
          createdAt: Date.now(),
          bytesTransferred: 1000,
          status: 'complete' as const,
          metadata: { filePath: '/path/to/file', fileSize: 5000 },
        },
      ]
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue(mockStreams)

      const result = await caller.list()

      expect(result[0].metadata).toBeDefined()
      expect(result[0].metadata?.filePath).toBe('/path/to/file')
      expect(result[0].metadata?.fileSize).toBe(5000)
    })

    it('should include all stream types (file, data, worker)', async () => {
      const mockStreams = [
        { id: 's1', type: 'file' as const, createdAt: 1, bytesTransferred: 100, status: 'active' as const },
        { id: 's2', type: 'data' as const, createdAt: 2, bytesTransferred: 200, status: 'active' as const },
        { id: 's3', type: 'worker' as const, createdAt: 3, bytesTransferred: 300, status: 'active' as const },
      ]
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue(mockStreams)

      const result = await caller.list()

      expect(result.map((s) => s.type)).toContain('file')
      expect(result.map((s) => s.type)).toContain('data')
      expect(result.map((s) => s.type)).toContain('worker')
    })
  })

  // ===========================================================================
  // GET STATUS PROCEDURE
  // ===========================================================================
  describe('getStatus', () => {
    it('should return status for existing stream', async () => {
      const mockStatus = {
        id: 'stream-1-1234567890',
        type: 'file' as const,
        status: 'active' as const,
        bytesTransferred: 25000,
        createdAt: Date.now(),
        metadata: { fileName: 'test.txt' },
      }
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(mockStatus)

      const result = await caller.getStatus({ streamId: 'stream-1-1234567890' })

      expect(result).toEqual(mockStatus)
      expect(messagePortStreamer.getStreamStatus).toHaveBeenCalledWith('stream-1-1234567890')
    })

    it('should return null for non-existent stream', async () => {
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(null)

      const result = await caller.getStatus({ streamId: 'non-existent-stream' })

      expect(result).toBeNull()
    })

    it('should reject empty stream ID', async () => {
      await expect(caller.getStatus({ streamId: '' })).rejects.toThrow()
    })

    it('should return stream with pending status', async () => {
      const mockStatus = {
        id: 'stream-pending',
        type: 'data' as const,
        status: 'pending' as const,
        bytesTransferred: 0,
        createdAt: Date.now(),
      }
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(mockStatus)

      const result = await caller.getStatus({ streamId: 'stream-pending' })

      expect(result?.status).toBe('pending')
      expect(result?.bytesTransferred).toBe(0)
    })

    it('should return stream with error status', async () => {
      const mockStatus = {
        id: 'stream-error',
        type: 'file' as const,
        status: 'error' as const,
        bytesTransferred: 5000,
        createdAt: Date.now(),
        metadata: { error: 'File not found' },
      }
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(mockStatus)

      const result = await caller.getStatus({ streamId: 'stream-error' })

      expect(result?.status).toBe('error')
    })

    it('should return stream with complete status', async () => {
      const mockStatus = {
        id: 'stream-complete',
        type: 'file' as const,
        status: 'complete' as const,
        bytesTransferred: 100000,
        createdAt: Date.now(),
      }
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(mockStatus)

      const result = await caller.getStatus({ streamId: 'stream-complete' })

      expect(result?.status).toBe('complete')
      expect(result?.bytesTransferred).toBe(100000)
    })

    it('should accept valid stream ID format', async () => {
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(null)

      // Various valid stream ID formats
      await expect(caller.getStatus({ streamId: 'stream-1-1234567890' })).resolves.toBeNull()
      await expect(caller.getStatus({ streamId: 'worker-stream-5-9999' })).resolves.toBeNull()
      await expect(caller.getStatus({ streamId: 'my-custom-stream-id' })).resolves.toBeNull()
    })
  })

  // ===========================================================================
  // CLOSE PROCEDURE
  // ===========================================================================
  describe('close', () => {
    it('should close an existing stream', async () => {
      vi.mocked(messagePortStreamer.closeStream).mockReturnValue(true)

      const result = await caller.close({ streamId: 'stream-1-1234567890' })

      expect(result).toBe(true)
      expect(messagePortStreamer.closeStream).toHaveBeenCalledWith('stream-1-1234567890')
    })

    it('should return false for non-existent stream', async () => {
      vi.mocked(messagePortStreamer.closeStream).mockReturnValue(false)

      const result = await caller.close({ streamId: 'non-existent' })

      expect(result).toBe(false)
    })

    it('should reject empty stream ID', async () => {
      await expect(caller.close({ streamId: '' })).rejects.toThrow()
    })

    it('should close stream with active status', async () => {
      vi.mocked(messagePortStreamer.closeStream).mockReturnValue(true)

      const result = await caller.close({ streamId: 'active-stream' })

      expect(result).toBe(true)
    })

    it('should close stream with pending status', async () => {
      vi.mocked(messagePortStreamer.closeStream).mockReturnValue(true)

      const result = await caller.close({ streamId: 'pending-stream' })

      expect(result).toBe(true)
    })

    it('should handle already closed streams', async () => {
      // First call succeeds, second returns false
      vi.mocked(messagePortStreamer.closeStream)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)

      const result1 = await caller.close({ streamId: 'stream-to-close' })
      const result2 = await caller.close({ streamId: 'stream-to-close' })

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent stats queries', async () => {
      const mockStats = {
        activeStreams: 1,
        totalBytesTransferred: 1000,
        streamsByType: { file: 1 },
        maxConcurrent: 10,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const results = await Promise.all([
        caller.stats(),
        caller.stats(),
        caller.stats(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toEqual(mockStats))
    })

    it('should handle concurrent list queries', async () => {
      const mockStreams = [
        { id: 's1', type: 'file' as const, createdAt: 1, bytesTransferred: 100, status: 'active' as const },
      ]
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue(mockStreams)

      const results = await Promise.all([
        caller.list(),
        caller.list(),
        caller.list(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toEqual(mockStreams))
    })

    it('should handle large bytes transferred value', async () => {
      const mockStats = {
        activeStreams: 1,
        totalBytesTransferred: 10_000_000_000, // 10GB
        streamsByType: { file: 1 },
        maxConcurrent: 10,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.totalBytesTransferred).toBe(10_000_000_000)
    })

    it('should handle many concurrent streams in stats', async () => {
      const mockStats = {
        activeStreams: 100,
        totalBytesTransferred: 50_000_000,
        streamsByType: { file: 40, data: 35, worker: 25 },
        maxConcurrent: 100,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result.activeStreams).toBe(100)
      expect(result.streamsByType.file + result.streamsByType.data + result.streamsByType.worker).toBe(100)
    })

    it('should handle stream with zero bytes transferred', async () => {
      const mockStatus = {
        id: 'new-stream',
        type: 'file' as const,
        status: 'pending' as const,
        bytesTransferred: 0,
        createdAt: Date.now(),
      }
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(mockStatus)

      const result = await caller.getStatus({ streamId: 'new-stream' })

      expect(result?.bytesTransferred).toBe(0)
    })

    it('should handle stream IDs with special characters', async () => {
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue(null)
      vi.mocked(messagePortStreamer.closeStream).mockReturnValue(true)

      // Stream IDs with various formats
      await caller.getStatus({ streamId: 'stream-with-dashes-123' })
      await caller.getStatus({ streamId: 'stream_with_underscores_456' })

      expect(messagePortStreamer.getStreamStatus).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // INTEGRATION-LIKE TESTS
  // ===========================================================================
  describe('integration scenarios', () => {
    it('should track stream lifecycle: create -> active -> complete -> close', async () => {
      // Initial state: no streams
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue([])
      let result = await caller.list()
      expect(result).toHaveLength(0)

      // After creating stream
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue([
        { id: 'lifecycle-stream', type: 'file' as const, createdAt: 1, bytesTransferred: 0, status: 'pending' as const },
      ])
      result = await caller.list()
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('pending')

      // Stream becomes active
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue({
        id: 'lifecycle-stream',
        type: 'file' as const,
        status: 'active' as const,
        bytesTransferred: 5000,
        createdAt: 1,
      })
      const status = await caller.getStatus({ streamId: 'lifecycle-stream' })
      expect(status?.status).toBe('active')

      // Stream completes
      vi.mocked(messagePortStreamer.getStreamStatus).mockReturnValue({
        id: 'lifecycle-stream',
        type: 'file' as const,
        status: 'complete' as const,
        bytesTransferred: 50000,
        createdAt: 1,
      })
      const completeStatus = await caller.getStatus({ streamId: 'lifecycle-stream' })
      expect(completeStatus?.status).toBe('complete')

      // Close stream
      vi.mocked(messagePortStreamer.closeStream).mockReturnValue(true)
      const closeResult = await caller.close({ streamId: 'lifecycle-stream' })
      expect(closeResult).toBe(true)
    })

    it('should handle multiple streams with different statuses', async () => {
      const mockStreams = [
        { id: 's1', type: 'file' as const, createdAt: 1, bytesTransferred: 0, status: 'pending' as const },
        { id: 's2', type: 'file' as const, createdAt: 2, bytesTransferred: 5000, status: 'active' as const },
        { id: 's3', type: 'data' as const, createdAt: 3, bytesTransferred: 10000, status: 'complete' as const },
        { id: 's4', type: 'worker' as const, createdAt: 4, bytesTransferred: 1000, status: 'error' as const },
      ]
      vi.mocked(messagePortStreamer.listStreams).mockReturnValue(mockStreams)

      const mockStats = {
        activeStreams: 4,
        totalBytesTransferred: 16000,
        streamsByType: { file: 2, data: 1, worker: 1 },
        maxConcurrent: 10,
        chunkSize: 65536,
      }
      vi.mocked(messagePortStreamer.getStats).mockReturnValue(mockStats)

      const [list, stats] = await Promise.all([
        caller.list(),
        caller.stats(),
      ])

      expect(list).toHaveLength(4)
      expect(stats.activeStreams).toBe(4)
      expect(stats.totalBytesTransferred).toBe(16000)
    })
  })
})
