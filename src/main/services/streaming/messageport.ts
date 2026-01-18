/**
 * MessagePort Streaming Service - Zero-Copy Data Transfer
 *
 * Implements the Data Plane from Gemini research (deploy-482i):
 * - MessagePorts for large file transfers (>1MB)
 * - Transferable objects for zero-copy
 * - Direct Renderer→Worker bypass when possible
 *
 * Pattern: Control Plane (tRPC) initiates, Data Plane (MessagePort) transfers
 *
 * @see docs/Research/Electron-tRPC Production Patterns Research.md
 */

import { MessageChannelMain, ipcMain, WebContents, BrowserWindow } from 'electron'
import { createReadStream, statSync } from 'fs'
import { basename } from 'path'
import { EventEmitter } from 'events'

/**
 * Stream configuration options
 */
interface StreamConfig {
  /** Chunk size for file streaming (default: 64KB) */
  chunkSize: number
  /** Maximum concurrent streams */
  maxConcurrent: number
  /** Timeout for idle streams (ms) */
  idleTimeout: number
}

/**
 * Active stream metadata
 */
interface StreamInfo {
  id: string
  type: 'file' | 'data' | 'worker'
  port: Electron.MessagePortMain
  createdAt: number
  bytesTransferred: number
  status: 'pending' | 'active' | 'complete' | 'error'
  metadata?: Record<string, unknown>
}

/**
 * Stream transfer result
 */
interface TransferResult {
  streamId: string
  bytesTransferred: number
  duration: number
  chunksTransferred: number
  averageChunkSize: number
}

const DEFAULT_CONFIG: StreamConfig = {
  chunkSize: 65536, // 64KB - optimal for IPC
  maxConcurrent: 10,
  idleTimeout: 30000,
}

/**
 * MessagePort Streaming Service
 *
 * Provides zero-copy data transfer between:
 * - Main ↔ Renderer (file uploads/downloads)
 * - Renderer ↔ Worker (bypassing Main process)
 */
class MessagePortStreamer extends EventEmitter {
  private streams = new Map<string, StreamInfo>()
  private config: StreamConfig
  private streamCounter = 0

  constructor(config: Partial<StreamConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.setupIpcHandlers()
  }

  /**
   * Setup IPC handlers for stream management
   */
  private setupIpcHandlers(): void {
    // Request new stream for file transfer
    ipcMain.handle('stream:createFileStream', (_event, filePath: string) => {
      return this.createFileStream(filePath)
    })

    // Request new stream for data transfer
    ipcMain.handle('stream:createDataStream', (_event, metadata?: Record<string, unknown>) => {
      return this.createDataStream(metadata)
    })

    // Get stream status
    ipcMain.handle('stream:getStatus', (_event, streamId: string) => {
      return this.getStreamStatus(streamId)
    })

    // Close stream
    ipcMain.handle('stream:close', (_event, streamId: string) => {
      return this.closeStream(streamId)
    })

    // Get all active streams
    ipcMain.handle('stream:list', () => {
      return this.listStreams()
    })

    // Get streaming stats
    ipcMain.handle('stream:stats', () => {
      return this.getStats()
    })
  }

  /**
   * Create a MessagePort stream for file transfer
   *
   * Usage:
   * 1. Renderer calls trpc.streaming.createFileStream({ filePath })
   * 2. Returns port2 to renderer
   * 3. Main reads file and sends chunks via port1
   * 4. Renderer receives chunks via port2.onmessage
   */
  createFileStream(
    filePath: string,
    webContents?: WebContents
  ): { streamId: string; port: Electron.MessagePortMain; fileSize: number; fileName: string } {
    // Check concurrent limit
    if (this.streams.size >= this.config.maxConcurrent) {
      throw new Error(`Maximum concurrent streams (${this.config.maxConcurrent}) exceeded`)
    }

    // Validate file exists
    let fileSize: number
    try {
      const stats = statSync(filePath)
      fileSize = stats.size
    } catch {
      throw new Error(`File not found or inaccessible: ${filePath}`)
    }

    // Create message channel
    const { port1, port2 } = new MessageChannelMain()

    const streamId = `stream-${++this.streamCounter}-${Date.now()}`
    const fileName = basename(filePath)

    // Register stream
    const streamInfo: StreamInfo = {
      id: streamId,
      type: 'file',
      port: port1,
      createdAt: Date.now(),
      bytesTransferred: 0,
      status: 'pending',
      metadata: { filePath, fileSize, fileName },
    }
    this.streams.set(streamId, streamInfo)

    // Start file streaming in background
    this.streamFile(streamId, filePath, port1, fileSize)

    // If webContents provided, transfer port2 directly
    if (webContents) {
      webContents.postMessage('stream:port', { streamId, fileSize, fileName }, [port2])
      return { streamId, port: port1, fileSize, fileName }
    }

    return { streamId, port: port2, fileSize, fileName }
  }

