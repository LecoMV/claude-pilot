/**
 * Terminal Controller Tests
 *
 * Comprehensive tests for the terminal tRPC controller.
 * Tests all 5 procedures: openAt, create, resize, close, list
 *
 * @module terminal.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { terminalRouter } from '../terminal.controller'

// Mock Electron's BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(),
  },
}))

// Mock the terminal manager service
vi.mock('../../../services/terminal', () => ({
  terminalManager: {
    create: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    listSessions: vi.fn(),
  },
}))

import { BrowserWindow } from 'electron'
import { terminalManager } from '../../../services/terminal'

// Create a test caller
const createTestCaller = () => terminalRouter.createCaller({})

describe('terminal.controller', () => {
  let caller: ReturnType<typeof createTestCaller>
  let mockWindow: {
    isDestroyed: () => boolean
    webContents: { send: ReturnType<typeof vi.fn> }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()

    // Setup mock window
    mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn(),
      },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // OPEN AT PROCEDURE
  // ===========================================================================
  describe('openAt', () => {
    it('should open terminal at specified path with focused window', async () => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow as unknown as BrowserWindow)

      const result = await caller.openAt({ path: '/home/user/project' })

      expect(result).toBe(true)
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('terminal:setCwd', '/home/user/project')
    })

    it('should use first window if no focused window', async () => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWindow as unknown as BrowserWindow])

      const result = await caller.openAt({ path: '/var/log' })

      expect(result).toBe(true)
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('terminal:setCwd', '/var/log')
    })

    it('should return false when no windows available', async () => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      const result = await caller.openAt({ path: '/some/path' })

      expect(result).toBe(false)
    })

    it('should return false when window is destroyed', async () => {
      const destroyedWindow = {
        isDestroyed: () => true,
        webContents: { send: vi.fn() },
      }
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(destroyedWindow as unknown as BrowserWindow)
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      const result = await caller.openAt({ path: '/some/path' })

      expect(result).toBe(false)
    })

    it('should reject empty path', async () => {
      await expect(caller.openAt({ path: '' })).rejects.toThrow()
    })

    it('should accept absolute paths', async () => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow as unknown as BrowserWindow)

      const result = await caller.openAt({ path: '/usr/local/bin' })

      expect(result).toBe(true)
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('terminal:setCwd', '/usr/local/bin')
    })

    it('should accept relative paths', async () => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow as unknown as BrowserWindow)

      const result = await caller.openAt({ path: './src' })

      expect(result).toBe(true)
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('terminal:setCwd', './src')
    })

    it('should accept paths with spaces', async () => {
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow as unknown as BrowserWindow)

      const result = await caller.openAt({ path: '/home/user/My Documents' })

      expect(result).toBe(true)
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('terminal:setCwd', '/home/user/My Documents')
    })

    it('should return false when webContents.send throws', async () => {
      const errorWindow = {
        isDestroyed: () => false,
        webContents: {
          send: vi.fn(() => {
            throw new Error('IPC Error')
          }),
        },
      }
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(errorWindow as unknown as BrowserWindow)

      const result = await caller.openAt({ path: '/some/path' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // CREATE PROCEDURE
  // ===========================================================================
  describe('create', () => {
    it('should create terminal session without cwd', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('session-abc123')

      const result = await caller.create()

      expect(result).toBe('session-abc123')
      expect(terminalManager.create).toHaveBeenCalledWith(undefined)
    })

    it('should create terminal session with cwd', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('session-def456')

      const result = await caller.create({ cwd: '/home/user/project' })

      expect(result).toBe('session-def456')
      expect(terminalManager.create).toHaveBeenCalledWith('/home/user/project')
    })

    it('should accept empty cwd object', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('session-ghi789')

      const result = await caller.create({})

      expect(result).toBe('session-ghi789')
      expect(terminalManager.create).toHaveBeenCalledWith(undefined)
    })

    it('should return unique session IDs', async () => {
      vi.mocked(terminalManager.create)
        .mockReturnValueOnce('session-1')
        .mockReturnValueOnce('session-2')
        .mockReturnValueOnce('session-3')

      const result1 = await caller.create()
      const result2 = await caller.create()
      const result3 = await caller.create()

      expect(result1).toBe('session-1')
      expect(result2).toBe('session-2')
      expect(result3).toBe('session-3')
    })

    it('should accept cwd with special characters', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('session-special')

      const result = await caller.create({ cwd: '/home/user/My Documents/Project (v2)' })

      expect(result).toBe('session-special')
      expect(terminalManager.create).toHaveBeenCalledWith('/home/user/My Documents/Project (v2)')
    })
  })

  // ===========================================================================
  // RESIZE PROCEDURE
  // ===========================================================================
  describe('resize', () => {
    it('should resize terminal session successfully', async () => {
      vi.mocked(terminalManager.resize).mockReturnValue(undefined)

      const result = await caller.resize({
        sessionId: 'session-abc',
        cols: 120,
        rows: 40,
      })

      expect(result).toBe(true)
      expect(terminalManager.resize).toHaveBeenCalledWith('session-abc', 120, 40)
    })

    it('should return false when resize throws', async () => {
      vi.mocked(terminalManager.resize).mockImplementation(() => {
        throw new Error('Session not found')
      })

      const result = await caller.resize({
        sessionId: 'non-existent',
        cols: 80,
        rows: 24,
      })

      expect(result).toBe(false)
    })

    it('should reject invalid cols (below min)', async () => {
      await expect(
        caller.resize({ sessionId: 'session', cols: 0, rows: 24 })
      ).rejects.toThrow()
    })

    it('should reject invalid cols (above max)', async () => {
      await expect(
        caller.resize({ sessionId: 'session', cols: 1001, rows: 24 })
      ).rejects.toThrow()
    })

    it('should reject invalid rows (below min)', async () => {
      await expect(
        caller.resize({ sessionId: 'session', cols: 80, rows: 0 })
      ).rejects.toThrow()
    })

    it('should reject invalid rows (above max)', async () => {
      await expect(
        caller.resize({ sessionId: 'session', cols: 80, rows: 501 })
      ).rejects.toThrow()
    })

    it('should accept minimum valid dimensions', async () => {
      vi.mocked(terminalManager.resize).mockReturnValue(undefined)

      const result = await caller.resize({
        sessionId: 'session',
        cols: 1,
        rows: 1,
      })

      expect(result).toBe(true)
      expect(terminalManager.resize).toHaveBeenCalledWith('session', 1, 1)
    })

    it('should accept maximum valid dimensions', async () => {
      vi.mocked(terminalManager.resize).mockReturnValue(undefined)

      const result = await caller.resize({
        sessionId: 'session',
        cols: 1000,
        rows: 500,
      })

      expect(result).toBe(true)
      expect(terminalManager.resize).toHaveBeenCalledWith('session', 1000, 500)
    })

    it('should reject empty session ID', async () => {
      await expect(
        caller.resize({ sessionId: '', cols: 80, rows: 24 })
      ).rejects.toThrow()
    })

    it('should reject non-integer cols', async () => {
      await expect(
        caller.resize({ sessionId: 'session', cols: 80.5, rows: 24 })
      ).rejects.toThrow()
    })

    it('should reject non-integer rows', async () => {
      await expect(
        caller.resize({ sessionId: 'session', cols: 80, rows: 24.7 })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CLOSE PROCEDURE
  // ===========================================================================
  describe('close', () => {
    it('should close terminal session successfully', async () => {
      vi.mocked(terminalManager.close).mockReturnValue(undefined)

      const result = await caller.close({ sessionId: 'session-abc' })

      expect(result).toBe(true)
      expect(terminalManager.close).toHaveBeenCalledWith('session-abc')
    })

    it('should return false when close throws', async () => {
      vi.mocked(terminalManager.close).mockImplementation(() => {
        throw new Error('Session not found')
      })

      const result = await caller.close({ sessionId: 'non-existent' })

      expect(result).toBe(false)
    })

    it('should reject empty session ID', async () => {
      await expect(caller.close({ sessionId: '' })).rejects.toThrow()
    })

    it('should handle multiple close calls for same session', async () => {
      vi.mocked(terminalManager.close)
        .mockReturnValueOnce(undefined)
        .mockImplementationOnce(() => {
          throw new Error('Already closed')
        })

      const result1 = await caller.close({ sessionId: 'session-abc' })
      const result2 = await caller.close({ sessionId: 'session-abc' })

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })

    it('should accept various session ID formats', async () => {
      vi.mocked(terminalManager.close).mockReturnValue(undefined)

      await caller.close({ sessionId: 'abc123' })
      await caller.close({ sessionId: 'session-with-dashes' })
      await caller.close({ sessionId: 'uuid-1234-5678-9abc' })

      expect(terminalManager.close).toHaveBeenCalledTimes(3)
    })
  })

  // ===========================================================================
  // LIST PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return empty array when no sessions', async () => {
      vi.mocked(terminalManager.listSessions).mockReturnValue([])

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should return list of session IDs', async () => {
      vi.mocked(terminalManager.listSessions).mockReturnValue([
        'session-1',
        'session-2',
        'session-3',
      ])

      const result = await caller.list()

      expect(result).toHaveLength(3)
      expect(result).toContain('session-1')
      expect(result).toContain('session-2')
      expect(result).toContain('session-3')
    })

    it('should return string array', async () => {
      vi.mocked(terminalManager.listSessions).mockReturnValue(['session-a'])

      const result = await caller.list()

      expect(Array.isArray(result)).toBe(true)
      expect(typeof result[0]).toBe('string')
    })

    it('should handle many sessions', async () => {
      const manySessions = Array.from({ length: 100 }, (_, i) => `session-${i}`)
      vi.mocked(terminalManager.listSessions).mockReturnValue(manySessions)

      const result = await caller.list()

      expect(result).toHaveLength(100)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent create operations', async () => {
      let counter = 0
      vi.mocked(terminalManager.create).mockImplementation(() => `session-${++counter}`)

      const results = await Promise.all([
        caller.create(),
        caller.create(),
        caller.create(),
      ])

      expect(results).toHaveLength(3)
      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(3)
    })

    it('should handle concurrent resize operations', async () => {
      vi.mocked(terminalManager.resize).mockReturnValue(undefined)

      const results = await Promise.all([
        caller.resize({ sessionId: 's1', cols: 80, rows: 24 }),
        caller.resize({ sessionId: 's2', cols: 120, rows: 40 }),
        caller.resize({ sessionId: 's3', cols: 160, rows: 50 }),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toBe(true))
    })

    it('should handle rapid create and close', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('temp-session')
      vi.mocked(terminalManager.close).mockReturnValue(undefined)

      const sessionId = await caller.create()
      const closed = await caller.close({ sessionId })

      expect(sessionId).toBe('temp-session')
      expect(closed).toBe(true)
    })

    it('should handle cwd with unicode characters', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('unicode-session')

      const result = await caller.create({ cwd: '/home/\u4E2D\u6587/\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8' })

      expect(result).toBe('unicode-session')
      expect(terminalManager.create).toHaveBeenCalledWith('/home/\u4E2D\u6587/\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8')
    })

    it('should handle very long paths', async () => {
      vi.mocked(terminalManager.create).mockReturnValue('long-path-session')
      const longPath = '/home/' + 'very/deep/'.repeat(50) + 'project'

      const result = await caller.create({ cwd: longPath })

      expect(result).toBe('long-path-session')
      expect(terminalManager.create).toHaveBeenCalledWith(longPath)
    })

    it('should handle window becoming null between get and use', async () => {
      // First call returns window, but getAllWindows returns empty
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      const result = await caller.openAt({ path: '/some/path' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // ERROR LOGGING TESTS
  // ===========================================================================
  describe('error handling', () => {
    it('should log error when openAt fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      await caller.openAt({ path: '/some/path' })

      // Error is logged when no window available
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle terminalManager throwing unexpected error', async () => {
      vi.mocked(terminalManager.close).mockImplementation(() => {
        throw new TypeError('Unexpected type error')
      })

      const result = await caller.close({ sessionId: 'session' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // INTEGRATION-LIKE TESTS
  // ===========================================================================
  describe('integration scenarios', () => {
    it('should support full terminal lifecycle', async () => {
      // Create session
      vi.mocked(terminalManager.create).mockReturnValue('lifecycle-session')
      const sessionId = await caller.create({ cwd: '/home/user' })
      expect(sessionId).toBe('lifecycle-session')

      // List should include the session
      vi.mocked(terminalManager.listSessions).mockReturnValue(['lifecycle-session'])
      const sessions1 = await caller.list()
      expect(sessions1).toContain('lifecycle-session')

      // Resize the terminal
      vi.mocked(terminalManager.resize).mockReturnValue(undefined)
      const resized = await caller.resize({
        sessionId: 'lifecycle-session',
        cols: 100,
        rows: 30,
      })
      expect(resized).toBe(true)

      // Close the session
      vi.mocked(terminalManager.close).mockReturnValue(undefined)
      const closed = await caller.close({ sessionId: 'lifecycle-session' })
      expect(closed).toBe(true)

      // List should be empty after close
      vi.mocked(terminalManager.listSessions).mockReturnValue([])
      const sessions2 = await caller.list()
      expect(sessions2).toHaveLength(0)
    })

    it('should handle multiple sessions in parallel', async () => {
      let sessionCounter = 0
      vi.mocked(terminalManager.create).mockImplementation((cwd) => `session-${++sessionCounter}-${cwd || 'default'}`)

      const [s1, s2, s3] = await Promise.all([
        caller.create({ cwd: '/project1' }),
        caller.create({ cwd: '/project2' }),
        caller.create({ cwd: '/project3' }),
      ])

      expect(s1).toContain('project1')
      expect(s2).toContain('project2')
      expect(s3).toContain('project3')
    })
  })
})
