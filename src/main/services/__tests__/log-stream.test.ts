/**
 * Log Stream Manager Service Tests
 *
 * Comprehensive tests for the LogStreamManager that handles real-time log
 * streaming from journalctl and Claude session files.
 *
 * @module log-stream.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock dependencies before importing
const mockChildProcess = {
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  on: vi.fn(),
  kill: vi.fn(),
}

const mockFSWatcher = {
  close: vi.fn(),
}

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockChildProcess),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  watch: vi.fn(() => mockFSWatcher),
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

import { LogStreamManager } from '../log-stream'
import { spawn } from 'child_process'
import { existsSync, readFileSync, watch } from 'fs'

// Create a mock BrowserWindow
const createMockWindow = () => ({
  webContents: {
    send: vi.fn(),
  },
})

describe('LogStreamManager', () => {
  let logStream: LogStreamManager
  let mockWindow: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    logStream = new LogStreamManager()
    mockWindow = createMockWindow()

    // Reset mock child process
    mockChildProcess.stdout = new EventEmitter()
    mockChildProcess.stderr = new EventEmitter()
    mockChildProcess.on = vi.fn()
    mockChildProcess.kill = vi.fn()

    // Reset mock watcher
    mockFSWatcher.close = vi.fn()
  })

  afterEach(() => {
    logStream.stop()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('initialization', () => {
    it('should create a new instance', () => {
      expect(logStream).toBeDefined()
    })

    it('should set the main window', () => {
      logStream.setMainWindow(mockWindow as any)
      // No direct way to verify, but it should not throw
    })
  })

  // ===========================================================================
  // START/STOP TESTS
  // ===========================================================================
  describe('start/stop', () => {
    it('should start streaming with system source', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const result = logStream.start(['system'])

      expect(result).toBe(true)
      expect(spawn).toHaveBeenCalledWith(
        'journalctl',
        ['-f', '-n', '0', '-o', 'json'],
        expect.any(Object)
      )
    })

    it('should start streaming with claude source', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const result = logStream.start(['claude'])

      expect(result).toBe(true)
      expect(watch).toHaveBeenCalled()
    })

    it('should start streaming with all sources', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const result = logStream.start(['all'])

      expect(result).toBe(true)
      expect(spawn).toHaveBeenCalled()
      expect(watch).toHaveBeenCalled()
    })

    it('should return true if already active', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      logStream.start(['system'])
      const result = logStream.start(['system'])

      expect(result).toBe(true)
    })

    it('should stop streaming', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.start(['all'])

      const result = logStream.stop()

      expect(result).toBe(true)
      expect(mockChildProcess.kill).toHaveBeenCalled()
      expect(mockFSWatcher.close).toHaveBeenCalled()
    })

    it('should return true when stopping inactive stream', () => {
      const result = logStream.stop()
      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // JOURNAL STREAM TESTS
  // ===========================================================================
  describe('journal stream', () => {
    it('should parse and emit journal entries', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])

      const journalEntry = JSON.stringify({
        __REALTIME_TIMESTAMP: '1704067200000000', // Microseconds
        PRIORITY: '6',
        MESSAGE: 'Test log message',
        _SYSTEMD_UNIT: 'test.service',
        _PID: '1234',
      })

      mockChildProcess.stdout.emit('data', Buffer.from(journalEntry + '\n'))

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'logs:stream',
        expect.objectContaining({
          source: 'system',
          level: 'info',
          message: 'Test log message',
          metadata: expect.objectContaining({
            unit: 'test.service',
            pid: '1234',
          }),
        })
      )
    })

    it('should map priority levels correctly', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])

      const testCases = [
        { priority: '3', expectedLevel: 'error' },
        { priority: '4', expectedLevel: 'warn' },
        { priority: '6', expectedLevel: 'info' },
        { priority: '7', expectedLevel: 'debug' },
      ]

      for (const { priority, expectedLevel } of testCases) {
        vi.clearAllMocks()
        const entry = JSON.stringify({
          PRIORITY: priority,
          MESSAGE: `Test ${priority}`,
        })

        mockChildProcess.stdout.emit('data', Buffer.from(entry + '\n'))

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          'logs:stream',
          expect.objectContaining({ level: expectedLevel })
        )
      }
    })

    it('should handle invalid JSON gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])

      // Should not throw
      mockChildProcess.stdout.emit('data', Buffer.from('not valid json\n'))

      // Should continue working with valid entries
      const validEntry = JSON.stringify({
        PRIORITY: '6',
        MESSAGE: 'Valid message',
      })
      mockChildProcess.stdout.emit('data', Buffer.from(validEntry + '\n'))

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'logs:stream',
        expect.objectContaining({ message: 'Valid message' })
      )
    })

    it('should handle multiple entries in one data chunk', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])

      const entry1 = JSON.stringify({ PRIORITY: '6', MESSAGE: 'Message 1' })
      const entry2 = JSON.stringify({ PRIORITY: '6', MESSAGE: 'Message 2' })

      mockChildProcess.stdout.emit('data', Buffer.from(`${entry1}\n${entry2}\n`))

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(2)
    })

    it('should handle journal process errors', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      logStream.start(['system'])

      const errorHandler = mockChildProcess.on.mock.calls.find(
        ([event]) => event === 'error'
      )?.[1]

      if (errorHandler) {
        errorHandler(new Error('Journal error'))
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Journal stream error:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should use current timestamp when __REALTIME_TIMESTAMP is missing', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])

      const beforeTime = Date.now()

      const entry = JSON.stringify({
        PRIORITY: '6',
        MESSAGE: 'No timestamp',
      })

      mockChildProcess.stdout.emit('data', Buffer.from(entry + '\n'))

      const afterTime = Date.now()
      const call = mockWindow.webContents.send.mock.calls[0]
      const sentEntry = call[1]

      expect(sentEntry.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(sentEntry.timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  // ===========================================================================
  // CLAUDE LOG WATCHING TESTS
  // ===========================================================================
  describe('claude log watching', () => {
    it('should not watch if projects directory does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      logStream.start(['claude'])

      expect(watch).not.toHaveBeenCalled()
    })

    it('should watch projects directory for changes', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      logStream.start(['claude'])

      expect(watch).toHaveBeenCalledWith(
        expect.stringContaining('projects'),
        { recursive: true },
        expect.any(Function)
      )
    })

    it('should read and emit claude log entries on file change', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          timestamp: '2024-01-01T00:00:00Z',
          type: 'assistant',
          role: 'assistant',
          content: 'Test response',
          model: 'claude-3',
        }) + '\n'
      )

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      // Get the callback and simulate a file change
      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'logs:stream',
        expect.objectContaining({
          source: 'claude',
          level: 'info',
          metadata: expect.objectContaining({
            role: 'assistant',
            model: 'claude-3',
          }),
        })
      )
    })

    it('should only process .jsonl files', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown

      // Non-jsonl file
      watchCallback('change', 'session/file.txt')

      expect(readFileSync).not.toHaveBeenCalled()
    })

    it('should only process change events', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown

      // Non-change event
      watchCallback('rename', 'session/transcript.jsonl')

      expect(readFileSync).not.toHaveBeenCalled()
    })

    it('should handle read errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown

      // Should not throw
      expect(() => watchCallback('change', 'session/transcript.jsonl')).not.toThrow()
    })

    it('should handle invalid JSON in log files', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('not valid json\n')

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown

      // Should not throw
      expect(() => watchCallback('change', 'session/transcript.jsonl')).not.toThrow()
    })

    it('should handle empty log files', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('')

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      // Should not send anything for empty file
      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should handle null filename', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown

      // Should not throw
      expect(() => watchCallback('change', null)).not.toThrow()
    })

    it('should map error type to error level', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          type: 'error',
          message: 'Something went wrong',
        }) + '\n'
      )

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'logs:stream',
        expect.objectContaining({
          level: 'error',
        })
      )
    })

    it('should handle watch errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(watch).mockImplementation(() => {
        throw new Error('Watch error')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      expect(() => logStream.start(['claude'])).not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to watch Claude logs:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should handle spawn errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error('Spawn error')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      expect(() => logStream.start(['system'])).not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to start journal stream:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // LOG EMISSION TESTS
  // ===========================================================================
  describe('log emission', () => {
    it('should not emit if no main window set', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.start(['system'])

      const entry = JSON.stringify({
        PRIORITY: '6',
        MESSAGE: 'Test',
      })

      // Should not throw
      mockChildProcess.stdout.emit('data', Buffer.from(entry + '\n'))
    })

    it('should not emit if stream is stopped', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])
      logStream.stop()

      const entry = JSON.stringify({
        PRIORITY: '6',
        MESSAGE: 'Test after stop',
      })

      mockChildProcess.stdout.emit('data', Buffer.from(entry + '\n'))

      // Should not have been called after stop
      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should generate unique IDs for log entries', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      logStream.setMainWindow(mockWindow as any)
      logStream.start(['system'])

      const entry = JSON.stringify({
        PRIORITY: '6',
        MESSAGE: 'Test',
      })

      mockChildProcess.stdout.emit('data', Buffer.from(entry + '\n'))
      mockChildProcess.stdout.emit('data', Buffer.from(entry + '\n'))

      const calls = mockWindow.webContents.send.mock.calls
      const id1 = calls[0][1].id
      const id2 = calls[1][1].id

      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^journal-/)
    })
  })

  // ===========================================================================
  // CONTENT EXTRACTION TESTS
  // ===========================================================================
  describe('content extraction', () => {
    it('should extract content from message.content', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          content: 'Direct content',
        }) + '\n'
      )

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'logs:stream',
        expect.objectContaining({
          message: 'Direct content',
        })
      )
    })

    it('should extract content from message field', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          message: 'Message content',
        }) + '\n'
      )

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'logs:stream',
        expect.objectContaining({
          message: 'Message content',
        })
      )
    })

    it('should pass through content directly', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const longContent = 'a'.repeat(300)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          content: longContent,
        }) + '\n'
      )

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      const call = mockWindow.webContents.send.mock.calls[0]
      const message = call[1].message

      // Content is passed through directly (not truncated for content field)
      expect(message).toBe(longContent)
    })

    it('should truncate when falling back to JSON.stringify', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          type: 'some-type',
          data: 'a'.repeat(300),
        }) + '\n'
      )

      logStream.setMainWindow(mockWindow as any)
      logStream.start(['claude'])

      const watchCallback = vi.mocked(watch).mock.calls[0][2] as (...args: unknown[]) => unknown
      watchCallback('change', 'session/transcript.jsonl')

      const call = mockWindow.webContents.send.mock.calls[0]
      const message = call[1].message

      // Should be truncated to 200 chars when using JSON.stringify fallback
      expect(message.length).toBeLessThanOrEqual(200)
    })
  })

  // ===========================================================================
  // CLEANUP TESTS
  // ===========================================================================
  describe('cleanup', () => {
    it('should clean up all watchers on stop', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      logStream.start(['all'])
      logStream.stop()

      expect(mockChildProcess.kill).toHaveBeenCalled()
      expect(mockFSWatcher.close).toHaveBeenCalled()
    })

    it('should handle multiple stop calls gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      logStream.start(['all'])
      logStream.stop()
      logStream.stop()

      // Should not throw
    })

    it('should clear watcher map on stop', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      logStream.start(['claude'])
      logStream.stop()
      logStream.start(['claude'])

      // Should create new watcher
      expect(watch).toHaveBeenCalledTimes(2)
    })
  })
})