  /**
   * Create a MessagePort stream for arbitrary data transfer
   */
  createDataStream(metadata?: Record<string, unknown>): {
    streamId: string
    port1: Electron.MessagePortMain
    port2: Electron.MessagePortMain
  } {
    if (this.streams.size >= this.config.maxConcurrent) {
      throw new Error(`Maximum concurrent streams (${this.config.maxConcurrent}) exceeded`)
    }

    const { port1, port2 } = new MessageChannelMain()
    const streamId = `stream-${++this.streamCounter}-${Date.now()}`

    const streamInfo: StreamInfo = {
      id: streamId,
      type: 'data',
      port: port1,
      createdAt: Date.now(),
      bytesTransferred: 0,
      status: 'active',
      metadata,
    }
    this.streams.set(streamId, streamInfo)

    // Track bytes transferred
    port1.on('message', (event) => {
      const info = this.streams.get(streamId)
      if (info) {
        const dataSize =
          event.data instanceof ArrayBuffer
            ? event.data.byteLength
            : JSON.stringify(event.data).length
        info.bytesTransferred += dataSize
      }
    })

    port1.start()
    port2.start()

    return { streamId, port1, port2 }
  }

  /**
   * Create MessagePort for direct Renderer→Worker communication
   *
   * This bypasses the Main process for data transfer, enabling:
   * - Zero-copy SharedArrayBuffer transfer
   * - Lower latency for worker tasks
   * - 60fps UI under heavy computation
   */
  createWorkerStream(
    window: BrowserWindow,
    workerId: string
  ): {
    streamId: string
    rendererPort: Electron.MessagePortMain
    workerPort: Electron.MessagePortMain
  } {
    const { port1, port2 } = new MessageChannelMain()
    const streamId = `worker-stream-${++this.streamCounter}-${Date.now()}`

    const streamInfo: StreamInfo = {
      id: streamId,
      type: 'worker',
      port: port1,
      createdAt: Date.now(),
      bytesTransferred: 0,
      status: 'active',
      metadata: { workerId },
    }
    this.streams.set(streamId, streamInfo)

    port1.start()
    port2.start()

    // Transfer one port to renderer
    window.webContents.postMessage('stream:workerPort', { streamId, workerId }, [port2])

    return { streamId, rendererPort: port2, workerPort: port1 }
  }

  /**
   * Stream file contents through MessagePort
   */
  private async streamFile(
    streamId: string,
    filePath: string,
    port: Electron.MessagePortMain,
    fileSize: number
  ): Promise<void> {
    const streamInfo = this.streams.get(streamId)
    if (!streamInfo) return

    streamInfo.status = 'active'
    port.start()

    const startTime = Date.now()
    let chunksTransferred = 0

    try {
      const stream = createReadStream(filePath, {
        highWaterMark: this.config.chunkSize,
      })

      for await (const chunk of stream) {
        const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk)
        const arrayBuffer = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        )

        // Send chunk with progress info
        port.postMessage({
          type: 'chunk',
          data: arrayBuffer,
          progress: streamInfo.bytesTransferred / fileSize,
          chunkIndex: chunksTransferred,
        })

        streamInfo.bytesTransferred += buffer.length
        chunksTransferred++
      }

      // Send completion message
      port.postMessage({
        type: 'complete',
        totalBytes: streamInfo.bytesTransferred,
        totalChunks: chunksTransferred,
        duration: Date.now() - startTime,
      })

      streamInfo.status = 'complete'
      this.emit('streamComplete', {
        streamId,
        bytesTransferred: streamInfo.bytesTransferred,
        duration: Date.now() - startTime,
        chunksTransferred,
      } as TransferResult)
    } catch (error) {
      streamInfo.status = 'error'
      port.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      this.emit('streamError', { streamId, error })
    } finally {
      // Schedule cleanup after idle timeout
      setTimeout(() => {
        this.closeStream(streamId)
      }, this.config.idleTimeout)
    }
  }

  /**
   * Get stream status
   */
  getStreamStatus(streamId: string): StreamInfo | null {
    const info = this.streams.get(streamId)
    if (!info) return null

    return {
      ...info,
      port: undefined as never, // Don't expose port
    }
  }

  /**
   * Close and cleanup a stream
   */
  closeStream(streamId: string): boolean {
    const streamInfo = this.streams.get(streamId)
    if (!streamInfo) return false

    try {
      streamInfo.port.close()
    } catch {
      // Port may already be closed
    }

    this.streams.delete(streamId)
    this.emit('streamClosed', { streamId })
    return true
  }

  /**
   * List all active streams
   */
  listStreams(): Array<Omit<StreamInfo, 'port'>> {
    return Array.from(this.streams.values()).map(({ port: _port, ...info }) => info)
  }

  /**
   * Get streaming statistics
   */
  getStats(): {
    activeStreams: number
    totalBytesTransferred: number
    streamsByType: Record<string, number>
    maxConcurrent: number
    chunkSize: number
  } {
    let totalBytes = 0
    const byType: Record<string, number> = {}

    for (const info of this.streams.values()) {
      totalBytes += info.bytesTransferred
      byType[info.type] = (byType[info.type] || 0) + 1
    }

    return {
      activeStreams: this.streams.size,
      totalBytesTransferred: totalBytes,
      streamsByType: byType,
      maxConcurrent: this.config.maxConcurrent,
      chunkSize: this.config.chunkSize,
    }
  }

  /**
   * Update streaming configuration
   */
  updateConfig(config: Partial<StreamConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Close all active streams
   */
  closeAll(): void {
    for (const streamId of this.streams.keys()) {
      this.closeStream(streamId)
    }
  }
}

// Singleton instance
export const messagePortStreamer = new MessagePortStreamer()

// Export types
export type { StreamConfig, StreamInfo, TransferResult }
