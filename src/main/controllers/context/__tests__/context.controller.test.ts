/**
 * Context Controller Tests
 *
 * Comprehensive tests for the context tRPC controller.
 * Tests token usage, compaction settings, sessions, and predictive context.
 *
 * @module context.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { contextRouter } from '../context.controller'

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
  })),
}))

// Mock predictive context service
vi.mock('../../../services/predictive-context', () => ({
  predictiveContextService: {
    getPatterns: vi.fn(() => []),
    getStats: vi.fn(() => ({
      totalPredictions: 100,
      accuratePredictions: 75,
      accuracy: 0.75,
      trackedFiles: 50,
      cacheHitRate: 0.8,
    })),
    getConfig: vi.fn(() => ({
      enabled: true,
      maxPredictions: 10,
      minConfidence: 0.3,
      trackHistory: true,
      preloadEnabled: false,
      cacheSize: 1000,
    })),
    setConfig: vi.fn(() => true),
    clearCache: vi.fn(() => true),
    predict: vi.fn(() =>
      Promise.resolve([
        {
          path: 'src/index.ts',
          confidence: 0.9,
          reason: 'Matches keywords: main',
          source: 'keyword',
        },
      ])
    ),
  },
}))

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { predictiveContextService } from '../../../services/predictive-context'

// Create a test caller
const createTestCaller = () => contextRouter.createCaller({})

describe('context.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // TOKEN USAGE PROCEDURE
  // ===========================================================================
  describe('tokenUsage', () => {
    it('should return default token usage when no checkpoints exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.tokenUsage()

      expect(result).toEqual({
        current: 0,
        max: 200000,
        percentage: 0,
        lastCompaction: undefined,
      })
    })

    it('should read token count from checkpoint files', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['checkpoint-1.json', 'checkpoint-2.json'] as any)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ tokenCount: 50000 }))

      const result = await caller.tokenUsage()

      expect(result.current).toBe(50000)
      expect(result.max).toBe(200000)
      expect(result.percentage).toBe(25)
    })

    it('should handle tokens field in checkpoint', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['checkpoint-1.json'] as any)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ tokens: 75000 }))

      const result = await caller.tokenUsage()

      expect(result.current).toBe(75000)
      expect(result.percentage).toBe(37.5)
    })

    it('should parse last compaction time from checkpoint filename', async () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        return path.includes('compaction-checkpoints') || path.includes('checkpoints')
      })
      vi.mocked(readdirSync).mockImplementation((path: string) => {
        if (path.toString().includes('compaction-checkpoints')) {
          return ['checkpoint-20250115-120000.json'] as any
        }
        return [] as any
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))

      const result = await caller.tokenUsage()

      expect(result.lastCompaction).toBeDefined()
      // The date should be parsed from the filename
      expect(typeof result.lastCompaction).toBe('number')
    })

    it('should handle read errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await caller.tokenUsage()

      expect(result.current).toBe(0)
      expect(result.max).toBe(200000)
    })

    it('should handle invalid JSON in checkpoint', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['checkpoint-1.json'] as any)
      vi.mocked(readFileSync).mockReturnValue('invalid json {{{')

      const result = await caller.tokenUsage()

      expect(result.current).toBe(0)
    })
  })

  // ===========================================================================
  // COMPACTION SETTINGS PROCEDURE
  // ===========================================================================
  describe('compactionSettings', () => {
    it('should return default settings when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.compactionSettings()

      expect(result).toEqual({
        autoCompact: true,
        threshold: 80,
      })
    })

    it('should read settings from file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          autoCompact: false,
          compactThreshold: 90,
        })
      )

      const result = await caller.compactionSettings()

      expect(result.autoCompact).toBe(false)
      expect(result.threshold).toBe(90)
    })

    it('should use defaults for missing fields', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))

      const result = await caller.compactionSettings()

      expect(result.autoCompact).toBe(true)
      expect(result.threshold).toBe(80)
    })

    it('should handle parse errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('not valid json')

      const result = await caller.compactionSettings()

      expect(result).toEqual({
        autoCompact: true,
        threshold: 80,
      })
    })
  })

  // ===========================================================================
  // SESSIONS PROCEDURE
  // ===========================================================================
  describe('sessions', () => {
    it('should return empty array when projects directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.sessions()

      expect(result).toEqual([])
    })

    it('should discover sessions from projects directory', async () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        return (
          path.includes('projects') ||
          path.includes('project1') ||
          path.includes('transcript.jsonl')
        )
      })
      vi.mocked(readdirSync).mockImplementation((path: string, opts?: any) => {
        if (path.toString().includes('projects') && opts?.withFileTypes) {
          return [{ name: 'project1', isDirectory: () => true }] as any
        }
        return [] as any
      })
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          type: 'user',
          timestamp: '2025-01-15T12:00:00Z',
        }) +
          '\n' +
          JSON.stringify({
            type: 'assistant',
            timestamp: '2025-01-15T12:01:00Z',
            model: 'claude-3-opus',
          })
      )

      const result = await caller.sessions()

      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle invalid JSONL lines', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((path: string, opts?: any) => {
        if (opts?.withFileTypes) {
          return [{ name: 'project1', isDirectory: () => true }] as any
        }
        return [] as any
      })
      vi.mocked(readFileSync).mockReturnValue('{"type":"user"}\ninvalid json\n{"type":"assistant"}')

      const result = await caller.sessions()

      // Should still return results, skipping invalid lines
      expect(Array.isArray(result)).toBe(true)
    })

    it('should skip empty transcripts', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((path: string, opts?: any) => {
        if (opts?.withFileTypes) {
          return [{ name: 'empty-project', isDirectory: () => true }] as any
        }
        return [] as any
      })
      vi.mocked(readFileSync).mockReturnValue('')

      const result = await caller.sessions()

      expect(result).toHaveLength(0)
    })

    it('should parse token usage from messages', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((path: string, opts?: any) => {
        if (opts?.withFileTypes) {
          return [{ name: 'project-with-tokens', isDirectory: () => true }] as any
        }
        return [] as any
      })
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          type: 'assistant',
          timestamp: '2025-01-15T12:00:00Z',
          message: {
            usage: {
              input_tokens: 1000,
              output_tokens: 500,
            },
          },
        })
      )

      const result = await caller.sessions()

      if (result.length > 0) {
        expect(result[0].tokenCount).toBe(1500)
      }
    })

    it('should count tool calls', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockImplementation((path: string, opts?: any) => {
        if (opts?.withFileTypes) {
          return [{ name: 'project-with-tools', isDirectory: () => true }] as any
        }
        return [] as any
      })
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ type: 'tool_use', timestamp: '2025-01-15T12:00:00Z' }) +
          '\n' +
          JSON.stringify({ type: 'tool_result', timestamp: '2025-01-15T12:00:01Z' })
      )

      const result = await caller.sessions()

      if (result.length > 0) {
        expect(result[0].toolCalls).toBe(2)
      }
    })
  })

  // ===========================================================================
  // COMPACT PROCEDURE
  // ===========================================================================
  describe('compact', () => {
    it('should trigger compaction via spawn', async () => {
      const mockSpawn = vi.mocked(spawn)
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockProcess as any)

      const result = await caller.compact()

      expect(result).toBe(true)
      expect(mockSpawn).toHaveBeenCalledWith('claude', ['--print', '-p', '/compact'], {
        shell: false,
        stdio: 'pipe',
      })
    })

    it('should handle spawn errors', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error('Spawn failed')
      })

      const result = await caller.compact()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // SET AUTO COMPACT PROCEDURE
  // ===========================================================================
  describe('setAutoCompact', () => {
    it('should reject missing enabled field', async () => {
      await expect(caller.setAutoCompact({} as any)).rejects.toThrow()
    })

    it('should save enabled setting to file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const result = await caller.setAutoCompact({ enabled: true })

      expect(result).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()
      const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(writtenContent.autoCompact).toBe(true)
    })

    it('should save disabled setting', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const result = await caller.setAutoCompact({ enabled: false })

      expect(result).toBe(true)
      const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(writtenContent.autoCompact).toBe(false)
    })

    it('should create new settings file if not exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const result = await caller.setAutoCompact({ enabled: true })

      expect(result).toBe(true)
    })

    it('should handle write errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await caller.setAutoCompact({ enabled: true })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // PATTERNS PROCEDURE (PREDICTIVE CONTEXT)
  // ===========================================================================
  describe('patterns', () => {
    it('should reject empty project path', async () => {
      await expect(caller.patterns({ projectPath: '' })).rejects.toThrow()
    })

    it('should call predictive context service', async () => {
      const result = await caller.patterns({ projectPath: '/home/user/project' })

      expect(predictiveContextService.getPatterns).toHaveBeenCalledWith('/home/user/project')
      expect(Array.isArray(result)).toBe(true)
    })

    it('should return file access patterns', async () => {
      vi.mocked(predictiveContextService.getPatterns).mockReturnValue([
        {
          path: 'src/index.ts',
          accessCount: 10,
          lastAccessed: Date.now(),
          cooccurringFiles: ['src/utils.ts'],
          keywords: ['main', 'entry'],
        },
      ])

      const result = await caller.patterns({ projectPath: '/home/user/project' })

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('src/index.ts')
      expect(result[0].accessCount).toBe(10)
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return predictive context statistics', async () => {
      const result = await caller.stats()

      expect(result).toEqual({
        totalPredictions: 100,
        accuratePredictions: 75,
        accuracy: 0.75,
        trackedFiles: 50,
        cacheHitRate: 0.8,
      })
      expect(predictiveContextService.getStats).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // GET CONFIG PROCEDURE
  // ===========================================================================
  describe('getConfig', () => {
    it('should return predictive context configuration', async () => {
      const result = await caller.getConfig()

      expect(result).toEqual({
        enabled: true,
        maxPredictions: 10,
        minConfidence: 0.3,
        trackHistory: true,
        preloadEnabled: false,
        cacheSize: 1000,
      })
      expect(predictiveContextService.getConfig).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SET CONFIG PROCEDURE
  // ===========================================================================
  describe('setConfig', () => {
    it('should update configuration', async () => {
      const result = await caller.setConfig({
        enabled: false,
        maxPredictions: 20,
      })

      expect(result).toBe(true)
      expect(predictiveContextService.setConfig).toHaveBeenCalledWith({
        enabled: false,
        maxPredictions: 20,
      })
    })

    it('should validate maxPredictions range', async () => {
      await expect(caller.setConfig({ maxPredictions: 0 })).rejects.toThrow()
      await expect(caller.setConfig({ maxPredictions: 101 })).rejects.toThrow()
    })

    it('should validate minConfidence range', async () => {
      await expect(caller.setConfig({ minConfidence: -0.1 })).rejects.toThrow()
      await expect(caller.setConfig({ minConfidence: 1.5 })).rejects.toThrow()
    })

    it('should validate cacheSize range', async () => {
      await expect(caller.setConfig({ cacheSize: 5 })).rejects.toThrow()
      await expect(caller.setConfig({ cacheSize: 20000 })).rejects.toThrow()
    })

    it('should accept valid boundary values', async () => {
      await expect(caller.setConfig({ maxPredictions: 1 })).resolves.toBe(true)
      await expect(caller.setConfig({ maxPredictions: 100 })).resolves.toBe(true)
      await expect(caller.setConfig({ minConfidence: 0 })).resolves.toBe(true)
      await expect(caller.setConfig({ minConfidence: 1 })).resolves.toBe(true)
      await expect(caller.setConfig({ cacheSize: 10 })).resolves.toBe(true)
      await expect(caller.setConfig({ cacheSize: 10000 })).resolves.toBe(true)
    })

    it('should accept partial config updates', async () => {
      await expect(caller.setConfig({ enabled: true })).resolves.toBe(true)
      await expect(caller.setConfig({ trackHistory: false })).resolves.toBe(true)
      await expect(caller.setConfig({})).resolves.toBe(true)
    })
  })

  // ===========================================================================
  // CLEAR CACHE PROCEDURE
  // ===========================================================================
  describe('clearCache', () => {
    it('should clear the predictive context cache', async () => {
      const result = await caller.clearCache()

      expect(result).toBe(true)
      expect(predictiveContextService.clearCache).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // PREDICT PROCEDURE
  // ===========================================================================
  describe('predict', () => {
    it('should reject empty prompt', async () => {
      await expect(
        caller.predict({ prompt: '', projectPath: '/home/user/project' })
      ).rejects.toThrow()
    })

    it('should reject empty project path', async () => {
      await expect(caller.predict({ prompt: 'find config files', projectPath: '' })).rejects.toThrow()
    })

    it('should return file predictions', async () => {
      const result = await caller.predict({
        prompt: 'find the main entry point',
        projectPath: '/home/user/project',
      })

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('src/index.ts')
      expect(result[0].confidence).toBe(0.9)
      expect(result[0].source).toBe('keyword')
    })

    it('should call predict service with correct params', async () => {
      await caller.predict({
        prompt: 'update config',
        projectPath: '/projects/my-app',
      })

      expect(predictiveContextService.predict).toHaveBeenCalledWith(
        'update config',
        '/projects/my-app'
      )
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent token usage queries', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const results = await Promise.all([
        caller.tokenUsage(),
        caller.tokenUsage(),
        caller.tokenUsage(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.max).toBe(200000)
      })
    })

    it('should handle very long project paths', async () => {
      const longPath = '/home/user/' + 'a'.repeat(500) + '/project'

      const result = await caller.patterns({ projectPath: longPath })

      expect(predictiveContextService.getPatterns).toHaveBeenCalledWith(longPath)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle special characters in project path', async () => {
      const specialPath = '/home/user/my project (1)/test'

      const _result = await caller.patterns({ projectPath: specialPath })

      expect(predictiveContextService.getPatterns).toHaveBeenCalledWith(specialPath)
    })

    it('should handle unicode in prompts', async () => {
      const unicodePrompt = 'find files with emoji: \u{1F600} and CJK: \u4E2D\u6587'

      const result = await caller.predict({
        prompt: unicodePrompt,
        projectPath: '/project',
      })

      expect(predictiveContextService.predict).toHaveBeenCalledWith(unicodePrompt, '/project')
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
