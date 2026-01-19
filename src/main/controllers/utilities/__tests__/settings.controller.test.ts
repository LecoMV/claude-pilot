/**
 * Settings Controller Tests
 *
 * Comprehensive tests for the settings tRPC controller.
 * Tests all 4 procedures: get, save, setBudget, setClaude
 *
 * @module settings.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { settingsRouter } from '../settings.controller'

// Mock fs (sync functions used in the controller)
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// Create a test caller
const createTestCaller = () => settingsRouter.createCaller({})

// Default settings for reference
const defaultSettings = {
  theme: 'dark',
  accentColor: 'purple',
  sidebarCollapsed: false,
  terminalFont: 'jetbrains',
  terminalFontSize: 14,
  terminalScrollback: 10000,
  postgresHost: 'localhost',
  postgresPort: 5433,
  memgraphHost: 'localhost',
  memgraphPort: 7687,
  systemNotifications: true,
  soundEnabled: false,
  autoLock: false,
  clearOnExit: true,
}

describe('settings.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // GET PROCEDURE
  // ===========================================================================
  describe('get', () => {
    it('should return default settings when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.get()

      expect(result).toEqual(defaultSettings)
    })

    it('should return merged settings from file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          theme: 'light',
          terminalFontSize: 16,
          customKey: 'ignored',
        })
      )

      const result = await caller.get()

      expect(result.theme).toBe('light')
      expect(result.terminalFontSize).toBe(16)
      expect(result.accentColor).toBe('purple') // Default value preserved
      expect(result.sidebarCollapsed).toBe(false) // Default value preserved
    })

    it('should return default settings on parse error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('invalid json {{{')

      const result = await caller.get()

      expect(result).toEqual(defaultSettings)
    })

    it('should return default settings on read error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await caller.get()

      expect(result).toEqual(defaultSettings)
    })

    it('should preserve budget settings from file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          budget: {
            billingType: 'api',
            monthlyLimit: 50,
            warningThreshold: 80,
            alertsEnabled: true,
          },
        })
      )

      const result = await caller.get()

      expect(result.budget).toEqual({
        billingType: 'api',
        monthlyLimit: 50,
        warningThreshold: 80,
        alertsEnabled: true,
      })
    })

    it('should preserve claude path settings from file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          claude: {
            binaryPath: '/usr/local/bin/claude',
            projectsPath: '/home/user/claude-projects',
          },
        })
      )

      const result = await caller.get()

      expect(result.claude).toEqual({
        binaryPath: '/usr/local/bin/claude',
        projectsPath: '/home/user/claude-projects',
      })
    })
  })

  // ===========================================================================
  // SAVE PROCEDURE
  // ===========================================================================
  describe('save', () => {
    it('should save settings to file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const newSettings = {
        ...defaultSettings,
        theme: 'light' as const,
        terminalFontSize: 18,
      }

      const result = await caller.save(newSettings)

      expect(result).toBe(true)
      expect(writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.config/claude-pilot/settings.json',
        expect.any(String)
      )
      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.theme).toBe('light')
      expect(writtenContent.terminalFontSize).toBe(18)
    })

    it('should create config directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(mkdirSync).mockReturnValue(undefined)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const result = await caller.save(defaultSettings)

      expect(result).toBe(true)
      expect(mkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.config/claude-pilot',
        { recursive: true }
      )
    })

    it('should return false on write error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await caller.save(defaultSettings)

      expect(result).toBe(false)
    })

    it('should validate theme enum', async () => {
      await expect(
        caller.save({ ...defaultSettings, theme: 'invalid' as any })
      ).rejects.toThrow()
    })

    it('should validate accentColor enum', async () => {
      await expect(
        caller.save({ ...defaultSettings, accentColor: 'red' as any })
      ).rejects.toThrow()
    })

    it('should validate terminalFont enum', async () => {
      await expect(
        caller.save({ ...defaultSettings, terminalFont: 'monospace' as any })
      ).rejects.toThrow()
    })

    it('should validate terminalFontSize range', async () => {
      await expect(
        caller.save({ ...defaultSettings, terminalFontSize: 7 })
      ).rejects.toThrow()

      await expect(
        caller.save({ ...defaultSettings, terminalFontSize: 33 })
      ).rejects.toThrow()
    })

    it('should validate terminalScrollback range', async () => {
      await expect(
        caller.save({ ...defaultSettings, terminalScrollback: 99 })
      ).rejects.toThrow()

      await expect(
        caller.save({ ...defaultSettings, terminalScrollback: 100001 })
      ).rejects.toThrow()
    })

    it('should validate postgres port range', async () => {
      await expect(
        caller.save({ ...defaultSettings, postgresPort: 0 })
      ).rejects.toThrow()

      await expect(
        caller.save({ ...defaultSettings, postgresPort: 65536 })
      ).rejects.toThrow()
    })

    it('should validate memgraph port range', async () => {
      await expect(
        caller.save({ ...defaultSettings, memgraphPort: -1 })
      ).rejects.toThrow()

      await expect(
        caller.save({ ...defaultSettings, memgraphPort: 70000 })
      ).rejects.toThrow()
    })

    it('should accept valid theme values', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      await expect(
        caller.save({ ...defaultSettings, theme: 'dark' })
      ).resolves.toBe(true)

      await expect(
        caller.save({ ...defaultSettings, theme: 'light' })
      ).resolves.toBe(true)

      await expect(
        caller.save({ ...defaultSettings, theme: 'auto' })
      ).resolves.toBe(true)
    })

    it('should accept valid accentColor values', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const colors = ['purple', 'blue', 'green', 'teal'] as const
      for (const color of colors) {
        await expect(
          caller.save({ ...defaultSettings, accentColor: color })
        ).resolves.toBe(true)
      }
    })

    it('should accept valid terminalFont values', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const fonts = ['jetbrains', 'fira', 'cascadia'] as const
      for (const font of fonts) {
        await expect(
          caller.save({ ...defaultSettings, terminalFont: font })
        ).resolves.toBe(true)
      }
    })

    it('should accept boundary values for terminal settings', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      await expect(
        caller.save({ ...defaultSettings, terminalFontSize: 8 })
      ).resolves.toBe(true)

      await expect(
        caller.save({ ...defaultSettings, terminalFontSize: 32 })
      ).resolves.toBe(true)

      await expect(
        caller.save({ ...defaultSettings, terminalScrollback: 100 })
      ).resolves.toBe(true)

      await expect(
        caller.save({ ...defaultSettings, terminalScrollback: 100000 })
      ).resolves.toBe(true)
    })

    it('should save settings with optional budget', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const settingsWithBudget = {
        ...defaultSettings,
        budget: {
          billingType: 'subscription' as const,
          subscriptionPlan: 'pro' as const,
          monthlyLimit: 20,
          warningThreshold: 75,
          alertsEnabled: true,
        },
      }

      const result = await caller.save(settingsWithBudget)

      expect(result).toBe(true)
      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.budget.billingType).toBe('subscription')
      expect(writtenContent.budget.subscriptionPlan).toBe('pro')
    })

    it('should save settings with optional claude paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const settingsWithClaude = {
        ...defaultSettings,
        claude: {
          binaryPath: '/custom/path/claude',
          projectsPath: '/custom/projects',
        },
      }

      const result = await caller.save(settingsWithClaude)

      expect(result).toBe(true)
      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.claude.binaryPath).toBe('/custom/path/claude')
    })
  })

  // ===========================================================================
  // SET BUDGET PROCEDURE
  // ===========================================================================
  describe('setBudget', () => {
    it('should update budget settings', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const budgetSettings = {
        billingType: 'api' as const,
        monthlyLimit: 100,
        warningThreshold: 90,
        alertsEnabled: true,
      }

      const result = await caller.setBudget(budgetSettings)

      expect(result).toBe(true)
      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.budget).toEqual(budgetSettings)
    })

    it('should preserve existing settings when updating budget', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          ...defaultSettings,
          theme: 'light',
          terminalFontSize: 18,
        })
      )
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const budgetSettings = {
        billingType: 'subscription' as const,
        subscriptionPlan: 'max' as const,
        monthlyLimit: 100,
        warningThreshold: 80,
        alertsEnabled: false,
      }

      await caller.setBudget(budgetSettings)

      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.theme).toBe('light')
      expect(writtenContent.terminalFontSize).toBe(18)
      expect(writtenContent.budget.billingType).toBe('subscription')
    })

    it('should validate billingType enum', async () => {
      await expect(
        caller.setBudget({
          billingType: 'invalid' as any,
          monthlyLimit: 50,
          warningThreshold: 80,
          alertsEnabled: true,
        })
      ).rejects.toThrow()
    })

    it('should validate subscriptionPlan enum', async () => {
      await expect(
        caller.setBudget({
          billingType: 'subscription',
          subscriptionPlan: 'invalid' as any,
          monthlyLimit: 50,
          warningThreshold: 80,
          alertsEnabled: true,
        })
      ).rejects.toThrow()
    })

    it('should validate monthlyLimit is non-negative', async () => {
      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: -10,
          warningThreshold: 80,
          alertsEnabled: true,
        })
      ).rejects.toThrow()
    })

    it('should validate warningThreshold range', async () => {
      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: 50,
          warningThreshold: -1,
          alertsEnabled: true,
        })
      ).rejects.toThrow()

      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: 50,
          warningThreshold: 101,
          alertsEnabled: true,
        })
      ).rejects.toThrow()
    })

    it('should accept valid subscription plans', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const plans = ['pro', 'max', 'custom'] as const
      for (const plan of plans) {
        await expect(
          caller.setBudget({
            billingType: 'subscription',
            subscriptionPlan: plan,
            monthlyLimit: 50,
            warningThreshold: 80,
            alertsEnabled: true,
          })
        ).resolves.toBe(true)
      }
    })

    it('should accept boundary values for warningThreshold', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: 100,
          warningThreshold: 0,
          alertsEnabled: true,
        })
      ).resolves.toBe(true)

      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: 100,
          warningThreshold: 100,
          alertsEnabled: true,
        })
      ).resolves.toBe(true)
    })

    it('should handle write errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Write failed')
      })

      const result = await caller.setBudget({
        billingType: 'api',
        monthlyLimit: 50,
        warningThreshold: 80,
        alertsEnabled: true,
      })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // SET CLAUDE PROCEDURE
  // ===========================================================================
  describe('setClaude', () => {
    it('should update Claude path settings', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const claudeSettings = {
        binaryPath: '/usr/local/bin/claude',
        projectsPath: '/home/user/projects',
      }

      const result = await caller.setClaude(claudeSettings)

      expect(result).toBe(true)
      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.claude).toEqual(claudeSettings)
    })

    it('should preserve existing settings when updating claude paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          ...defaultSettings,
          accentColor: 'blue',
          budget: { billingType: 'api', monthlyLimit: 50, warningThreshold: 80, alertsEnabled: true },
        })
      )
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      await caller.setClaude({ binaryPath: '/custom/claude' })

      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      )
      expect(writtenContent.accentColor).toBe('blue')
      expect(writtenContent.budget.billingType).toBe('api')
      expect(writtenContent.claude.binaryPath).toBe('/custom/claude')
    })

    it('should accept partial claude settings', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      // Only binaryPath
      await expect(caller.setClaude({ binaryPath: '/path/claude' })).resolves.toBe(true)

      // Only projectsPath
      await expect(caller.setClaude({ projectsPath: '/projects' })).resolves.toBe(true)

      // Empty object (valid but does nothing useful)
      await expect(caller.setClaude({})).resolves.toBe(true)
    })

    it('should handle write errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Disk full')
      })

      const result = await caller.setClaude({ binaryPath: '/test' })

      expect(result).toBe(false)
    })

    it('should accept string paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      // Valid paths
      await expect(
        caller.setClaude({
          binaryPath: '/usr/local/bin/claude',
          projectsPath: '/home/user/.claude/projects',
        })
      ).resolves.toBe(true)

      // Relative-looking paths (still valid strings)
      await expect(
        caller.setClaude({
          binaryPath: './claude',
          projectsPath: '../projects',
        })
      ).resolves.toBe(true)
    })
  })

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================
  describe('integration', () => {
    it('should handle full settings lifecycle', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      let storedSettings = JSON.stringify(defaultSettings)

      vi.mocked(readFileSync).mockImplementation(() => storedSettings)
      vi.mocked(writeFileSync).mockImplementation((_, content) => {
        storedSettings = content as string
      })

      // Get initial settings
      let settings = await caller.get()
      expect(settings.theme).toBe('dark')

      // Update theme
      await caller.save({ ...settings, theme: 'light' })

      // Verify change persisted
      settings = await caller.get()
      expect(settings.theme).toBe('light')

      // Add budget
      await caller.setBudget({
        billingType: 'subscription',
        subscriptionPlan: 'pro',
        monthlyLimit: 20,
        warningThreshold: 75,
        alertsEnabled: true,
      })

      // Verify budget added without losing theme
      settings = await caller.get()
      expect(settings.theme).toBe('light')
      expect(settings.budget?.billingType).toBe('subscription')

      // Add claude paths
      await caller.setClaude({
        binaryPath: '/custom/claude',
      })

      // Verify all settings preserved
      settings = await caller.get()
      expect(settings.theme).toBe('light')
      expect(settings.budget?.billingType).toBe('subscription')
      expect(settings.claude?.binaryPath).toBe('/custom/claude')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle empty settings file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('')

      const result = await caller.get()

      // Should return defaults on empty file (parse error)
      expect(result).toEqual(defaultSettings)
    })

    it('should handle null values in settings file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          theme: null,
          terminalFontSize: null,
        })
      )

      const result = await caller.get()

      // Null values from file overwrite defaults due to spread behavior
      // This tests actual behavior - null values are preserved when spread
      expect(result.theme).toBe(null)
      expect(result.terminalFontSize).toBe(null)
    })

    it('should handle concurrent save operations', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      // Simulate concurrent saves
      const results = await Promise.all([
        caller.save({ ...defaultSettings, theme: 'light' }),
        caller.save({ ...defaultSettings, theme: 'dark' }),
        caller.save({ ...defaultSettings, theme: 'auto' }),
      ])

      // All should succeed
      expect(results.every((r) => r === true)).toBe(true)
      expect(writeFileSync).toHaveBeenCalledTimes(3)
    })

    it('should handle special characters in paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      // Paths with spaces and special characters
      await expect(
        caller.setClaude({
          binaryPath: '/path/with spaces/claude',
          projectsPath: '/path/with-dashes_and.dots/projects',
        })
      ).resolves.toBe(true)
    })

    it('should handle very long paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      const longPath = '/a'.repeat(500)
      await expect(
        caller.setClaude({
          binaryPath: longPath,
        })
      ).resolves.toBe(true)
    })

    it('should handle zero values correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(defaultSettings))
      vi.mocked(writeFileSync).mockReturnValue(undefined)

      // Zero is valid for monthlyLimit
      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: 0,
          warningThreshold: 50,
          alertsEnabled: false,
        })
      ).resolves.toBe(true)

      // Zero is valid for warningThreshold
      await expect(
        caller.setBudget({
          billingType: 'api',
          monthlyLimit: 100,
          warningThreshold: 0,
          alertsEnabled: false,
        })
      ).resolves.toBe(true)
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should log errors when reading settings fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      await caller.get()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log errors when saving settings fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Write error')
      })

      await caller.save(defaultSettings)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle mkdir failure when creating config directory', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await caller.save(defaultSettings)

      expect(result).toBe(false)
    })
  })
})
