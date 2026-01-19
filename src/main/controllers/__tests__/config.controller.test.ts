/**
 * Config Controller Tests
 *
 * Comprehensive tests for the 5-tier config tRPC controller.
 * Tests configuration resolution, locking, diagnostics, and persistence.
 *
 * @module config.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configRouter } from '../config.controller'

// Mock the config service
const mockConfigResolver = {
  resolve: vi.fn(),
  get: vi.fn(),
  isLocked: vi.fn(),
  getSource: vi.fn(),
  getDiagnostics: vi.fn(),
  getUserConfigPath: vi.fn(),
  getSystemConfigPath: vi.fn(),
  getProjectConfigPath: vi.fn(),
  getProjectPath: vi.fn(),
  setProjectPath: vi.fn(),
  saveUserConfig: vi.fn(),
  saveProjectConfig: vi.fn(),
  invalidateCache: vi.fn(),
}

vi.mock('../../services/config', () => ({
  getConfigResolver: vi.fn(() => mockConfigResolver),
  resolveConfig: vi.fn((forceRefresh?: boolean) => mockConfigResolver.resolve(forceRefresh)),
}))

// Create a test caller
const createTestCaller = () => configRouter.createCaller({})

// Default resolved config for tests
const createDefaultResolvedConfig = () => ({
  $version: 1,
  llm: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
  },
  mcp: {
    discoveryPriority: ['project', 'user', 'system', 'builtin'],
  },
  security: {
    sandboxMode: true,
    allowDangerousOperations: false,
    requireWriteConfirmation: true,
  },
  embedding: {
    model: 'nomic-embed-text',
    autoEmbedSessions: true,
    autoEmbedLearnings: true,
    ollamaEndpoint: 'http://localhost:11434',
  },
  ui: {
    theme: 'dark',
    sidebarCollapsed: false,
    fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    showLineNumbers: true,
  },
  telemetry: {
    enabled: true,
    crashReporting: true,
  },
  _meta: {
    sources: {},
    locked: [],
    resolvedAt: Date.now(),
  },
})

describe('config.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()

    // Setup default mock returns
    mockConfigResolver.resolve.mockReturnValue(createDefaultResolvedConfig())
    mockConfigResolver.get.mockReturnValue(undefined)
    mockConfigResolver.isLocked.mockReturnValue(false)
    mockConfigResolver.getSource.mockReturnValue(undefined)
    mockConfigResolver.getDiagnostics.mockReturnValue([])
    mockConfigResolver.getUserConfigPath.mockReturnValue('/home/testuser/.config/claude-pilot/settings.json')
    mockConfigResolver.getSystemConfigPath.mockReturnValue('/etc/claude-pilot/policy.json')
    mockConfigResolver.getProjectConfigPath.mockReturnValue(null)
    mockConfigResolver.getProjectPath.mockReturnValue(null)
    mockConfigResolver.saveUserConfig.mockReturnValue(true)
    mockConfigResolver.saveProjectConfig.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // RESOLVE PROCEDURE
  // ===========================================================================
  describe('resolve', () => {
    it('should return resolved configuration', async () => {
      const result = await caller.resolve()

      expect(result).toHaveProperty('$version')
      expect(result).toHaveProperty('llm')
      expect(result).toHaveProperty('mcp')
      expect(result).toHaveProperty('security')
      expect(result).toHaveProperty('_meta')
    })

    it('should call resolver with forceRefresh=false by default', async () => {
      await caller.resolve()

      expect(mockConfigResolver.resolve).toHaveBeenCalledWith(false)
    })

    it('should call resolver with forceRefresh=true when requested', async () => {
      await caller.resolve({ forceRefresh: true })

      expect(mockConfigResolver.resolve).toHaveBeenCalledWith(true)
    })

    it('should accept empty input', async () => {
      const _result = await caller.resolve({})

      expect(_result).toBeDefined()
      expect(mockConfigResolver.resolve).toHaveBeenCalledWith(false)
    })

    it('should return full config structure', async () => {
      const config = createDefaultResolvedConfig()
      config.llm.model = 'claude-opus-4'
      config._meta.sources = { 'llm.model': 'user' }
      mockConfigResolver.resolve.mockReturnValue(config)

      const result = await caller.resolve()

      expect(result.llm?.model).toBe('claude-opus-4')
      expect(result._meta.sources['llm.model']).toBe('user')
    })
  })

  // ===========================================================================
  // GET PROCEDURE
  // ===========================================================================
  describe('get', () => {
    it('should reject empty path', async () => {
      await expect(caller.get({ path: '' })).rejects.toThrow()
    })

    it('should return value for valid path', async () => {
      mockConfigResolver.get.mockReturnValue('claude-sonnet-4-20250514')

      const result = await caller.get({ path: 'llm.model' })

      expect(result).toBe('claude-sonnet-4-20250514')
      expect(mockConfigResolver.get).toHaveBeenCalledWith('llm.model')
    })

    it('should return undefined for non-existent path', async () => {
      mockConfigResolver.get.mockReturnValue(undefined)

      const result = await caller.get({ path: 'nonexistent.path' })

      expect(result).toBeUndefined()
    })

    it('should handle nested paths', async () => {
      mockConfigResolver.get.mockReturnValue(true)

      const result = await caller.get({ path: 'security.sandboxMode' })

      expect(result).toBe(true)
      expect(mockConfigResolver.get).toHaveBeenCalledWith('security.sandboxMode')
    })

    it('should handle top-level paths', async () => {
      mockConfigResolver.get.mockReturnValue({ model: 'test', maxTokens: 100 })

      const result = await caller.get({ path: 'llm' })

      expect(result).toEqual({ model: 'test', maxTokens: 100 })
    })

    it('should handle paths with special characters', async () => {
      mockConfigResolver.get.mockReturnValue('value')

      await caller.get({ path: 'extensions.my-extension.setting' })

      expect(mockConfigResolver.get).toHaveBeenCalledWith('extensions.my-extension.setting')
    })
  })

  // ===========================================================================
  // IS LOCKED PROCEDURE
  // ===========================================================================
  describe('isLocked', () => {
    it('should reject empty path', async () => {
      await expect(caller.isLocked({ path: '' })).rejects.toThrow()
    })

    it('should return false for unlocked key', async () => {
      mockConfigResolver.isLocked.mockReturnValue(false)

      const result = await caller.isLocked({ path: 'llm.model' })

      expect(result).toBe(false)
    })

    it('should return true for locked key', async () => {
      mockConfigResolver.isLocked.mockReturnValue(true)

      const result = await caller.isLocked({ path: 'security.sandboxMode' })

      expect(result).toBe(true)
    })

    it('should call resolver with correct path', async () => {
      await caller.isLocked({ path: 'telemetry.enabled' })

      expect(mockConfigResolver.isLocked).toHaveBeenCalledWith('telemetry.enabled')
    })
  })

  // ===========================================================================
  // GET SOURCE PROCEDURE
  // ===========================================================================
  describe('getSource', () => {
    it('should reject empty path', async () => {
      await expect(caller.getSource({ path: '' })).rejects.toThrow()
    })

    it('should return undefined for unset key', async () => {
      mockConfigResolver.getSource.mockReturnValue(undefined)

      const result = await caller.getSource({ path: 'unset.key' })

      expect(result).toBeUndefined()
    })

    it('should return source tier for set key', async () => {
      mockConfigResolver.getSource.mockReturnValue('user')

      const result = await caller.getSource({ path: 'ui.theme' })

      expect(result).toBe('user')
    })

    it('should return installation for default values', async () => {
      mockConfigResolver.getSource.mockReturnValue('installation')

      const result = await caller.getSource({ path: 'llm.maxTokens' })

      expect(result).toBe('installation')
    })

    it('should return system for admin-set values', async () => {
      mockConfigResolver.getSource.mockReturnValue('system')

      const result = await caller.getSource({ path: 'security.sandboxMode' })

      expect(result).toBe('system')
    })

    it('should return project for project-level config', async () => {
      mockConfigResolver.getSource.mockReturnValue('project')

      const result = await caller.getSource({ path: 'mcp.servers.local' })

      expect(result).toBe('project')
    })

    it('should return session for env override', async () => {
      mockConfigResolver.getSource.mockReturnValue('session')

      const result = await caller.getSource({ path: 'llm.model' })

      expect(result).toBe('session')
    })
  })

  // ===========================================================================
  // DIAGNOSTICS PROCEDURE
  // ===========================================================================
  describe('diagnostics', () => {
    it('should return empty array when no diagnostics', async () => {
      mockConfigResolver.getDiagnostics.mockReturnValue([])

      const result = await caller.diagnostics()

      expect(result).toEqual([])
    })

    it('should return diagnostic info for all keys', async () => {
      const mockDiagnostics = [
        { key: 'llm.model', value: 'claude-sonnet-4', sourceTier: 'user', isLocked: false },
        { key: 'security.sandboxMode', value: true, sourceTier: 'system', isLocked: true },
      ]
      mockConfigResolver.getDiagnostics.mockReturnValue(mockDiagnostics)

      const result = await caller.diagnostics()

      expect(result).toHaveLength(2)
      expect(result[0].key).toBe('llm.model')
      expect(result[1].isLocked).toBe(true)
    })

    it('should include lock reason when available', async () => {
      const mockDiagnostics = [
        {
          key: 'security.allowDangerousOperations',
          value: false,
          sourceTier: 'system',
          isLocked: true,
          lockReason: 'Security policy',
        },
      ]
      mockConfigResolver.getDiagnostics.mockReturnValue(mockDiagnostics)

      const result = await caller.diagnostics()

      expect(result[0].lockReason).toBe('Security policy')
    })
  })

  // ===========================================================================
  // PATHS PROCEDURE
  // ===========================================================================
  describe('paths', () => {
    it('should return all config file paths', async () => {
      mockConfigResolver.getUserConfigPath.mockReturnValue('/home/user/.config/claude-pilot/settings.json')
      mockConfigResolver.getSystemConfigPath.mockReturnValue('/etc/claude-pilot/policy.json')
      mockConfigResolver.getProjectConfigPath.mockReturnValue('/project/.claude/pilot.json')

      const result = await caller.paths()

      expect(result.user).toBe('/home/user/.config/claude-pilot/settings.json')
      expect(result.system).toBe('/etc/claude-pilot/policy.json')
      expect(result.project).toBe('/project/.claude/pilot.json')
    })

    it('should return null for project path when not set', async () => {
      mockConfigResolver.getProjectConfigPath.mockReturnValue(null)

      const result = await caller.paths()

      expect(result.project).toBeNull()
    })
  })

  // ===========================================================================
  // PROJECT PATH PROCEDURE
  // ===========================================================================
  describe('projectPath', () => {
    it('should return null when no project set', async () => {
      mockConfigResolver.getProjectPath.mockReturnValue(null)

      const result = await caller.projectPath()

      expect(result).toBeNull()
    })

    it('should return project path when set', async () => {
      mockConfigResolver.getProjectPath.mockReturnValue('/home/user/my-project')

      const result = await caller.projectPath()

      expect(result).toBe('/home/user/my-project')
    })
  })

  // ===========================================================================
  // SET PROJECT PATH PROCEDURE
  // ===========================================================================
  describe('setProjectPath', () => {
    it('should accept null to clear project path', async () => {
      await caller.setProjectPath({ projectPath: null })

      expect(mockConfigResolver.setProjectPath).toHaveBeenCalledWith(null)
    })

    it('should accept valid project path', async () => {
      await caller.setProjectPath({ projectPath: '/home/user/project' })

      expect(mockConfigResolver.setProjectPath).toHaveBeenCalledWith('/home/user/project')
    })

    it('should accept empty string', async () => {
      await caller.setProjectPath({ projectPath: '' })

      expect(mockConfigResolver.setProjectPath).toHaveBeenCalledWith('')
    })

    it('should handle paths with special characters', async () => {
      await caller.setProjectPath({ projectPath: '/home/user/my project (1)' })

      expect(mockConfigResolver.setProjectPath).toHaveBeenCalledWith('/home/user/my project (1)')
    })
  })

  // ===========================================================================
  // SAVE USER CONFIG PROCEDURE
  // ===========================================================================
  describe('saveUserConfig', () => {
    it('should save user configuration', async () => {
      mockConfigResolver.saveUserConfig.mockReturnValue(true)

      const result = await caller.saveUserConfig({
        config: { ui: { theme: 'light' } },
      })

      expect(result).toBe(true)
      expect(mockConfigResolver.saveUserConfig).toHaveBeenCalledWith({ ui: { theme: 'light' } })
    })

    it('should return false on save failure', async () => {
      mockConfigResolver.saveUserConfig.mockReturnValue(false)

      const result = await caller.saveUserConfig({
        config: { llm: { model: 'test' } },
      })

      expect(result).toBe(false)
    })

    it('should accept empty config', async () => {
      mockConfigResolver.saveUserConfig.mockReturnValue(true)

      const result = await caller.saveUserConfig({ config: {} })

      expect(result).toBe(true)
      expect(mockConfigResolver.saveUserConfig).toHaveBeenCalledWith({})
    })

    it('should handle complex nested config', async () => {
      mockConfigResolver.saveUserConfig.mockReturnValue(true)

      const complexConfig = {
        llm: {
          model: 'claude-opus-4',
          maxTokens: 100000,
          thinkingEnabled: true,
        },
        mcp: {
          servers: {
            local: {
              command: 'npx',
              args: ['mcp-server'],
            },
          },
        },
      }

      const result = await caller.saveUserConfig({ config: complexConfig })

      expect(result).toBe(true)
      expect(mockConfigResolver.saveUserConfig).toHaveBeenCalledWith(complexConfig)
    })
  })

  // ===========================================================================
  // SAVE PROJECT CONFIG PROCEDURE
  // ===========================================================================
  describe('saveProjectConfig', () => {
    it('should save project configuration', async () => {
      mockConfigResolver.saveProjectConfig.mockReturnValue(true)

      const result = await caller.saveProjectConfig({
        config: { mcp: { servers: {} } },
      })

      expect(result).toBe(true)
    })

    it('should return false when no project set', async () => {
      mockConfigResolver.saveProjectConfig.mockReturnValue(false)

      const result = await caller.saveProjectConfig({
        config: { test: 'value' },
      })

      expect(result).toBe(false)
    })

    it('should accept empty config', async () => {
      mockConfigResolver.saveProjectConfig.mockReturnValue(true)

      const result = await caller.saveProjectConfig({ config: {} })

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // INVALIDATE CACHE PROCEDURE
  // ===========================================================================
  describe('invalidateCache', () => {
    it('should call invalidateCache on resolver', async () => {
      await caller.invalidateCache()

      expect(mockConfigResolver.invalidateCache).toHaveBeenCalled()
    })

    it('should not throw errors', async () => {
      await expect(caller.invalidateCache()).resolves.toBeUndefined()
    })
  })

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================
  describe('integration', () => {
    it('should handle config lifecycle', async () => {
      // Get initial config
      mockConfigResolver.resolve.mockReturnValue(createDefaultResolvedConfig())
      const initial = await caller.resolve()
      expect(initial.ui?.theme).toBe('dark')

      // Set project path
      await caller.setProjectPath({ projectPath: '/project' })
      expect(mockConfigResolver.setProjectPath).toHaveBeenCalledWith('/project')

      // Save user config
      mockConfigResolver.saveUserConfig.mockReturnValue(true)
      await caller.saveUserConfig({ config: { ui: { theme: 'light' } } })
      expect(mockConfigResolver.saveUserConfig).toHaveBeenCalled()

      // Invalidate cache
      await caller.invalidateCache()
      expect(mockConfigResolver.invalidateCache).toHaveBeenCalled()

      // Get refreshed config
      const updatedConfig = createDefaultResolvedConfig()
      updatedConfig.ui.theme = 'light'
      mockConfigResolver.resolve.mockReturnValue(updatedConfig)

      const refreshed = await caller.resolve({ forceRefresh: true })
      expect(refreshed.ui?.theme).toBe('light')
    })

    it('should respect locked values', async () => {
      // Check if a value is locked
      mockConfigResolver.isLocked.mockReturnValue(true)
      const isLocked = await caller.isLocked({ path: 'security.sandboxMode' })
      expect(isLocked).toBe(true)

      // Get source to verify it's from system
      mockConfigResolver.getSource.mockReturnValue('system')
      const source = await caller.getSource({ path: 'security.sandboxMode' })
      expect(source).toBe('system')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent resolve calls', async () => {
      const results = await Promise.all([
        caller.resolve(),
        caller.resolve({ forceRefresh: true }),
        caller.resolve(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toHaveProperty('_meta')
      })
    })

    it('should handle very long paths', async () => {
      const longPath = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z'
      mockConfigResolver.get.mockReturnValue(undefined)

      const result = await caller.get({ path: longPath })

      expect(result).toBeUndefined()
      expect(mockConfigResolver.get).toHaveBeenCalledWith(longPath)
    })

    it('should handle paths with only dots', async () => {
      mockConfigResolver.get.mockReturnValue(undefined)

      const _result = await caller.get({ path: '...' })

      expect(mockConfigResolver.get).toHaveBeenCalledWith('...')
    })

    it('should handle numeric values in config', async () => {
      mockConfigResolver.get.mockReturnValue(64000)

      const result = await caller.get({ path: 'llm.maxTokens' })

      expect(result).toBe(64000)
    })

    it('should handle boolean values in config', async () => {
      mockConfigResolver.get.mockReturnValue(true)

      const result = await caller.get({ path: 'security.sandboxMode' })

      expect(result).toBe(true)
    })

    it('should handle array values in config', async () => {
      mockConfigResolver.get.mockReturnValue(['project', 'user', 'system'])

      const result = await caller.get({ path: 'mcp.discoveryPriority' })

      expect(result).toEqual(['project', 'user', 'system'])
    })

    it('should handle null values in config', async () => {
      mockConfigResolver.get.mockReturnValue(null)

      const result = await caller.get({ path: 'some.null.value' })

      expect(result).toBeNull()
    })

    it('should handle config with special characters in keys', async () => {
      const config = {
        'special-key_name': 'value',
      }
      mockConfigResolver.saveUserConfig.mockReturnValue(true)

      const result = await caller.saveUserConfig({ config })

      expect(result).toBe(true)
      expect(mockConfigResolver.saveUserConfig).toHaveBeenCalledWith(config)
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should handle resolver throwing errors', async () => {
      mockConfigResolver.resolve.mockImplementation(() => {
        throw new Error('Failed to resolve config')
      })

      await expect(caller.resolve()).rejects.toThrow('Failed to resolve config')
    })

    it('should handle get throwing errors', async () => {
      mockConfigResolver.get.mockImplementation(() => {
        throw new Error('Path resolution failed')
      })

      await expect(caller.get({ path: 'any.path' })).rejects.toThrow()
    })

    it('should handle save throwing errors', async () => {
      mockConfigResolver.saveUserConfig.mockImplementation(() => {
        throw new Error('Write failed')
      })

      await expect(
        caller.saveUserConfig({ config: { test: 'value' } })
      ).rejects.toThrow('Write failed')
    })
  })
})
