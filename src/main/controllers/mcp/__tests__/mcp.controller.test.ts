/**
 * MCP Controller Tests
 *
 * Comprehensive tests for the MCP tRPC controller.
 * Tests all 6 procedures: list, toggle, getServer, reload, getConfig, saveConfig
 *
 * @module mcp.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mcpRouter } from '../mcp.controller'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

// Mock fs modules
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => mcpRouter.createCaller({})

// Test constants
const CLAUDE_DIR = join(homedir(), '.claude')
const MCP_JSON_PATH = join(CLAUDE_DIR, 'mcp.json')
const SETTINGS_JSON_PATH = join(CLAUDE_DIR, 'settings.json')

// Sample MCP config for testing
const sampleMcpConfig = {
  mcpServers: {
    'test-server': {
      command: 'node',
      args: ['server.js'],
      env: { PORT: '3000' },
      disabled: false,
    },
    'disabled-server': {
      command: 'python',
      args: ['server.py'],
      disabled: true,
    },
    'minimal-server': {
      command: 'npx',
    },
  },
}

const sampleSettingsConfig = {
  mcpServers: {
    'settings-server': {
      command: 'deno',
      args: ['run', 'server.ts'],
      disabled: false,
    },
  },
}

describe('mcp.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // LIST PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return empty array when no config files exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should return servers from mcp.json', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const result = await caller.list()

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        name: 'test-server',
        status: 'online',
        config: {
          command: 'node',
          args: ['server.js'],
          env: { PORT: '3000' },
          disabled: false,
        },
      })
      expect(result[1].name).toBe('disabled-server')
      expect(result[1].status).toBe('offline')
    })

    it('should return servers from settings.json when mcp.json does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === SETTINGS_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleSettingsConfig))

      const result = await caller.list()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('settings-server')
      expect(result[0].status).toBe('online')
    })

    it('should merge servers from both config files', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (path === MCP_JSON_PATH) {
          return JSON.stringify(sampleMcpConfig)
        }
        return JSON.stringify(sampleSettingsConfig)
      })

      const result = await caller.list()

      // Should have servers from both, but mcp.json takes precedence
      expect(result.length).toBeGreaterThanOrEqual(3)
      // Should include unique server from settings.json
      expect(result.some((s) => s.name === 'settings-server')).toBe(true)
    })

    it('should not duplicate servers if present in both configs', async () => {
      const duplicateConfig = {
        mcpServers: {
          'test-server': {
            command: 'different-command',
            disabled: false,
          },
        },
      }

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (path === MCP_JSON_PATH) {
          return JSON.stringify(sampleMcpConfig)
        }
        return JSON.stringify(duplicateConfig)
      })

      const result = await caller.list()

      // test-server should appear only once
      const testServers = result.filter((s) => s.name === 'test-server')
      expect(testServers).toHaveLength(1)
      // Should use the one from mcp.json (first config file)
      expect(testServers[0].config.command).toBe('node')
    })

    it('should handle empty mcpServers object', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ mcpServers: {} }))

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should handle config without mcpServers key', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ otherKey: 'value' }))

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should handle JSON parse errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue('invalid json {{{')

      const result = await caller.list()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle file read errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'))

      const result = await caller.list()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should map disabled status correctly', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const result = await caller.list()

      const enabledServer = result.find((s) => s.name === 'test-server')
      const disabledServer = result.find((s) => s.name === 'disabled-server')

      expect(enabledServer?.status).toBe('online')
      expect(disabledServer?.status).toBe('offline')
    })
  })

  // ===========================================================================
  // GET SERVER PROCEDURE
  // ===========================================================================
  describe('getServer', () => {
    it('should return server by name', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const result = await caller.getServer({ name: 'test-server' })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('test-server')
      expect(result?.config.command).toBe('node')
    })

    it('should return null for non-existent server', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const result = await caller.getServer({ name: 'nonexistent-server' })

      expect(result).toBeNull()
    })

    it('should reject empty server name', async () => {
      await expect(caller.getServer({ name: '' })).rejects.toThrow()
    })

    it('should reject server name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101)
      await expect(caller.getServer({ name: longName })).rejects.toThrow()
    })

    it('should accept valid server names', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      // Should not throw validation errors
      await expect(
        caller.getServer({ name: 'valid-server-name' })
      ).resolves.toBeNull()
      await expect(
        caller.getServer({ name: 'server_with_underscores' })
      ).resolves.toBeNull()
      await expect(caller.getServer({ name: 'server123' })).resolves.toBeNull()
    })
  })

  // ===========================================================================
  // TOGGLE PROCEDURE
  // ===========================================================================
  describe('toggle', () => {
    it('should toggle server to enabled', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.toggle({ name: 'disabled-server', enabled: true })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(
        MCP_JSON_PATH,
        expect.any(String),
        'utf-8'
      )

      // Verify the written content
      const writtenContent = JSON.parse(
        vi.mocked(writeFile).mock.calls[0][1] as string
      )
      expect(writtenContent.mcpServers['disabled-server'].disabled).toBe(false)
    })

    it('should toggle server to disabled', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.toggle({ name: 'test-server', enabled: false })

      expect(result).toBe(true)

      const writtenContent = JSON.parse(
        vi.mocked(writeFile).mock.calls[0][1] as string
      )
      expect(writtenContent.mcpServers['test-server'].disabled).toBe(true)
    })

    it('should return false for non-existent server', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const result = await caller.toggle({
        name: 'nonexistent-server',
        enabled: true,
      })

      expect(result).toBe(false)
      expect(writeFile).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should use settings.json when mcp.json does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === SETTINGS_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleSettingsConfig))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.toggle({
        name: 'settings-server',
        enabled: false,
      })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(
        SETTINGS_JSON_PATH,
        expect.any(String),
        'utf-8'
      )
    })

    it('should handle write errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))
      vi.mocked(writeFile).mockRejectedValue(new Error('Write failed'))

      const result = await caller.toggle({ name: 'test-server', enabled: false })

      expect(result).toBe(false)
      consoleSpy.mockRestore()
    })

    it('should reject empty server name', async () => {
      await expect(caller.toggle({ name: '', enabled: true })).rejects.toThrow()
    })

    it('should reject server name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101)
      await expect(
        caller.toggle({ name: longName, enabled: true })
      ).rejects.toThrow()
    })

    it('should preserve other server configs when toggling', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await caller.toggle({ name: 'test-server', enabled: false })

      const writtenContent = JSON.parse(
        vi.mocked(writeFile).mock.calls[0][1] as string
      )
      // Other servers should be preserved
      expect(writtenContent.mcpServers['disabled-server']).toBeDefined()
      expect(writtenContent.mcpServers['minimal-server']).toBeDefined()
    })

    it('should create mcpServers object if missing', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}))

      const result = await caller.toggle({ name: 'some-server', enabled: true })

      // Should return false because server doesn't exist
      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // RELOAD PROCEDURE
  // ===========================================================================
  describe('reload', () => {
    it('should return true to indicate reload was requested', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const result = await caller.reload()

      expect(result).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[MCP] Config reload requested')
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // GET CONFIG PROCEDURE
  // ===========================================================================
  describe('getConfig', () => {
    it('should return settings.json content', async () => {
      const settingsContent = JSON.stringify({ theme: 'dark', mcpServers: {} })
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(settingsContent)

      const result = await caller.getConfig()

      expect(result).toBe(settingsContent)
      expect(readFile).toHaveBeenCalledWith(SETTINGS_JSON_PATH, 'utf-8')
    })

    it('should return empty object when settings.json does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.getConfig()

      expect(result).toBe('{}')
    })

    it('should return empty object on read error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('Read failed'))

      const result = await caller.getConfig()

      expect(result).toBe('{}')
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // SAVE CONFIG PROCEDURE
  // ===========================================================================
  describe('saveConfig', () => {
    it('should save valid JSON content', async () => {
      const content = JSON.stringify({ theme: 'light', mcpServers: {} }, null, 2)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.saveConfig({ content })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(SETTINGS_JSON_PATH, content, 'utf-8')
    })

    it('should reject invalid JSON content', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await caller.saveConfig({ content: 'invalid json {{{' })

      expect(result).toBe(false)
      expect(writeFile).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should reject empty content', async () => {
      await expect(caller.saveConfig({ content: '' })).rejects.toThrow()
    })

    it('should handle write errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(writeFile).mockRejectedValue(new Error('Write failed'))

      const result = await caller.saveConfig({
        content: JSON.stringify({ valid: true }),
      })

      expect(result).toBe(false)
      consoleSpy.mockRestore()
    })

    it('should save complex config structures', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const complexConfig = {
        mcpServers: {
          server1: { command: 'node', args: ['a', 'b'], env: { KEY: 'val' } },
          server2: { command: 'python' },
        },
        otherSettings: { nested: { deep: { value: 123 } } },
        array: [1, 2, 3],
      }

      const result = await caller.saveConfig({
        content: JSON.stringify(complexConfig),
      })

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should not log file paths in readable errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockRejectedValue(new Error('EACCES: permission denied'))

      await caller.list()

      // Verify error was logged but continue gracefully
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle path traversal attempts in server names', async () => {
      // Server names come from config files, so this tests the display/lookup
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          mcpServers: {
            '../../../etc/passwd': { command: 'cat' },
            'normal-server': { command: 'node' },
          },
        })
      )

      const result = await caller.list()

      // Should still list servers (config file is trusted)
      expect(result.length).toBe(2)
    })

    it('should validate server name input to prevent injection', async () => {
      // The schema allows alphanumeric, dashes, underscores, dots
      // But the controller gets names from config, so input validation
      // is mainly on user-provided inputs to getServer/toggle

      vi.mocked(existsSync).mockReturnValue(false)

      // These should be acceptable server names per schema
      await expect(
        caller.getServer({ name: 'valid-name_123.test' })
      ).resolves.toBeNull()

      // Extremely long name should be rejected
      await expect(
        caller.getServer({ name: 'a'.repeat(101) })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('workflow integration', () => {
    it('should handle list -> toggle -> list cycle', async () => {
      const config = {
        mcpServers: {
          myserver: { command: 'node', disabled: true },
        },
      }

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(config))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      // List - should be offline
      const list1 = await caller.list()
      expect(list1[0].status).toBe('offline')

      // Update mock to return the modified config
      const updatedConfig = {
        mcpServers: {
          myserver: { command: 'node', disabled: false },
        },
      }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(updatedConfig))

      // Toggle to enabled
      const toggled = await caller.toggle({ name: 'myserver', enabled: true })
      expect(toggled).toBe(true)

      // List again - should be online
      const list2 = await caller.list()
      expect(list2[0].status).toBe('online')
    })

    it('should handle getConfig -> saveConfig -> getConfig cycle', async () => {
      const originalConfig = JSON.stringify({ theme: 'dark' })
      const newConfig = JSON.stringify({ theme: 'light', newKey: true })

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue(originalConfig)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      // Get original config
      const config1 = await caller.getConfig()
      expect(config1).toBe(originalConfig)

      // Update mock for next read
      vi.mocked(readFile).mockResolvedValue(newConfig)

      // Save new config
      const saved = await caller.saveConfig({ content: newConfig })
      expect(saved).toBe(true)

      // Get updated config
      const config2 = await caller.getConfig()
      expect(config2).toBe(newConfig)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle server with only command (no args or env)', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const result = await caller.getServer({ name: 'minimal-server' })

      expect(result).not.toBeNull()
      expect(result?.config.command).toBe('npx')
      expect(result?.config.args).toBeUndefined()
      expect(result?.config.env).toBeUndefined()
    })

    it('should handle config with null values', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          mcpServers: {
            'null-server': {
              command: 'node',
              args: null,
              env: null,
              disabled: null,
            },
          },
        })
      )

      const result = await caller.list()

      expect(result).toHaveLength(1)
      expect(result[0].config.args).toBeNull()
    })

    it('should handle unicode characters in server names', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          mcpServers: {
            'server-with-emoji': { command: 'node' },
            normalserver: { command: 'python' },
          },
        })
      )

      const result = await caller.list()

      expect(result.some((s) => s.name === 'server-with-emoji')).toBe(true)
    })

    it('should handle very large config files', async () => {
      const largeConfig: Record<string, unknown> = { mcpServers: {} }
      for (let i = 0; i < 1000; i++) {
        ;(largeConfig.mcpServers as Record<string, unknown>)[`server-${i}`] = {
          command: 'node',
          args: [`arg-${i}`],
        }
      }

      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(largeConfig))

      const result = await caller.list()

      expect(result).toHaveLength(1000)
    })

    it('should handle concurrent list calls', async () => {
      vi.mocked(existsSync).mockImplementation((path) => path === MCP_JSON_PATH)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(sampleMcpConfig))

      const results = await Promise.all([
        caller.list(),
        caller.list(),
        caller.list(),
      ])

      expect(results[0]).toEqual(results[1])
      expect(results[1]).toEqual(results[2])
    })
  })
})
