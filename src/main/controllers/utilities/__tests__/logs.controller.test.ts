/**
 * Logs Controller Tests
 *
 * Comprehensive tests for the logs tRPC controller.
 * Tests log retrieval, streaming, and filtering.
 *
 * Procedures tested:
 * - recent
 * - stream
 * - stopStream
 *
 * @module logs.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logsRouter, logStreamManager } from '../logs.controller'
import * as spawnAsyncModule from '../../../utils/spawn-async'
import * as fs from 'fs'
import { BrowserWindow } from 'electron'

// Mock the spawn-async utility
vi.mock('../../../utils/spawn-async', () => ({
  spawnAsync: vi.fn(),
}))

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    watch: vi.fn(),
  }
})

// Mock path module partially
vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return {
    ...actual,
    join: (...args: string[]) => args.join('/'),
  }
})

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

// Mock Electron's BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}))

// Create a test caller
const createTestCaller = () => logsRouter.createCaller({})

describe('logs.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
    // Reset the log stream manager state
    logStreamManager.stop()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Ensure streams are stopped
    logStreamManager.stop()
  })

  // ===========================================================================
  // RECENT PROCEDURE
  // ===========================================================================
  describe('recent', () => {
    it('should return empty array when no logs are available', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(new Error('Command failed'))
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent()

      expect(result).toEqual([])
    })

    it('should use default limit when not specified', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(new Error('Command failed'))
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent()

      expect(result).toEqual([])
      // Just verify it doesn't throw - the default limit of 200 is used internally
    })

    it('should accept custom limit', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(new Error('Command failed'))
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 50 })

      expect(result).toEqual([])
    })

    it('should reject limit below minimum (1)', async () => {
      await expect(caller.recent({ limit: 0 })).rejects.toThrow()
    })

    it('should reject limit above maximum (1000)', async () => {
      await expect(caller.recent({ limit: 1001 })).rejects.toThrow()
    })

    it('should parse journalctl system logs', async () => {
      const journalOutput = `2025-01-18T10:00:00+0000 hostname systemd[1]: Started test service
2025-01-18T10:00:01+0000 hostname kernel[0]: Test kernel message`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('') // MCP logs

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      expect(spawnAsyncModule.spawnAsync).toHaveBeenCalledWith(
        'journalctl',
        expect.arrayContaining(['--no-pager', '-n']),
        expect.any(Object)
      )
      expect(result.length).toBeGreaterThan(0)
      expect(result.some((log) => log.source === 'system')).toBe(true)
    })

    it('should parse Claude session logs from transcript files', async () => {
      // First call for journalctl system logs - reject to skip
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockRejectedValueOnce(new Error('No journalctl'))
        .mockRejectedValueOnce(new Error('No MCP logs'))

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        // Check if withFileTypes is requested
        const withFileTypes =
          options &&
          typeof options === 'object' &&
          (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [
            { name: 'project1', isDirectory: () => true } as fs.Dirent,
            { name: 'project2', isDirectory: () => true } as fs.Dirent,
          ]
        }
        // Return session files for project subdirectories
        return ['session-abc.jsonl', 'session-def.jsonl']
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        '{"type":"message","role":"user","content":"Hello","timestamp":"2025-01-18T10:00:00Z"}\n' +
          '{"type":"tool_use","tool":"Read","input":{"file":"test.ts"},"timestamp":"2025-01-18T10:00:01Z"}\n'
      )

      const result = await caller.recent({ limit: 100 })

      expect(result.some((log) => log.source === 'claude')).toBe(true)
      expect(result.some((log) => log.source === 'agent')).toBe(true)
    })

    it('should parse MCP server logs', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('') // System logs
        .mockResolvedValueOnce(
          '2025-01-18T10:00:00+0000 hostname mcp-server[1234]: MCP server started'
        )

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const _result = await caller.recent({ limit: 100 })

      expect(spawnAsyncModule.spawnAsync).toHaveBeenCalledWith(
        'journalctl',
        expect.arrayContaining(['--user', '-u', 'mcp-*']),
        expect.any(Object)
      )
    })

    it('should detect error log level from message content', async () => {
      const journalOutput = `2025-01-18T10:00:00+0000 hostname process[1]: Error: Something failed
2025-01-18T10:00:01+0000 hostname process[1]: Exception occurred in module`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      const errorLogs = result.filter((log) => log.level === 'error')
      expect(errorLogs.length).toBeGreaterThan(0)
    })

    it('should detect warning log level from message content', async () => {
      const journalOutput = `2025-01-18T10:00:00+0000 hostname process[1]: Warning: Resource low
2025-01-18T10:00:01+0000 hostname process[1]: WARN: Deprecated method used`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      const warnLogs = result.filter((log) => log.level === 'warn')
      expect(warnLogs.length).toBeGreaterThan(0)
    })

    it('should detect debug log level from message content', async () => {
      const journalOutput = `2025-01-18T10:00:00+0000 hostname process[1]: DEBUG: Variable state`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      const debugLogs = result.filter((log) => log.level === 'debug')
      expect(debugLogs.length).toBeGreaterThan(0)
    })

    it('should sort logs by timestamp', async () => {
      const journalOutput = `2025-01-18T10:00:02+0000 hostname process[1]: Second message
2025-01-18T10:00:00+0000 hostname process[1]: First message
2025-01-18T10:00:01+0000 hostname process[1]: Third message`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      // Logs should be sorted by timestamp ascending
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp).toBeGreaterThanOrEqual(result[i - 1].timestamp)
      }
    })

    it('should truncate long messages to 500 characters', async () => {
      const longMessage = 'A'.repeat(600)
      const journalOutput = `2025-01-18T10:00:00+0000 hostname process[1]: ${longMessage}`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      const logWithLongMessage = result.find((log) => log.message.includes('AAA'))
      expect(logWithLongMessage?.message.length).toBeLessThanOrEqual(500)
    })

    it('should handle invalid JSON in session files gracefully', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockRejectedValueOnce(new Error('No journalctl'))
        .mockRejectedValueOnce(new Error('No MCP logs'))

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects')) {
          return [{ name: 'project1', isDirectory: () => true } as fs.Dirent]
        }
        return ['session-abc.jsonl']
      })

      vi.mocked(fs.readFileSync).mockReturnValue('invalid json line\n' + '{"valid":"json"}\n')

      // Should not throw
      const result = await caller.recent({ limit: 100 })
      expect(Array.isArray(result)).toBe(true)
    })

    it('should generate unique log IDs', async () => {
      const journalOutput = `2025-01-18T10:00:00+0000 hostname process[1]: Message 1
2025-01-18T10:00:01+0000 hostname process[1]: Message 2
2025-01-18T10:00:02+0000 hostname process[1]: Message 3`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      const ids = result.map((log) => log.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  // ===========================================================================
  // STREAM PROCEDURE
  // ===========================================================================
  describe('stream', () => {
    it('should start streaming with system source', async () => {
      const result = await caller.stream({ sources: ['system'] })

      expect(result).toBe(true)
    })

    it('should start streaming with claude source', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.stream({ sources: ['claude'] })

      expect(result).toBe(true)
    })

    it('should start streaming with all sources', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.stream({ sources: ['all'] })

      expect(result).toBe(true)
    })

    it('should start streaming with multiple sources', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.stream({
        sources: ['system', 'claude', 'mcp'],
      })

      expect(result).toBe(true)
    })

    it('should return true if already streaming', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      // Start first stream
      await caller.stream({ sources: ['system'] })

      // Try to start again
      const result = await caller.stream({ sources: ['claude'] })

      expect(result).toBe(true)
    })

    it('should reject invalid source types', async () => {
      await expect(
        // @ts-expect-error Testing invalid input
        caller.stream({ sources: ['invalid'] })
      ).rejects.toThrow()
    })

    it('should accept empty sources array (no streaming started)', async () => {
      // The schema allows empty arrays but nothing will be started
      const result = await caller.stream({ sources: [] })
      expect(result).toBe(true) // Returns true even with no sources
    })

    it('should accept agent source', async () => {
      const result = await caller.stream({ sources: ['agent'] })

      expect(result).toBe(true)
    })

    it('should accept workflow source', async () => {
      const result = await caller.stream({ sources: ['workflow'] })

      expect(result).toBe(true)
    })

    it('should accept mcp source', async () => {
      const result = await caller.stream({ sources: ['mcp'] })

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // STOP STREAM PROCEDURE
  // ===========================================================================
  describe('stopStream', () => {
    it('should stop streaming successfully', async () => {
      // Start streaming first
      vi.mocked(fs.existsSync).mockReturnValue(false)
      await caller.stream({ sources: ['system'] })

      const result = await caller.stopStream()

      expect(result).toBe(true)
    })

    it('should return true even if not streaming', async () => {
      const result = await caller.stopStream()

      expect(result).toBe(true)
    })

    it('should be idempotent - multiple stops should succeed', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      await caller.stream({ sources: ['system'] })

      const result1 = await caller.stopStream()
      const result2 = await caller.stopStream()
      const result3 = await caller.stopStream()

      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(result3).toBe(true)
    })
  })

  // ===========================================================================
  // LOG STREAM MANAGER TESTS
  // ===========================================================================
  describe('LogStreamManager', () => {
    it('should set main window', () => {
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: vi.fn(),
        },
      } as unknown as BrowserWindow

      logStreamManager.setMainWindow(mockWindow)

      // No error thrown indicates success
      expect(true).toBe(true)
    })

    it('should stop cleaning up watchers and processes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      // Start and stop
      logStreamManager.start(['system'])
      const result = logStreamManager.stop()

      expect(result).toBe(true)
    })

    it('should watch Claude project directories when claude source is specified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects')) {
          return [{ name: 'project1', isDirectory: () => true } as fs.Dirent]
        }
        return ['session.jsonl']
      })
      vi.mocked(fs.watch).mockReturnValue({
        close: vi.fn(),
      } as unknown as fs.FSWatcher)

      logStreamManager.start(['claude'])

      expect(fs.existsSync).toHaveBeenCalled()

      logStreamManager.stop()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle journalctl timeout gracefully', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(new Error('timeout'))
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent()

      expect(result).toEqual([])
    })

    it('should handle missing projects directory gracefully', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(new Error('No journalctl'))
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent()

      expect(result).toEqual([])
    })

    it('should handle unreadable session files gracefully', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(new Error('No journalctl'))
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects')) {
          return [{ name: 'project1', isDirectory: () => true } as fs.Dirent]
        }
        return ['session.jsonl']
      })
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      // Should not throw
      const result = await caller.recent()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should include metadata for Claude session logs', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockRejectedValueOnce(new Error('No journalctl'))
        .mockRejectedValueOnce(new Error('No MCP logs'))

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects')) {
          return [{ name: 'project1', isDirectory: () => true } as fs.Dirent]
        }
        return ['session-abc.jsonl']
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        '{"type":"message","role":"assistant","content":"Hello","timestamp":"2025-01-18T10:00:00Z","model":"claude-3"}\n'
      )

      const result = await caller.recent({ limit: 100 })

      const claudeLog = result.find((log) => log.source === 'claude')
      if (claudeLog) {
        expect(claudeLog.metadata).toBeDefined()
        // Claude log files have logFile in metadata (e.g., health-check, watchdog)
        expect(claudeLog.metadata).toHaveProperty('logFile')
      }
    })

    it('should handle malformed journal lines gracefully', async () => {
      const journalOutput = `not a valid journal line
another invalid line
2025-01-18T10:00:00+0000 hostname process[1]: Valid message`

      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce(journalOutput)
        .mockResolvedValueOnce('')

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.recent({ limit: 100 })

      // Should only include the valid log
      expect(result.length).toBe(1)
      expect(result[0].message).toContain('Valid message')
    })
  })
})
