/**
 * MessagePort Streaming Service Tests
 *
 * Comprehensive tests for the MessagePortStreamer that provides zero-copy
 * data transfer between Main, Renderer, and Worker processes.
 *
 * Tests cover:
 * - File stream creation and transfer
 * - Data stream creation
 * - Worker stream creation
 * - Stream lifecycle management
 * - Statistics and metrics
 * - Error handling scenarios
 * - IPC handler setup
 *
 * @module messageport.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Define mock functions using vi.hoisted for proper hoisting
const mockPort1 = vi.hoisted(() => ({
  start: vi.fn(),
  close: vi.fn(),
  postMessage: vi.fn(),
  on: vi.fn(),
}))

const mockPort2 = vi.hoisted(() => ({
  start: vi.fn(),
  close: vi.fn(),
  postMessage: vi.fn(),
  on: vi.fn(),
}))

const mockMessageChannelMain = vi.hoisted(() =>
  vi.fn(() => ({
    port1: mockPort1,
    port2: mockPort2,
  }))
)

const mockIpcMainHandle = vi.hoisted(() => vi.fn())

const mockWebContentsPostMessage = vi.hoisted(() => vi.fn())

const mockStatSync = vi.hoisted(() => vi.fn())

const mockCreateReadStream = vi.hoisted(() => vi.fn())

// Mock electron
vi.mock('electron', () => ({
  MessageChannelMain: mockMessageChannelMain,
  ipcMain: {
    handle: mockIpcMainHandle,
  },
  WebContents: {},
  BrowserWindow: {},
}))

// Mock fs
vi.mock('fs', () => ({
  createReadStream: mockCreateReadStream,
  statSync: mockStatSync,
}))

// Mock path
vi.mock('path', () => ({
  basename: vi.fn((path: string) => path.split('/').pop() || path),
}))

// Helper to create async iterable for stream chunks
function createMockStream(chunks: Buffer[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

// Get a fresh module instance for each test
const getStreamerClass = async () => {
  vi.resetModules()

  // Reset mock implementations
  mockPort1.start.mockReset()
  mockPort1.close.mockReset()
  mockPort1.postMessage.mockReset()
  mockPort1.on.mockReset()
  mockPort2.start.mockReset()
  mockPort2.close.mockReset()
  mockPort2.postMessage.mockReset()
  mockPort2.on.mockReset()
  mockMessageChannelMain.mockClear()
  mockIpcMainHandle.mockClear()
  mockStatSync.mockReset()
  mockCreateReadStream.mockReset()

  // Re-apply mocks
  vi.doMock('electron', () => ({
    MessageChannelMain: mockMessageChannelMain,
    ipcMain: {
      handle: mockIpcMainHandle,
    },
    WebContents: {},
    BrowserWindow: {},
  }))

  vi.doMock('fs', () => ({
    createReadStream: mockCreateReadStream,
    statSync: mockStatSync,
  }))

  vi.doMock('path', () => ({
    basename: vi.fn((path: string) => path.split('/').pop() || path),
  }))

  const module = await import('../messageport')
  return module
}

describe('MessagePortStreamer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('initialization', () => {
    it('should setup IPC handlers on construction', async () => {
      await getStreamerClass()

      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'stream:createFileStream',
        expect.any(Function)
      )
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'stream:createDataStream',
        expect.any(Function)
      )
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'stream:getStatus',
        expect.any(Function)
      )
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'stream:close',
        expect.any(Function)
      )
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'stream:list',
        expect.any(Function)
      )
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'stream:stats',
        expect.any(Function)
      )
    })

    it('should have default configuration', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stats = messagePortStreamer.getStats()
      expect(stats.chunkSize).toBe(65536) // 64KB default
      expect(stats.maxConcurrent).toBe(10)
    })

    it('should extend EventEmitter', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      expect(messagePortStreamer).toBeInstanceOf(EventEmitter)
      expect(typeof messagePortStreamer.on).toBe('function')
      expect(typeof messagePortStreamer.emit).toBe('function')
    })
  })

  // ===========================================================================
  // FILE STREAM TESTS
  // ===========================================================================
  describe('createFileStream', () => {
    it('should create file stream for existing file', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 1024 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const result = messagePortStreamer.createFileStream('/path/to/file.txt')

      expect(result).toHaveProperty('streamId')
      expect(result).toHaveProperty('port')
      expect(result.fileSize).toBe(1024)
      expect(result.fileName).toBe('file.txt')
      expect(mockMessageChannelMain).toHaveBeenCalled()
    })

    it('should throw error for non-existent file', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      expect(() =>
        messagePortStreamer.createFileStream('/nonexistent/file.txt')
      ).toThrow('File not found or inaccessible')
    })

    it('should throw error when max concurrent streams exceeded', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 100 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      // Update config to have low max concurrent
      messagePortStreamer.updateConfig({ maxConcurrent: 2 })

      // Create max streams
      messagePortStreamer.createFileStream('/file1.txt')
      messagePortStreamer.createFileStream('/file2.txt')

      // Third should fail
      expect(() =>
        messagePortStreamer.createFileStream('/file3.txt')
      ).toThrow('Maximum concurrent streams (2) exceeded')
    })

    it('should register stream in internal map', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 500 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const result = messagePortStreamer.createFileStream('/test/file.txt')
      const status = messagePortStreamer.getStreamStatus(result.streamId)

      expect(status).not.toBeNull()
      expect(status?.type).toBe('file')
      expect(status?.metadata?.filePath).toBe('/test/file.txt')
      expect(status?.metadata?.fileSize).toBe(500)
    })

    it('should transfer port to webContents when provided', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 256 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const mockWebContents = {
        postMessage: mockWebContentsPostMessage,
      }

      messagePortStreamer.createFileStream(
        '/file.txt',
        mockWebContents as unknown as Electron.WebContents
      )

      expect(mockWebContentsPostMessage).toHaveBeenCalledWith(
        'stream:port',
        expect.objectContaining({
          fileSize: 256,
          fileName: 'file.txt',
        }),
        [mockPort2]
      )
    })

    it('should start streaming file in background', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const chunks = [Buffer.from('chunk1'), Buffer.from('chunk2')]
      mockStatSync.mockReturnValue({ size: 12 })
      mockCreateReadStream.mockReturnValue(createMockStream(chunks))

      messagePortStreamer.createFileStream('/data.bin')

      // Allow async operations to complete
      await vi.runAllTimersAsync()

      // Verify chunks were posted
      expect(mockPort1.postMessage).toHaveBeenCalled()
    })

    it('should emit streamComplete event on success', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const completeSpy = vi.fn()
      messagePortStreamer.on('streamComplete', completeSpy)

      const chunks = [Buffer.from('data')]
      mockStatSync.mockReturnValue({ size: 4 })
      mockCreateReadStream.mockReturnValue(createMockStream(chunks))

      messagePortStreamer.createFileStream('/file.txt')

      await vi.runAllTimersAsync()

      expect(completeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bytesTransferred: expect.any(Number),
          chunksTransferred: expect.any(Number),
        })
      )
    })

    it('should emit streamError event on failure', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const errorSpy = vi.fn()
      messagePortStreamer.on('streamError', errorSpy)

      mockStatSync.mockReturnValue({ size: 100 })

      // Create a stream that throws
      const errorStream = {
        [Symbol.asyncIterator]: async function* () {
          yield undefined // Required yield before throwing
          throw new Error('Read error')
        },
      }
      mockCreateReadStream.mockReturnValue(errorStream)

      messagePortStreamer.createFileStream('/error.txt')

      await vi.runAllTimersAsync()

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        })
      )
    })

    it('should send progress with each chunk', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const chunks = [
        Buffer.from('chunk1'),
        Buffer.from('chunk2'),
        Buffer.from('chunk3'),
      ]
      mockStatSync.mockReturnValue({ size: 18 })
      mockCreateReadStream.mockReturnValue(createMockStream(chunks))

      messagePortStreamer.createFileStream('/multi.txt')

      await vi.runAllTimersAsync()

      // Check chunk messages were sent with progress
      const chunkCalls = mockPort1.postMessage.mock.calls.filter(
        (call) => call[0]?.type === 'chunk'
      )
      expect(chunkCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('should send completion message when done', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const chunks = [Buffer.from('done')]
      mockStatSync.mockReturnValue({ size: 4 })
      mockCreateReadStream.mockReturnValue(createMockStream(chunks))

      messagePortStreamer.createFileStream('/complete.txt')

      await vi.runAllTimersAsync()

      const completeCalls = mockPort1.postMessage.mock.calls.filter(
        (call) => call[0]?.type === 'complete'
      )
      expect(completeCalls).toHaveLength(1)
      expect(completeCalls[0][0]).toMatchObject({
        type: 'complete',
        totalBytes: expect.any(Number),
        totalChunks: expect.any(Number),
        duration: expect.any(Number),
      })
    })

    it('should schedule cleanup after idle timeout', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const chunks = [Buffer.from('x')]
      mockStatSync.mockReturnValue({ size: 1 })
      mockCreateReadStream.mockReturnValue(createMockStream(chunks))

      const result = messagePortStreamer.createFileStream('/cleanup.txt')

      // Verify stream was created (status is pending initially, then active during streaming)
      const initialStatus = messagePortStreamer.getStreamStatus(result.streamId)
      expect(initialStatus).not.toBeNull()
      expect(['pending', 'active']).toContain(initialStatus?.status)

      // Run async operations (streaming)
      await vi.runAllTimersAsync()

      // After idle timeout (30000ms), the cleanup is scheduled in the finally block
      // Advance time to trigger the cleanup setTimeout
      await vi.advanceTimersByTimeAsync(35000)

      // Stream should be cleaned up after idle timeout
      expect(messagePortStreamer.getStreamStatus(result.streamId)).toBeNull()
    })
  })

  // ===========================================================================
  // DATA STREAM TESTS
  // ===========================================================================
  describe('createDataStream', () => {
    it('should create data stream with both ports', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const result = messagePortStreamer.createDataStream()

      expect(result).toHaveProperty('streamId')
      expect(result).toHaveProperty('port1')
      expect(result).toHaveProperty('port2')
      expect(mockPort1.start).toHaveBeenCalled()
      expect(mockPort2.start).toHaveBeenCalled()
    })

    it('should create data stream with metadata', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const result = messagePortStreamer.createDataStream({
        purpose: 'embedding',
        modelId: 'text-embedding-3',
      })

      const status = messagePortStreamer.getStreamStatus(result.streamId)
      expect(status?.metadata).toEqual({
        purpose: 'embedding',
        modelId: 'text-embedding-3',
      })
    })

    it('should throw when max concurrent exceeded', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      messagePortStreamer.updateConfig({ maxConcurrent: 1 })

      messagePortStreamer.createDataStream()

      expect(() => messagePortStreamer.createDataStream()).toThrow(
        'Maximum concurrent streams (1) exceeded'
      )
    })

    it('should mark stream as active immediately', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const result = messagePortStreamer.createDataStream()
      const status = messagePortStreamer.getStreamStatus(result.streamId)

      expect(status?.status).toBe('active')
    })

    it('should track bytes transferred on port1 messages', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      // Capture the message handler
      let messageHandler: ((event: { data: unknown }) => void) | undefined
      mockPort1.on.mockImplementation((event: string, handler: (event: { data: unknown }) => void) => {
        if (event === 'message') {
          messageHandler = handler
        }
      })

      const result = messagePortStreamer.createDataStream()

      // Simulate message with ArrayBuffer
      if (messageHandler) {
        const buffer = new ArrayBuffer(1024)
        messageHandler({ data: buffer })
      }

      const status = messagePortStreamer.getStreamStatus(result.streamId)
      expect(status?.bytesTransferred).toBe(1024)
    })

    it('should track bytes for non-buffer data', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      let messageHandler: ((event: { data: unknown }) => void) | undefined
      mockPort1.on.mockImplementation((event: string, handler: (event: { data: unknown }) => void) => {
        if (event === 'message') {
          messageHandler = handler
        }
      })

      const result = messagePortStreamer.createDataStream()

      if (messageHandler) {
        messageHandler({ data: { key: 'value' } })
      }

      const status = messagePortStreamer.getStreamStatus(result.streamId)
      expect(status?.bytesTransferred).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // WORKER STREAM TESTS
  // ===========================================================================
  describe('createWorkerStream', () => {
    it('should create worker stream for renderer-worker bypass', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const mockWindow = {
        webContents: {
          postMessage: mockWebContentsPostMessage,
        },
      }

      const result = messagePortStreamer.createWorkerStream(
        mockWindow as unknown as Electron.BrowserWindow,
        'worker-123'
      )

      expect(result).toHaveProperty('streamId')
      expect(result).toHaveProperty('rendererPort')
      expect(result).toHaveProperty('workerPort')
      expect(result.streamId).toContain('worker-stream')
    })

    it('should transfer port to renderer window', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const mockWindow = {
        webContents: {
          postMessage: mockWebContentsPostMessage,
        },
      }

      messagePortStreamer.createWorkerStream(
        mockWindow as unknown as Electron.BrowserWindow,
        'worker-456'
      )

      expect(mockWebContentsPostMessage).toHaveBeenCalledWith(
        'stream:workerPort',
        expect.objectContaining({
          workerId: 'worker-456',
        }),
        [mockPort2]
      )
    })

    it('should start both ports', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const mockWindow = {
        webContents: {
          postMessage: mockWebContentsPostMessage,
        },
      }

      messagePortStreamer.createWorkerStream(
        mockWindow as unknown as Electron.BrowserWindow,
        'worker-789'
      )

      expect(mockPort1.start).toHaveBeenCalled()
      expect(mockPort2.start).toHaveBeenCalled()
    })

    it('should store worker metadata', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const mockWindow = {
        webContents: {
          postMessage: mockWebContentsPostMessage,
        },
      }

      const result = messagePortStreamer.createWorkerStream(
        mockWindow as unknown as Electron.BrowserWindow,
        'worker-meta'
      )

      const status = messagePortStreamer.getStreamStatus(result.streamId)
      expect(status?.type).toBe('worker')
      expect(status?.metadata?.workerId).toBe('worker-meta')
    })
  })

  // ===========================================================================
  // STREAM STATUS TESTS
  // ===========================================================================
  describe('getStreamStatus', () => {
    it('should return null for non-existent stream', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const status = messagePortStreamer.getStreamStatus('non-existent-id')

      expect(status).toBeNull()
    })

    it('should return stream info without exposing port', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream = messagePortStreamer.createDataStream({ test: true })
      const status = messagePortStreamer.getStreamStatus(stream.streamId)

      expect(status).not.toBeNull()
      expect(status?.id).toBe(stream.streamId)
      expect(status?.type).toBe('data')
      expect(status?.metadata).toEqual({ test: true })
      // Port should not be directly usable
      expect(status?.port).toBeUndefined()
    })

    it('should return current status', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream = messagePortStreamer.createDataStream()
      const status = messagePortStreamer.getStreamStatus(stream.streamId)

      expect(status?.status).toBe('active')
      expect(status?.createdAt).toBeLessThanOrEqual(Date.now())
    })
  })

  // ===========================================================================
  // CLOSE STREAM TESTS
  // ===========================================================================
  describe('closeStream', () => {
    it('should close and cleanup stream', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream = messagePortStreamer.createDataStream()
      const result = messagePortStreamer.closeStream(stream.streamId)

      expect(result).toBe(true)
      expect(mockPort1.close).toHaveBeenCalled()
      expect(messagePortStreamer.getStreamStatus(stream.streamId)).toBeNull()
    })

    it('should return false for non-existent stream', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const result = messagePortStreamer.closeStream('fake-stream-id')

      expect(result).toBe(false)
    })

    it('should emit streamClosed event', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const closedSpy = vi.fn()
      messagePortStreamer.on('streamClosed', closedSpy)

      const stream = messagePortStreamer.createDataStream()
      messagePortStreamer.closeStream(stream.streamId)

      expect(closedSpy).toHaveBeenCalledWith({
        streamId: stream.streamId,
      })
    })

    it('should handle port already closed', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockPort1.close.mockImplementation(() => {
        throw new Error('Port already closed')
      })

      const stream = messagePortStreamer.createDataStream()

      // Should not throw
      expect(() => messagePortStreamer.closeStream(stream.streamId)).not.toThrow()
    })
  })

  // ===========================================================================
  // LIST STREAMS TESTS
  // ===========================================================================
  describe('listStreams', () => {
    it('should return empty array when no streams', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const streams = messagePortStreamer.listStreams()

      expect(streams).toEqual([])
    })

    it('should return all active streams without port', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 100 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      messagePortStreamer.createDataStream({ type: 'data1' })
      messagePortStreamer.createDataStream({ type: 'data2' })
      messagePortStreamer.createFileStream('/file.txt')

      const streams = messagePortStreamer.listStreams()

      expect(streams).toHaveLength(3)
      streams.forEach((stream) => {
        expect(stream).not.toHaveProperty('port')
        expect(stream).toHaveProperty('id')
        expect(stream).toHaveProperty('type')
        expect(stream).toHaveProperty('status')
      })
    })

    it('should reflect stream count after close', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream1 = messagePortStreamer.createDataStream()
      const stream2 = messagePortStreamer.createDataStream()

      expect(messagePortStreamer.listStreams()).toHaveLength(2)

      messagePortStreamer.closeStream(stream1.streamId)

      expect(messagePortStreamer.listStreams()).toHaveLength(1)
      expect(messagePortStreamer.listStreams()[0].id).toBe(stream2.streamId)
    })
  })

  // ===========================================================================
  // STATISTICS TESTS
  // ===========================================================================
  describe('getStats', () => {
    it('should return streaming statistics', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stats = messagePortStreamer.getStats()

      expect(stats).toHaveProperty('activeStreams')
      expect(stats).toHaveProperty('totalBytesTransferred')
      expect(stats).toHaveProperty('streamsByType')
      expect(stats).toHaveProperty('maxConcurrent')
      expect(stats).toHaveProperty('chunkSize')
    })

    it('should count active streams', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      messagePortStreamer.createDataStream()
      messagePortStreamer.createDataStream()

      const stats = messagePortStreamer.getStats()
      expect(stats.activeStreams).toBe(2)
    })

    it('should aggregate bytes transferred', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      let messageHandler1: ((event: { data: unknown }) => void) | undefined
      let messageHandler2: ((event: { data: unknown }) => void) | undefined

      mockPort1.on.mockImplementationOnce((event: string, handler: (event: { data: unknown }) => void) => {
        if (event === 'message') messageHandler1 = handler
      })

      messagePortStreamer.createDataStream()

      mockPort1.on.mockImplementationOnce((event: string, handler: (event: { data: unknown }) => void) => {
        if (event === 'message') messageHandler2 = handler
      })

      messagePortStreamer.createDataStream()

      // Simulate data transfer
      if (messageHandler1) messageHandler1({ data: new ArrayBuffer(100) })
      if (messageHandler2) messageHandler2({ data: new ArrayBuffer(200) })

      const stats = messagePortStreamer.getStats()
      expect(stats.totalBytesTransferred).toBe(300)
    })

    it('should count streams by type', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 50 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const mockWindow = {
        webContents: { postMessage: mockWebContentsPostMessage },
      }

      messagePortStreamer.createDataStream()
      messagePortStreamer.createDataStream()
      messagePortStreamer.createFileStream('/file.txt')
      messagePortStreamer.createWorkerStream(
        mockWindow as unknown as Electron.BrowserWindow,
        'w1'
      )

      const stats = messagePortStreamer.getStats()
      expect(stats.streamsByType).toEqual({
        data: 2,
        file: 1,
        worker: 1,
      })
    })
  })

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================
  describe('updateConfig', () => {
    it('should update chunk size', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      messagePortStreamer.updateConfig({ chunkSize: 131072 }) // 128KB

      const stats = messagePortStreamer.getStats()
      expect(stats.chunkSize).toBe(131072)
    })

    it('should update max concurrent', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      messagePortStreamer.updateConfig({ maxConcurrent: 20 })

      const stats = messagePortStreamer.getStats()
      expect(stats.maxConcurrent).toBe(20)
    })

    it('should update multiple config values', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      messagePortStreamer.updateConfig({
        chunkSize: 32768,
        maxConcurrent: 5,
        idleTimeout: 60000,
      })

      const stats = messagePortStreamer.getStats()
      expect(stats.chunkSize).toBe(32768)
      expect(stats.maxConcurrent).toBe(5)
    })
  })

  // ===========================================================================
  // CLOSE ALL TESTS
  // ===========================================================================
  describe('closeAll', () => {
    it('should close all active streams', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      messagePortStreamer.createDataStream()
      messagePortStreamer.createDataStream()
      messagePortStreamer.createDataStream()

      expect(messagePortStreamer.listStreams()).toHaveLength(3)

      messagePortStreamer.closeAll()

      expect(messagePortStreamer.listStreams()).toHaveLength(0)
    })

    it('should emit streamClosed for each stream', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const closedSpy = vi.fn()
      messagePortStreamer.on('streamClosed', closedSpy)

      messagePortStreamer.createDataStream()
      messagePortStreamer.createDataStream()

      messagePortStreamer.closeAll()

      expect(closedSpy).toHaveBeenCalledTimes(2)
    })

    it('should handle empty streams', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      // Should not throw
      expect(() => messagePortStreamer.closeAll()).not.toThrow()
    })
  })

  // ===========================================================================
  // IPC HANDLER TESTS
  // ===========================================================================
  describe('IPC handlers', () => {
    it('should register createFileStream handler', async () => {
      await getStreamerClass()

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === 'stream:createFileStream'
      )?.[1]

      expect(handler).toBeDefined()
    })

    it('should register createDataStream handler', async () => {
      await getStreamerClass()

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === 'stream:createDataStream'
      )?.[1]

      expect(handler).toBeDefined()
    })

    it('should register getStatus handler', async () => {
      await getStreamerClass()

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === 'stream:getStatus'
      )?.[1]

      expect(handler).toBeDefined()
    })

    it('should register close handler', async () => {
      await getStreamerClass()

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === 'stream:close'
      )?.[1]

      expect(handler).toBeDefined()
    })

    it('should register list handler', async () => {
      await getStreamerClass()

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === 'stream:list'
      )?.[1]

      expect(handler).toBeDefined()
    })

    it('should register stats handler', async () => {
      await getStreamerClass()

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === 'stream:stats'
      )?.[1]

      expect(handler).toBeDefined()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle stream ID uniqueness', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream1 = messagePortStreamer.createDataStream()
      const stream2 = messagePortStreamer.createDataStream()
      const stream3 = messagePortStreamer.createDataStream()

      const ids = [stream1.streamId, stream2.streamId, stream3.streamId]
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(3)
    })

    it('should include timestamp in stream ID', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream = messagePortStreamer.createDataStream()

      // Stream ID format: stream-{counter}-{timestamp}
      expect(stream.streamId).toMatch(/^stream-\d+-\d+$/)
    })

    it('should handle file with path containing spaces', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 100 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const result = messagePortStreamer.createFileStream(
        '/path/to/file with spaces.txt'
      )

      expect(result.fileName).toBe('file with spaces.txt')
    })

    it('should handle empty file', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 0 })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const result = messagePortStreamer.createFileStream('/empty.txt')

      expect(result.fileSize).toBe(0)
    })

    it('should handle large file size', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const largeSize = 10 * 1024 * 1024 * 1024 // 10GB
      mockStatSync.mockReturnValue({ size: largeSize })
      mockCreateReadStream.mockReturnValue(createMockStream([]))

      const result = messagePortStreamer.createFileStream('/large.bin')

      expect(result.fileSize).toBe(largeSize)
    })

    it('should handle concurrent file and data streams', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      mockStatSync.mockReturnValue({ size: 100 })
      mockCreateReadStream.mockReturnValue(createMockStream([Buffer.from('x')]))

      const _fileStream = messagePortStreamer.createFileStream('/file.txt')
      const _dataStream1 = messagePortStreamer.createDataStream()
      const _dataStream2 = messagePortStreamer.createDataStream()

      const streams = messagePortStreamer.listStreams()
      expect(streams).toHaveLength(3)

      const types = streams.map((s) => s.type)
      expect(types).toContain('file')
      expect(types.filter((t) => t === 'data')).toHaveLength(2)
    })
  })

  // ===========================================================================
  // TYPE EXPORTS TESTS
  // ===========================================================================
  describe('type exports', () => {
    it('should export StreamConfig type structure', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stats = messagePortStreamer.getStats()
      expect(stats).toHaveProperty('chunkSize')
      expect(stats).toHaveProperty('maxConcurrent')
    })

    it('should export StreamInfo type structure', async () => {
      const { messagePortStreamer } = await getStreamerClass()

      const stream = messagePortStreamer.createDataStream()
      const status = messagePortStreamer.getStreamStatus(stream.streamId)

      expect(status).toHaveProperty('id')
      expect(status).toHaveProperty('type')
      expect(status).toHaveProperty('createdAt')
      expect(status).toHaveProperty('bytesTransferred')
      expect(status).toHaveProperty('status')
    })

    it('should export TransferResult type through events', async () => {
      const { messagePortStreamer } = await getStreamerClass()
      const completeSpy = vi.fn()
      messagePortStreamer.on('streamComplete', completeSpy)

      mockStatSync.mockReturnValue({ size: 4 })
      mockCreateReadStream.mockReturnValue(createMockStream([Buffer.from('test')]))

      messagePortStreamer.createFileStream('/file.txt')
      await vi.runAllTimersAsync()

      if (completeSpy.mock.calls.length > 0) {
        const result = completeSpy.mock.calls[0][0]
        expect(result).toHaveProperty('streamId')
        expect(result).toHaveProperty('bytesTransferred')
        expect(result).toHaveProperty('duration')
        expect(result).toHaveProperty('chunksTransferred')
      }
    })
  })
})
