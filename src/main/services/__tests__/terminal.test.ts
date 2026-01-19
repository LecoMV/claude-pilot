/**
 * Terminal Service Tests
 *
 * Comprehensive tests for the Terminal Manager that handles PTY sessions,
 * IPC communication, and terminal lifecycle management.
 *
 * @module terminal.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock hoisted functions
const mockSpawn = vi.hoisted(() => vi.fn())
const mockPlatform = vi.hoisted(() => vi.fn())
const mockHomedir = vi.hoisted(() => vi.fn())
const mockIpcMainHandle = vi.hoisted(() => vi.fn())
const mockIpcMainOn = vi.hoisted(() => vi.fn())

// Mock PTY instance
const createMockPty = vi.hoisted(() => () => {
  let dataCallback: ((data: string) => void) | null = null
  let exitCallback: ((exitInfo: { exitCode: number; signal?: number }) => void) | null = null

  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((callback: (data: string) => void) => {
      dataCallback = callback
      return { dispose: vi.fn() }
    }),
    onExit: vi.fn((callback: (exitInfo: { exitCode: number; signal?: number }) => void) => {
      exitCallback = callback
      return { dispose: vi.fn() }
    }),
    // Expose callbacks for testing
    _simulateData: (data: string) => dataCallback?.(data),
    _simulateExit: (exitCode: number, signal?: number) => exitCallback?.({ exitCode, signal }),
  }
})

vi.mock('node-pty', () => ({
  spawn: mockSpawn,
}))

vi.mock('os', () => ({
  platform: mockPlatform,
  homedir: mockHomedir,
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: mockIpcMainHandle,
    on: mockIpcMainOn,
  },
}))

// We need to import after mocking
import { terminalManager, registerTerminalHandlers } from '../terminal'

describe('TerminalManager', () => {
  let mockPty: ReturnType<typeof createMockPty>
  let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> } }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    mockPlatform.mockReturnValue('linux')
    mockHomedir.mockReturnValue('/home/testuser')

    // Create mock PTY
    mockPty = createMockPty()
    mockSpawn.mockReturnValue(mockPty)

    // Create mock window
    mockWindow = {
      webContents: {
        send: vi.fn(),
      },
    }

    // Set window on terminal manager
    terminalManager.setMainWindow(mockWindow as unknown as Electron.BrowserWindow)

    // Clear any existing sessions
    terminalManager.closeAll()
  })

  afterEach(() => {
    terminalManager.closeAll()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // CREATION TESTS
  // ===========================================================================
  describe('create', () => {
    it('should create a new terminal session', () => {
      const sessionId = terminalManager.create()

      expect(sessionId).toBeDefined()
      expect(sessionId).toMatch(/^term-\d+-[a-z0-9]+$/)
    })

    it('should spawn PTY with default shell on Linux', () => {
      process.env.SHELL = '/bin/zsh'
      mockPlatform.mockReturnValue('linux')

      terminalManager.create()

      expect(mockSpawn).toHaveBeenCalledWith(
        '/bin/zsh',
        [],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
        })
      )
    })

    it('should spawn PTY with PowerShell on Windows', () => {
      mockPlatform.mockReturnValue('win32')

      terminalManager.create()

      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell.exe',
        [],
        expect.any(Object)
      )
    })

    it('should spawn PTY with fallback shell if SHELL not set', () => {
      delete process.env.SHELL
      mockPlatform.mockReturnValue('linux')

      terminalManager.create()

      expect(mockSpawn).toHaveBeenCalledWith(
        '/bin/bash',
        [],
        expect.any(Object)
      )
    })

    it('should use custom working directory', () => {
      terminalManager.create('/custom/path')

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          cwd: '/custom/path',
        })
      )
    })

    it('should use home directory as default cwd', () => {
      terminalManager.create()

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          cwd: '/home/testuser',
        })
      )
    })

    it('should set terminal environment variables', () => {
      terminalManager.create()

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          env: expect.objectContaining({
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
          }),
        })
      )
    })

    it('should store session in sessions map', () => {
      const sessionId = terminalManager.create()

      const session = terminalManager.getSession(sessionId)
      expect(session).toBeDefined()
      expect(session?.id).toBe(sessionId)
    })

    it('should track session cwd', () => {
      const sessionId = terminalManager.create('/test/path')

      const session = terminalManager.getSession(sessionId)
      expect(session?.cwd).toBe('/test/path')
    })
  })

  // ===========================================================================
  // DATA HANDLING TESTS
  // ===========================================================================
  describe('data handling', () => {
    it('should forward PTY output to renderer', () => {
      const sessionId = terminalManager.create()

      // Simulate PTY data
      mockPty._simulateData('test output')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        `terminal:data:${sessionId}`,
        'test output'
      )
    })

    it('should handle multiple data events', () => {
      const _sessionId = terminalManager.create()

      mockPty._simulateData('line 1\n')
      mockPty._simulateData('line 2\n')
      mockPty._simulateData('line 3\n')

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(3)
    })

    it('should not fail if window is not set', () => {
      terminalManager.setMainWindow(null as unknown as Electron.BrowserWindow)
      terminalManager.create()

      // Should not throw
      mockPty._simulateData('test')
    })
  })

  // ===========================================================================
  // EXIT HANDLING TESTS
  // ===========================================================================
  describe('exit handling', () => {
    it('should forward exit event to renderer', () => {
      const sessionId = terminalManager.create()

      mockPty._simulateExit(0)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        `terminal:exit:${sessionId}`,
        { exitCode: 0, signal: undefined }
      )
    })

    it('should forward exit with signal', () => {
      const sessionId = terminalManager.create()

      mockPty._simulateExit(1, 9)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        `terminal:exit:${sessionId}`,
        { exitCode: 1, signal: 9 }
      )
    })

    it('should remove session from map on exit', () => {
      const sessionId = terminalManager.create()

      mockPty._simulateExit(0)

      expect(terminalManager.getSession(sessionId)).toBeUndefined()
    })

    it('should not be listed after exit', () => {
      const sessionId = terminalManager.create()

      mockPty._simulateExit(0)

      expect(terminalManager.listSessions()).not.toContain(sessionId)
    })
  })

  // ===========================================================================
  // WRITE TESTS
  // ===========================================================================
  describe('write', () => {
    it('should write data to PTY', () => {
      const sessionId = terminalManager.create()

      terminalManager.write(sessionId, 'test input')

      expect(mockPty.write).toHaveBeenCalledWith('test input')
    })

    it('should handle writing to non-existent session', () => {
      // Should not throw
      terminalManager.write('non-existent', 'test')

      expect(mockPty.write).not.toHaveBeenCalled()
    })

    it('should write special characters', () => {
      const sessionId = terminalManager.create()

      terminalManager.write(sessionId, '\x03') // Ctrl+C

      expect(mockPty.write).toHaveBeenCalledWith('\x03')
    })
  })

  // ===========================================================================
  // RESIZE TESTS
  // ===========================================================================
  describe('resize', () => {
    it('should resize PTY', () => {
      const sessionId = terminalManager.create()

      terminalManager.resize(sessionId, 120, 40)

      expect(mockPty.resize).toHaveBeenCalledWith(120, 40)
    })

    it('should handle resizing non-existent session', () => {
      // Should not throw
      terminalManager.resize('non-existent', 100, 50)

      expect(mockPty.resize).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // CLOSE TESTS
  // ===========================================================================
  describe('close', () => {
    it('should kill PTY on close', () => {
      const sessionId = terminalManager.create()

      terminalManager.close(sessionId)

      expect(mockPty.kill).toHaveBeenCalled()
    })

    it('should remove session from map on close', () => {
      const sessionId = terminalManager.create()

      terminalManager.close(sessionId)

      expect(terminalManager.getSession(sessionId)).toBeUndefined()
    })

    it('should handle closing non-existent session', () => {
      // Should not throw
      terminalManager.close('non-existent')
    })

    it('should not be listed after close', () => {
      const sessionId = terminalManager.create()

      terminalManager.close(sessionId)

      expect(terminalManager.listSessions()).not.toContain(sessionId)
    })
  })

  // ===========================================================================
  // CLOSE ALL TESTS
  // ===========================================================================
  describe('closeAll', () => {
    it('should close all sessions', () => {
      const sessionId1 = terminalManager.create()
      const sessionId2 = terminalManager.create()
      const sessionId3 = terminalManager.create()

      terminalManager.closeAll()

      expect(terminalManager.getSession(sessionId1)).toBeUndefined()
      expect(terminalManager.getSession(sessionId2)).toBeUndefined()
      expect(terminalManager.getSession(sessionId3)).toBeUndefined()
    })

    it('should result in empty session list', () => {
      terminalManager.create()
      terminalManager.create()

      terminalManager.closeAll()

      expect(terminalManager.listSessions()).toHaveLength(0)
    })

    it('should handle closeAll on empty manager', () => {
      // Should not throw
      terminalManager.closeAll()

      expect(terminalManager.listSessions()).toHaveLength(0)
    })
  })

  // ===========================================================================
  // GET SESSION TESTS
  // ===========================================================================
  describe('getSession', () => {
    it('should return session by ID', () => {
      const sessionId = terminalManager.create('/test/path')

      const session = terminalManager.getSession(sessionId)

      expect(session).toBeDefined()
      expect(session?.id).toBe(sessionId)
      expect(session?.cwd).toBe('/test/path')
    })

    it('should return undefined for unknown session', () => {
      const session = terminalManager.getSession('unknown')

      expect(session).toBeUndefined()
    })
  })

  // ===========================================================================
  // LIST SESSIONS TESTS
  // ===========================================================================
  describe('listSessions', () => {
    it('should list all session IDs', () => {
      const sessionId1 = terminalManager.create()
      const sessionId2 = terminalManager.create()

      const sessions = terminalManager.listSessions()

      expect(sessions).toContain(sessionId1)
      expect(sessions).toContain(sessionId2)
      expect(sessions).toHaveLength(2)
    })

    it('should return empty array when no sessions', () => {
      const sessions = terminalManager.listSessions()

      expect(sessions).toEqual([])
    })
  })

  // ===========================================================================
  // SET MAIN WINDOW TESTS
  // ===========================================================================
  describe('setMainWindow', () => {
    it('should set main window for IPC', () => {
      const newWindow = {
        webContents: {
          send: vi.fn(),
        },
      }

      terminalManager.setMainWindow(newWindow as unknown as Electron.BrowserWindow)
      const sessionId = terminalManager.create()

      mockPty._simulateData('test')

      expect(newWindow.webContents.send).toHaveBeenCalledWith(
        `terminal:data:${sessionId}`,
        'test'
      )
    })
  })

  // ===========================================================================
  // MULTIPLE SESSIONS TESTS
  // ===========================================================================
  describe('multiple sessions', () => {
    it('should manage multiple independent sessions', () => {
      // Create multiple mock PTYs
      const mockPty1 = createMockPty()
      const mockPty2 = createMockPty()
      mockSpawn.mockReturnValueOnce(mockPty1).mockReturnValueOnce(mockPty2)

      const sessionId1 = terminalManager.create('/path/1')
      const sessionId2 = terminalManager.create('/path/2')

      // Verify sessions are independent
      expect(terminalManager.getSession(sessionId1)?.cwd).toBe('/path/1')
      expect(terminalManager.getSession(sessionId2)?.cwd).toBe('/path/2')
    })

    it('should generate unique session IDs', () => {
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const id = terminalManager.create()
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }
    })
  })
})

// ===========================================================================
// IPC HANDLER REGISTRATION TESTS
// ===========================================================================
describe('registerTerminalHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register terminal:create handler', () => {
    registerTerminalHandlers()

    expect(mockIpcMainHandle).toHaveBeenCalledWith('terminal:create', expect.any(Function))
  })

  it('should register terminal:write handler', () => {
    registerTerminalHandlers()

    expect(mockIpcMainOn).toHaveBeenCalledWith('terminal:write', expect.any(Function))
  })

  it('should register terminal:resize handler', () => {
    registerTerminalHandlers()

    expect(mockIpcMainOn).toHaveBeenCalledWith('terminal:resize', expect.any(Function))
  })

  it('should register terminal:close handler', () => {
    registerTerminalHandlers()

    expect(mockIpcMainOn).toHaveBeenCalledWith('terminal:close', expect.any(Function))
  })

  it('should register terminal:list handler', () => {
    registerTerminalHandlers()

    expect(mockIpcMainHandle).toHaveBeenCalledWith('terminal:list', expect.any(Function))
  })

  it('should create session via IPC handler', () => {
    // Setup mock PTY for this test
    mockPlatform.mockReturnValue('linux')
    mockHomedir.mockReturnValue('/home/test')
    mockSpawn.mockReturnValue(createMockPty())

    registerTerminalHandlers()

    // Get the create handler
    const createCall = mockIpcMainHandle.mock.calls.find(
      (call) => call[0] === 'terminal:create'
    )
    const createHandler = createCall?.[1]

    // Call the handler
    const result = createHandler?.({}, '/test/cwd')

    expect(result).toMatch(/^term-\d+-[a-z0-9]+$/)
  })

  it('should list sessions via IPC handler', () => {
    // Create a session first
    mockPlatform.mockReturnValue('linux')
    mockHomedir.mockReturnValue('/home/test')
    mockSpawn.mockReturnValue(createMockPty())

    terminalManager.create()

    registerTerminalHandlers()

    // Get the list handler
    const listCall = mockIpcMainHandle.mock.calls.find(
      (call) => call[0] === 'terminal:list'
    )
    const listHandler = listCall?.[1]

    // Call the handler
    const result = listHandler?.()

    expect(Array.isArray(result)).toBe(true)
  })
})
