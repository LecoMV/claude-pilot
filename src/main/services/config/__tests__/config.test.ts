/**
 * Config Service Tests
 *
 * Comprehensive tests for the 5-Tier Configuration Resolver including:
 * - Config resolution and merging
 * - Lock handling for admin policies
 * - Environment variable overrides
 * - Config caching and invalidation
 * - User and project config save/load
 *
 * @module config.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock hoisted functions
const mockExistsSync = vi.hoisted(() => vi.fn())
const mockReadFileSync = vi.hoisted(() => vi.fn())
const mockWriteFileSync = vi.hoisted(() => vi.fn())
const mockMkdirSync = vi.hoisted(() => vi.fn())
const mockHomedir = vi.hoisted(() => vi.fn())
const mockPlatform = vi.hoisted(() => vi.fn())

// Mock fs module
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}))

// Mock os module
vi.mock('os', () => ({
  homedir: mockHomedir,
  platform: mockPlatform,
}))

// Store original environment
const originalEnv = process.env

describe('Config Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    // Reset environment variables
    process.env = { ...originalEnv }

    // Default mock implementations
    mockHomedir.mockReturnValue('/home/testuser')
    mockPlatform.mockReturnValue('linux')
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('{}')
    mockWriteFileSync.mockReturnValue(undefined)
    mockMkdirSync.mockReturnValue(undefined)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // TYPES
  // ===========================================================================
  describe('types', () => {
    it('should export isLockableValue type guard', async () => {
      const { isLockableValue } = await import('../types')

      expect(isLockableValue({ value: 'test' })).toBe(true)
      expect(isLockableValue({ value: 'test', locked: true })).toBe(true)
      expect(isLockableValue('test')).toBe(false)
      expect(isLockableValue(123)).toBe(false)
      expect(isLockableValue(null)).toBe(false)
      expect(isLockableValue(undefined)).toBe(false)
      expect(isLockableValue([])).toBe(false)
    })

    it('should export DEFAULT_CONFIG with expected structure', async () => {
      const { DEFAULT_CONFIG } = await import('../types')

      expect(DEFAULT_CONFIG.$version).toBe(1)
      expect(DEFAULT_CONFIG.llm?.model).toBe('claude-sonnet-4-20250514')
      expect(DEFAULT_CONFIG.llm?.maxTokens).toBe(64000)
      expect(DEFAULT_CONFIG.llm?.thinkingEnabled).toBe(true)
      expect(DEFAULT_CONFIG.security?.sandboxMode).toBe(true)
      expect(DEFAULT_CONFIG.security?.allowDangerousOperations).toBe(false)
      expect(DEFAULT_CONFIG.ui?.theme).toBe('dark')
      expect(DEFAULT_CONFIG.telemetry?.enabled).toBe(true)
    })

    it('should export TIER_PRIORITY with correct ordering', async () => {
      const { TIER_PRIORITY } = await import('../types')

      expect(TIER_PRIORITY.installation).toBe(0)
      expect(TIER_PRIORITY.system).toBe(1)
      expect(TIER_PRIORITY.user).toBe(2)
      expect(TIER_PRIORITY.project).toBe(3)
      expect(TIER_PRIORITY.session).toBe(4)
    })
  })

  // ===========================================================================
  // CONFIG RESOLVER BASIC FUNCTIONALITY
  // ===========================================================================
  describe('ConfigResolver', () => {
    it('should return default config when no config files exist', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const { DEFAULT_CONFIG } = await import('../types')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.$version).toBe(DEFAULT_CONFIG.$version)
      expect(config.llm?.model).toBe(DEFAULT_CONFIG.llm?.model)
      expect(config.security?.sandboxMode).toBe(DEFAULT_CONFIG.security?.sandboxMode)
    })

    it('should include _meta with resolution metadata', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config._meta).toBeDefined()
      expect(config._meta.sources).toBeDefined()
      expect(config._meta.locked).toBeDefined()
      expect(config._meta.resolvedAt).toBeGreaterThan(0)
    })

    it('should cache config within TTL', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const config1 = resolver.resolve()
      const config2 = resolver.resolve()

      // Should be same reference (cached)
      expect(config1._meta.resolvedAt).toBe(config2._meta.resolvedAt)
    })

    it('should force refresh when forceRefresh is true', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const config1 = resolver.resolve()

      // Wait a tiny bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1))

      const config2 = resolver.resolve(true)

      expect(config2._meta.resolvedAt).toBeGreaterThan(config1._meta.resolvedAt)
    })

    it('should invalidate cache when invalidateCache is called', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const config1 = resolver.resolve()
      resolver.invalidateCache()

      // Wait a tiny bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1))

      const config2 = resolver.resolve()

      expect(config2._meta.resolvedAt).toBeGreaterThan(config1._meta.resolvedAt)
    })
  })

  // ===========================================================================
  // TIER MERGING
  // ===========================================================================
  describe('Config tier merging', () => {
    it('should merge system config over defaults', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/etc/claude-pilot/policy.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            llm: { model: 'system-model' },
            security: { sandboxMode: false },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.model).toBe('system-model')
      expect(config.security?.sandboxMode).toBe(false)
      // Non-overridden values should use defaults
      expect(config.llm?.maxTokens).toBe(64000)
    })

    it('should merge user config over system config', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/etc/claude-pilot/policy.json' ||
          path === '/home/testuser/.config/claude-pilot/settings.json'
        )
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            llm: { model: 'system-model' },
            ui: { theme: 'light' },
          })
        }
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            llm: { model: 'user-model' },
            ui: { fontSize: 16 },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.model).toBe('user-model')
      expect(config.ui?.theme).toBe('light') // From system
      expect(config.ui?.fontSize).toBe(16) // From user
    })

    it('should merge project config over user config', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/home/testuser/.config/claude-pilot/settings.json' ||
          path === '/my/project/.claude/pilot.json'
        )
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            llm: { model: 'user-model' },
          })
        }
        if (path === '/my/project/.claude/pilot.json') {
          return JSON.stringify({
            llm: { model: 'project-model', maxTokens: 32000 },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      resolver.setProjectPath('/my/project')
      const config = resolver.resolve()

      expect(config.llm?.model).toBe('project-model')
      expect(config.llm?.maxTokens).toBe(32000)
      expect(config._meta.projectPath).toBe('/my/project')
    })
  })

  // ===========================================================================
  // LOCK HANDLING
  // ===========================================================================
  describe('Config lock handling', () => {
    it('should prevent locked values from being overridden', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/etc/claude-pilot/policy.json' ||
          path === '/home/testuser/.config/claude-pilot/settings.json'
        )
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            security: {
              sandboxMode: { value: true, locked: true, lockReason: 'Admin policy' },
            },
          })
        }
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            security: { sandboxMode: false }, // User tries to disable
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      // Locked value should be preserved
      expect(config.security?.sandboxMode).toBe(true)
      expect(config._meta.locked).toContain('security.sandboxMode')
    })

    it('should extract value from lockable value structure', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/etc/claude-pilot/policy.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            llm: {
              model: { value: 'locked-model', locked: true },
            },
            telemetry: {
              enabled: { value: false, locked: false }, // Not locked
            },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.model).toBe('locked-model')
      expect(config.telemetry?.enabled).toBe(false)
    })

    it('should track source tier for each config key', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/etc/claude-pilot/policy.json' ||
          path === '/home/testuser/.config/claude-pilot/settings.json'
        )
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            security: { sandboxMode: true },
          })
        }
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            ui: { theme: 'dark' },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config._meta.sources['security.sandboxMode']).toBe('system')
      expect(config._meta.sources['ui.theme']).toBe('user')
    })

    it('should check if config key is locked via isLocked method', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/etc/claude-pilot/policy.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            security: {
              sandboxMode: { value: true, locked: true },
              allowDangerousOperations: false, // Not locked
            },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.isLocked('security.sandboxMode')).toBe(true)
      expect(resolver.isLocked('security.allowDangerousOperations')).toBe(false)
      expect(resolver.isLocked('nonexistent.key')).toBe(false)
    })
  })

  // ===========================================================================
  // ENVIRONMENT VARIABLE OVERRIDES
  // ===========================================================================
  describe('Environment variable overrides', () => {
    it('should override model from CLAUDE_PILOT_MODEL', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_MODEL = 'env-model'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.model).toBe('env-model')
      expect(config._meta.sources['llm.model']).toBe('session')
    })

    it('should override maxTokens from CLAUDE_PILOT_MAX_TOKENS', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_MAX_TOKENS = '128000'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.maxTokens).toBe(128000)
    })

    it('should ignore invalid CLAUDE_PILOT_MAX_TOKENS', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_MAX_TOKENS = 'not-a-number'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.maxTokens).toBe(64000) // Default
    })

    it('should override thinkingEnabled from CLAUDE_PILOT_THINKING_ENABLED', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_THINKING_ENABLED = 'false'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.thinkingEnabled).toBe(false)
    })

    it('should handle CLAUDE_PILOT_THINKING_ENABLED as "1"', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_THINKING_ENABLED = '1'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.llm?.thinkingEnabled).toBe(true)
    })

    it('should override sandboxMode from CLAUDE_PILOT_SANDBOX', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_SANDBOX = 'false'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.security?.sandboxMode).toBe(false)
    })

    it('should override theme from CLAUDE_PILOT_THEME', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_THEME = 'light'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.ui?.theme).toBe('light')
    })

    it('should ignore invalid CLAUDE_PILOT_THEME', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_THEME = 'invalid-theme'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.ui?.theme).toBe('dark') // Default
    })

    it('should override telemetry from CLAUDE_PILOT_TELEMETRY', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_TELEMETRY = 'false'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.telemetry?.enabled).toBe(false)
    })

    it('should override otelEndpoint from CLAUDE_PILOT_OTEL_ENDPOINT', async () => {
      mockExistsSync.mockReturnValue(false)
      process.env.CLAUDE_PILOT_OTEL_ENDPOINT = 'https://otel.example.com'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.telemetry?.otelEndpoint).toBe('https://otel.example.com')
    })

    it('should not override locked values via environment variables', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/etc/claude-pilot/policy.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            security: {
              sandboxMode: { value: true, locked: true },
            },
          })
        }
        return '{}'
      })

      process.env.CLAUDE_PILOT_SANDBOX = 'false'

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      // Locked value should not be overridden by env var
      expect(config.security?.sandboxMode).toBe(true)
    })
  })

  // ===========================================================================
  // GET VALUE
  // ===========================================================================
  describe('get method', () => {
    it('should get nested config value by path', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.get<string>('llm.model')).toBe('claude-sonnet-4-20250514')
      expect(resolver.get<number>('llm.maxTokens')).toBe(64000)
      expect(resolver.get<string>('ui.theme')).toBe('dark')
    })

    it('should return undefined for non-existent path', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.get<string>('nonexistent.path')).toBeUndefined()
      expect(resolver.get<string>('llm.nonexistent')).toBeUndefined()
    })

    it('should handle deeply nested paths', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/home/testuser/.config/claude-pilot/settings.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            mcp: {
              servers: {
                myServer: {
                  command: 'node',
                  args: ['server.js'],
                },
              },
            },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.get<string>('mcp.servers.myServer.command')).toBe('node')
    })
  })

  // ===========================================================================
  // GET SOURCE
  // ===========================================================================
  describe('getSource method', () => {
    it('should return source tier for config key', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/home/testuser/.config/claude-pilot/settings.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            ui: { fontSize: 18 },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.getSource('ui.fontSize')).toBe('user')
      expect(resolver.getSource('nonexistent')).toBeUndefined()
    })
  })

  // ===========================================================================
  // DIAGNOSTICS
  // ===========================================================================
  describe('getDiagnostics method', () => {
    it('should return diagnostic info for all config keys', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/etc/claude-pilot/policy.json' ||
          path === '/home/testuser/.config/claude-pilot/settings.json'
        )
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            security: {
              sandboxMode: { value: true, locked: true },
            },
          })
        }
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            ui: { theme: 'light' },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const diagnostics = resolver.getDiagnostics()

      expect(Array.isArray(diagnostics)).toBe(true)

      const sandboxDiag = diagnostics.find((d) => d.key === 'security.sandboxMode')
      expect(sandboxDiag).toBeDefined()
      expect(sandboxDiag?.value).toBe(true)
      expect(sandboxDiag?.sourceTier).toBe('system')
      expect(sandboxDiag?.isLocked).toBe(true)

      const themeDiag = diagnostics.find((d) => d.key === 'ui.theme')
      expect(themeDiag).toBeDefined()
      expect(themeDiag?.value).toBe('light')
      expect(themeDiag?.sourceTier).toBe('user')
      expect(themeDiag?.isLocked).toBe(false)
    })
  })

  // ===========================================================================
  // SAVE CONFIG
  // ===========================================================================
  describe('saveUserConfig method', () => {
    it('should save user config and invalidate cache', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ ui: { theme: 'dark' } }))
      mockWriteFileSync.mockReturnValue(undefined)
      mockMkdirSync.mockReturnValue(undefined)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const result = resolver.saveUserConfig({ ui: { theme: 'light' } })

      expect(result).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()
      // Check the last write call
      const calls = mockWriteFileSync.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[0]).toBe('/home/testuser/.config/claude-pilot/settings.json')
      expect(lastCall[1]).toContain('light')
    })

    it('should merge with existing user config at top level', async () => {
      // Note: saveUserConfig does a shallow merge, so it preserves top-level keys
      // but replaces entire nested objects
      vi.resetModules()
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ llm: { model: 'test' }, security: { sandboxMode: true } }))
      mockWriteFileSync.mockReturnValue(undefined)
      mockMkdirSync.mockReturnValue(undefined)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      resolver.saveUserConfig({ ui: { theme: 'light' } })

      expect(mockWriteFileSync).toHaveBeenCalled()
      const calls = mockWriteFileSync.mock.calls
      const lastCall = calls[calls.length - 1]
      const saved = JSON.parse(lastCall[1])
      // New key should be added
      expect(saved.ui.theme).toBe('light')
      // Existing top-level keys should be preserved
      expect(saved.llm.model).toBe('test')
      expect(saved.security.sandboxMode).toBe(true)
    })

    it('should create directory if it does not exist', async () => {
      vi.resetModules()
      // existsSync for the config file returns false (file doesn't exist)
      // but the directory needs to be created
      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('{}')
      mockWriteFileSync.mockReturnValue(undefined)
      mockMkdirSync.mockReturnValue(undefined)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      resolver.saveUserConfig({ ui: { theme: 'light' } })

      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.config/claude-pilot',
        { recursive: true }
      )
    })

    it('should return false on write error', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{}')
      mockMkdirSync.mockReturnValue(undefined)
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const result = resolver.saveUserConfig({ ui: { theme: 'light' } })

      expect(result).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  describe('saveProjectConfig method', () => {
    it('should save project config when project path is set', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{}')
      mockWriteFileSync.mockReturnValue(undefined)
      mockMkdirSync.mockReturnValue(undefined)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      resolver.setProjectPath('/my/project')

      const result = resolver.saveProjectConfig({ llm: { model: 'project-model' } })

      expect(result).toBe(true)
      // Check that writeFileSync was called with correct path and content
      expect(mockWriteFileSync).toHaveBeenCalled()
      const calls = mockWriteFileSync.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[0]).toBe('/my/project/.claude/pilot.json')
      expect(lastCall[1]).toContain('"model"')
      expect(lastCall[1]).toContain('project-model')
    })

    it('should return false when no project path is set', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const result = resolver.saveProjectConfig({ llm: { model: 'test' } })

      expect(result).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // PROJECT PATH MANAGEMENT
  // ===========================================================================
  describe('Project path management', () => {
    it('should invalidate cache when project path changes', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      const config1 = resolver.resolve()
      resolver.setProjectPath('/new/project')

      // Wait a tiny bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1))

      const config2 = resolver.resolve()

      expect(config2._meta.resolvedAt).toBeGreaterThan(config1._meta.resolvedAt)
      expect(config2._meta.projectPath).toBe('/new/project')
    })

    it('should not invalidate cache when setting same project path', async () => {
      mockExistsSync.mockReturnValue(false)

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      resolver.setProjectPath('/my/project')

      const config1 = resolver.resolve()
      resolver.setProjectPath('/my/project')
      const config2 = resolver.resolve()

      expect(config1._meta.resolvedAt).toBe(config2._meta.resolvedAt)
    })

    it('should return project path via getProjectPath', async () => {
      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.getProjectPath()).toBeNull()
      resolver.setProjectPath('/my/project')
      expect(resolver.getProjectPath()).toBe('/my/project')
    })
  })

  // ===========================================================================
  // PATH GETTERS
  // ===========================================================================
  describe('Path getters', () => {
    it('should return correct user config path for Linux', async () => {
      mockPlatform.mockReturnValue('linux')
      mockHomedir.mockReturnValue('/home/testuser')

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.getUserConfigPath()).toBe(
        '/home/testuser/.config/claude-pilot/settings.json'
      )
    })

    it('should return correct user config path for macOS', async () => {
      mockPlatform.mockReturnValue('darwin')
      mockHomedir.mockReturnValue('/Users/testuser')

      // Need to re-import to pick up new platform
      vi.resetModules()
      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.getUserConfigPath()).toBe(
        '/Users/testuser/Library/Application Support/claude-pilot/settings.json'
      )
    })

    it('should return correct user config path for Windows', async () => {
      mockPlatform.mockReturnValue('win32')
      mockHomedir.mockReturnValue('C:\\Users\\testuser')
      process.env.APPDATA = 'C:\\Users\\testuser\\AppData\\Roaming'

      vi.resetModules()
      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      // Note: path.join uses forward slashes on Linux even when platform is mocked as win32
      // The actual Windows behavior would use backslashes, but since we're running on Linux,
      // the path module still uses forward slashes
      expect(resolver.getUserConfigPath()).toContain('claude-pilot')
      expect(resolver.getUserConfigPath()).toContain('settings.json')
      expect(resolver.getUserConfigPath()).toContain('AppData')
    })

    it('should return correct system config path for Linux', async () => {
      mockPlatform.mockReturnValue('linux')

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.getSystemConfigPath()).toBe('/etc/claude-pilot/policy.json')
    })

    it('should return correct system config path for Windows', async () => {
      mockPlatform.mockReturnValue('win32')
      process.env.ProgramData = 'C:\\ProgramData'

      vi.resetModules()
      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      // Note: path.join uses forward slashes on Linux even when platform is mocked as win32
      expect(resolver.getSystemConfigPath()).toContain('ProgramData')
      expect(resolver.getSystemConfigPath()).toContain('claude-pilot')
      expect(resolver.getSystemConfigPath()).toContain('policy.json')
    })

    it('should return null for project config path when no project set', async () => {
      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()

      expect(resolver.getProjectConfigPath()).toBeNull()
    })

    it('should return correct project config path when project is set', async () => {
      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      resolver.setProjectPath('/my/project')

      expect(resolver.getProjectConfigPath()).toBe('/my/project/.claude/pilot.json')
    })
  })

  // ===========================================================================
  // SINGLETON FUNCTIONS
  // ===========================================================================
  describe('Singleton functions', () => {
    it('should return same instance from getConfigResolver', async () => {
      // Need fresh modules for this test
      vi.resetModules()
      mockExistsSync.mockReturnValue(false)

      const { getConfigResolver } = await import('../resolver')

      const resolver1 = getConfigResolver()
      const resolver2 = getConfigResolver()

      expect(resolver1).toBe(resolver2)
    })

    it('should resolve config via resolveConfig function', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(false)

      const { resolveConfig } = await import('../resolver')

      const config = resolveConfig()

      expect(config.$version).toBe(1)
      expect(config._meta).toBeDefined()
    })

    it('should get value via getConfigValue function', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(false)

      const { getConfigValue } = await import('../resolver')

      expect(getConfigValue<string>('llm.model')).toBe('claude-sonnet-4-20250514')
    })

    it('should check lock via isConfigLocked function', async () => {
      vi.resetModules()
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/etc/claude-pilot/policy.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            security: { sandboxMode: { value: true, locked: true } },
          })
        }
        return '{}'
      })

      const { isConfigLocked } = await import('../resolver')

      expect(isConfigLocked('security.sandboxMode')).toBe(true)
    })

    it('should set project path via setProjectPath function', async () => {
      vi.resetModules()
      mockExistsSync.mockReturnValue(false)

      const { setProjectPath, getConfigResolver } = await import('../resolver')

      setProjectPath('/new/project')

      expect(getConfigResolver().getProjectPath()).toBe('/new/project')
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('Error handling', () => {
    it('should handle malformed JSON in config file', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{ invalid json }')

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      // Should fall back to defaults
      expect(config.$version).toBe(1)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle read permission errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      // Should fall back to defaults
      expect(config.$version).toBe(1)
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // DEEP MERGE EDGE CASES
  // ===========================================================================
  describe('Deep merge edge cases', () => {
    it('should handle arrays (replace, not merge)', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === '/etc/claude-pilot/policy.json' ||
          path === '/home/testuser/.config/claude-pilot/settings.json'
        )
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/etc/claude-pilot/policy.json') {
          return JSON.stringify({
            mcp: { discoveryPriority: ['system', 'builtin'] },
          })
        }
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            mcp: { discoveryPriority: ['user', 'project'] },
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      // Arrays should be replaced, not merged
      expect(config.mcp?.discoveryPriority).toEqual(['user', 'project'])
    })

    it('should handle null values', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === '/home/testuser/.config/claude-pilot/settings.json'
      })

      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/home/testuser/.config/claude-pilot/settings.json') {
          return JSON.stringify({
            extensions: null,
          })
        }
        return '{}'
      })

      const { ConfigResolver } = await import('../resolver')
      const resolver = new ConfigResolver()
      const config = resolver.resolve()

      expect(config.extensions).toBeNull()
    })
  })
})
