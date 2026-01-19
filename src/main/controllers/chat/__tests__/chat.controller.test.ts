/**
 * Chat Controller Tests
 *
 * Comprehensive tests for the chat tRPC controller.
 * Tests message sending, cancellation, and status tracking.
 *
 * Note: The chat controller has module-level state (activeChats map)
 * which persists between tests. Tests are designed accordingly.
 *
 * @module chat.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create mock event emitter for process simulation
const createMockProcess = (autoClose: boolean = false, exitCode: number = 0) => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  const process = {
    stdout: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (!listeners[`stdout:${event}`]) listeners[`stdout:${event}`] = []
        listeners[`stdout:${event}`].push(cb)
        return process.stdout
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (!listeners[`stderr:${event}`]) listeners[`stderr:${event}`] = []
        listeners[`stderr:${event}`].push(cb)
        return process.stderr
      }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)

      // Auto-close if requested
      if (autoClose && event === 'close') {
        setImmediate(() => cb(exitCode))
      }
      return process
    }),
    kill: vi.fn(),
    _emit: (event: string, ...args: unknown[]) => {
      listeners[event]?.forEach((cb) => cb(...args))
    },
    _emitStdout: (event: string, data: Buffer) => {
      listeners[`stdout:${event}`]?.forEach((cb) => cb(data))
    },
    _emitStderr: (event: string, data: Buffer) => {
      listeners[`stderr:${event}`]?.forEach((cb) => cb(data))
    },
  }
  return process
}

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: '/usr/local/bin/claude',
  })),
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}))

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

// Mock Electron - create window mocks that can be configured per test
const mockWebContentsSend = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        webContents: {
          send: mockWebContentsSend,
        },
      },
    ]),
  },
}))

import { spawn, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { chatRouter } from '../chat.controller'

// Create a test caller
const createTestCaller = () => chatRouter.createCaller({})

describe('chat.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '/usr/local/bin/claude',
    } as ReturnType<typeof spawnSync>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // SEND PROCEDURE - BASIC TESTS
  // ===========================================================================
  describe('send', () => {
    it('should spawn claude process with correct arguments', async () => {
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/home/user/project',
        message: 'hello world',
        messageId: 'msg-123',
      })

      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        ['--print', 'hello world'],
        expect.objectContaining({
          cwd: '/home/user/project',
          env: expect.objectContaining({
            CI: '1',
            TERM: 'dumb',
          }),
        })
      )
      expect(result.success).toBe(true)
    })

    it('should return success on process exit code 0', async () => {
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-success',
      })

      expect(result.success).toBe(true)
    })

    it('should return error on non-zero exit code', async () => {
      const mockProcess = createMockProcess(true, 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-fail',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exited with code 1')
    })

    it('should return error on process error event', async () => {
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const promise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-error',
      })

      // Emit error after a tick
      setImmediate(() => {
        mockProcess._emit('error', new Error('Process spawn failed'))
      })

      const result = await promise

      expect(result.success).toBe(false)
      expect(result.error).toBe('Process spawn failed')
    })

    it('should send streaming chunks to renderer', async () => {
      mockWebContentsSend.mockClear()
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const promise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-stream',
      })

      setImmediate(() => {
        mockProcess._emitStdout('data', Buffer.from('Hello'))
        mockProcess._emitStdout('data', Buffer.from(' World'))
        mockProcess._emit('close', 0)
      })

      await promise

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'chat:response',
        expect.objectContaining({
          type: 'chunk',
          messageId: 'msg-stream',
        })
      )
    })

    it('should send done event on successful completion', async () => {
      mockWebContentsSend.mockClear()
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      await caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-done',
      })

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'chat:response',
        expect.objectContaining({
          type: 'done',
          messageId: 'msg-done',
        })
      )
    })

    it('should send error event on failure', async () => {
      mockWebContentsSend.mockClear()
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const promise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-err-event',
      })

      setImmediate(() => {
        mockProcess._emit('error', new Error('Failed'))
      })

      await promise

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'chat:response',
        expect.objectContaining({
          type: 'error',
          messageId: 'msg-err-event',
          error: 'Failed',
        })
      )
    })

    it('should resolve claude binary from various paths', async () => {
      // Test fallback when 'which' fails
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
      } as ReturnType<typeof spawnSync>)
      vi.mocked(existsSync).mockReturnValue(true)

      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      await caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'msg-fallback',
      })

      expect(spawn).toHaveBeenCalled()
    })

    it('should handle special characters in message', async () => {
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/project',
        message: 'Hello "world" with \'quotes\' and $variables',
        messageId: 'msg-special',
      })

      expect(result.success).toBe(true)
      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        ['--print', 'Hello "world" with \'quotes\' and $variables'],
        expect.any(Object)
      )
    })

    it('should handle unicode in message', async () => {
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/project',
        message: 'Test with emoji: \u{1F600} and CJK: \u4E2D\u6587',
        messageId: 'msg-unicode',
      })

      expect(result.success).toBe(true)
    })

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(10000)
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/project',
        message: longMessage,
        messageId: 'msg-long',
      })

      expect(result.success).toBe(true)
    })
  })

  // ===========================================================================
  // CANCEL PROCEDURE
  // ===========================================================================
  describe('cancel', () => {
    it('should return false for non-existent chat', async () => {
      const result = await caller.cancel({ messageId: 'nonexistent-id-unique' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Chat not found')
    })

    it('should kill active chat process', async () => {
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      // Start a chat
      const sendPromise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'cancel-test-unique',
      })

      // Wait for process to be registered
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Cancel it
      const cancelResult = await caller.cancel({ messageId: 'cancel-test-unique' })

      // Simulate process closing after kill
      mockProcess._emit('close', 0)
      await sendPromise

      expect(cancelResult.success).toBe(true)
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should send error event on cancel', async () => {
      mockWebContentsSend.mockClear()
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      // Start a chat
      const sendPromise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'cancel-test-event',
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Cancel it
      await caller.cancel({ messageId: 'cancel-test-event' })

      // Simulate process closing
      mockProcess._emit('close', 0)
      await sendPromise

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'chat:response',
        expect.objectContaining({
          type: 'error',
          messageId: 'cancel-test-event',
          error: 'Request cancelled',
        })
      )
    })
  })

  // ===========================================================================
  // STATUS PROCEDURE
  // ===========================================================================
  describe('status', () => {
    it('should return active chats count structure', async () => {
      const result = await caller.status()

      expect(result).toHaveProperty('activeChats')
      expect(result).toHaveProperty('chats')
      expect(typeof result.activeChats).toBe('number')
      expect(Array.isArray(result.chats)).toBe(true)
    })

    it('should track chat with correct properties', async () => {
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      // Start a chat
      const sendPromise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'status-test-props',
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Check status while running
      const status = await caller.status()

      // Find our chat in the active chats
      const ourChat = status.chats.find((c) => c.messageId === 'status-test-props')
      expect(ourChat).toBeDefined()
      expect(ourChat).toHaveProperty('startedAt')
      expect(ourChat).toHaveProperty('durationMs')
      expect(typeof ourChat?.startedAt).toBe('number')
      expect(typeof ourChat?.durationMs).toBe('number')

      // Complete the chat
      mockProcess._emit('close', 0)
      await sendPromise
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle process stderr output', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const promise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'stderr-test-edge',
      })

      setImmediate(() => {
        mockProcess._emitStderr('data', Buffer.from('Warning message'))
        mockProcess._emit('close', 0)
      })

      const result = await promise

      expect(result.success).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[Chat] stderr:', 'Warning message')
      consoleSpy.mockRestore()
    })

    it('should handle no browser windows', async () => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      // Should not throw
      const result = await caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'no-windows-edge',
      })

      expect(result.success).toBe(true)
    })

    it('should handle paths with spaces', async () => {
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const result = await caller.send({
        projectPath: '/home/user/my project/src',
        message: 'test',
        messageId: 'space-path-edge',
      })

      expect(result.success).toBe(true)
      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          cwd: '/home/user/my project/src',
        })
      )
    })

    it('should handle concurrent send requests', async () => {
      const processes = [
        createMockProcess(true, 0),
        createMockProcess(true, 0),
        createMockProcess(true, 0),
      ]
      let processIndex = 0

      vi.mocked(spawn).mockImplementation(() => {
        return processes[processIndex++] as ReturnType<typeof spawn>
      })

      const results = await Promise.all([
        caller.send({ projectPath: '/p1', message: 'm1', messageId: 'c1-edge' }),
        caller.send({ projectPath: '/p2', message: 'm2', messageId: 'c2-edge' }),
        caller.send({ projectPath: '/p3', message: 'm3', messageId: 'c3-edge' }),
      ])

      expect(results.every((r) => r.success)).toBe(true)
      expect(spawn).toHaveBeenCalledTimes(3)
    })

    it('should handle missing claude binary gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
      } as ReturnType<typeof spawnSync>)
      vi.mocked(existsSync).mockReturnValue(false)

      const mockProcess = createMockProcess(false)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      const promise = caller.send({
        projectPath: '/project',
        message: 'test',
        messageId: 'no-claude-edge',
      })

      setImmediate(() => {
        mockProcess._emit('error', new Error('spawn ENOENT'))
      })

      const result = await promise

      expect(result.success).toBe(false)
      expect(result.error).toContain('ENOENT')
    })
  })

  // ===========================================================================
  // VALIDATION TESTS
  // ===========================================================================
  describe('validation', () => {
    it('should validate all required fields in send', async () => {
      // Missing all fields
      await expect(caller.send({} as Parameters<typeof caller.send>[0])).rejects.toThrow()

      // Missing message
      await expect(
        caller.send({ projectPath: '/p', messageId: 'id' } as Parameters<typeof caller.send>[0])
      ).rejects.toThrow()

      // Missing projectPath
      await expect(
        caller.send({ message: 'msg', messageId: 'id' } as Parameters<typeof caller.send>[0])
      ).rejects.toThrow()

      // Missing messageId
      await expect(
        caller.send({ projectPath: '/p', message: 'msg' } as Parameters<typeof caller.send>[0])
      ).rejects.toThrow()
    })

    it('should accept empty strings per schema', async () => {
      // The schema uses z.string() without .min(1), so empty strings are valid
      const mockProcess = createMockProcess(true, 0)
      vi.mocked(spawn).mockReturnValue(mockProcess as ReturnType<typeof spawn>)

      // Empty strings are valid per the schema
      const result = await caller.send({
        projectPath: '',
        message: 'test',
        messageId: 'empty-path-valid',
      })

      expect(result).toBeDefined()
    })
  })
})
