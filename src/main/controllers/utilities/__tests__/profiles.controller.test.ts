/**
 * Profiles Controller Tests
 *
 * Comprehensive tests for the profiles tRPC controller.
 * Tests all 14 procedures covering profile settings, CLAUDE.md, rules,
 * and custom profiles management.
 *
 * @module profiles.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { profilesRouter } from '../profiles.controller'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  rm: vi.fn(),
}))

// Mock fs (sync functions)
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
  })),
}))

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

import { readFile, writeFile, readdir, mkdir, unlink, stat, access, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

// Create a test caller
const createTestCaller = () => profilesRouter.createCaller({})

describe('profiles.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // SETTINGS PROCEDURE
  // ===========================================================================
  describe('settings', () => {
    it('should return empty settings when file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.settings()

      expect(result).toEqual({})
    })

    it('should return parsed settings from settings.json', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          model: 'claude-opus-4-5-20251101',
          max_tokens: 8192,
          thinking: {
            type: 'enabled',
            budget_tokens: 32000,
          },
        })
      )

      const result = await caller.settings()

      expect(result).toEqual({
        model: 'claude-opus-4-5-20251101',
        maxTokens: 8192,
        thinkingEnabled: true,
        thinkingBudget: 32000,
      })
    })

    it('should return empty settings on parse error', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('invalid json')

      const result = await caller.settings()

      expect(result).toEqual({})
    })

    it('should handle disabled thinking state', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          thinking: {
            type: 'disabled',
            budget_tokens: 16000,
          },
        })
      )

      const result = await caller.settings()

      expect(result.thinkingEnabled).toBe(false)
      expect(result.thinkingBudget).toBe(16000)
    })
  })

  // ===========================================================================
  // SAVE SETTINGS PROCEDURE
  // ===========================================================================
  describe('saveSettings', () => {
    it('should create new settings file when none exists', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.saveSettings({
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 4096,
      })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalled()
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      expect(written.model).toBe('claude-sonnet-4-5-20250929')
      expect(written.max_tokens).toBe(4096)
    })

    it('should merge with existing settings', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          model: 'claude-opus-4-5-20251101',
          existingKey: 'preserved',
        })
      )
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.saveSettings({
        thinkingEnabled: true,
        thinkingBudget: 64000,
      })

      expect(result).toBe(true)
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      expect(written.model).toBe('claude-opus-4-5-20251101')
      expect(written.existingKey).toBe('preserved')
      expect(written.thinking.type).toBe('enabled')
      expect(written.thinking.budget_tokens).toBe(64000)
    })

    it('should handle write errors gracefully', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('{}')
      vi.mocked(writeFile).mockRejectedValue(new Error('Write failed'))

      const result = await caller.saveSettings({ model: 'test' })

      expect(result).toBe(false)
    })

    it('should set default thinking budget when enabling thinking', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await caller.saveSettings({ thinkingEnabled: true })

      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      expect(written.thinking.budget_tokens).toBe(32000)
    })

    it('should validate maxTokens is positive', async () => {
      await expect(caller.saveSettings({ maxTokens: -1 })).rejects.toThrow()
    })

    it('should validate temperature is between 0 and 2', async () => {
      await expect(caller.saveSettings({ temperature: 3 })).rejects.toThrow()
      await expect(caller.saveSettings({ temperature: -0.1 })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CLAUDEMD PROCEDURE
  // ===========================================================================
  describe('claudemd', () => {
    it('should return empty string when CLAUDE.md does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.claudemd()

      expect(result).toBe('')
    })

    it('should return CLAUDE.md content', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('# My Claude Instructions\n\nBe helpful.')

      const result = await caller.claudemd()

      expect(result).toBe('# My Claude Instructions\n\nBe helpful.')
    })

    it('should return empty string on read error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockRejectedValue(new Error('Read failed'))

      const result = await caller.claudemd()

      expect(result).toBe('')
    })
  })

  // ===========================================================================
  // SAVE CLAUDEMD PROCEDURE
  // ===========================================================================
  describe('saveClaudemd', () => {
    it('should save CLAUDE.md content', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.saveClaudemd({ content: '# New Instructions' })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md'),
        '# New Instructions'
      )
    })

    it('should handle write errors', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('Permission denied'))

      const result = await caller.saveClaudemd({ content: 'test' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // RULES PROCEDURE
  // ===========================================================================
  describe('rules', () => {
    it('should return empty array when rules dir does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.rules()

      expect(result).toEqual([])
    })

    it('should return list of rules with enabled/disabled status', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('settings.json')) return true
        if (typeof path === 'string' && path.endsWith('rules')) return true
        return false
      })
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({ disabledRules: ['disabled-rule'] })
        }
        if (typeof path === 'string' && path.includes('enabled-rule.md')) {
          return '# Enabled Rule\n\nRule content here'
        }
        if (typeof path === 'string' && path.includes('disabled-rule.md')) {
          return '# Disabled Rule\n\nOther content'
        }
        throw new Error('File not found')
      })
      vi.mocked(readdir).mockResolvedValue([
        { name: 'enabled-rule.md', isFile: () => true, isDirectory: () => false },
        { name: 'disabled-rule.md', isFile: () => true, isDirectory: () => false },
        { name: 'not-a-rule.txt', isFile: () => true, isDirectory: () => false },
      ] as any)

      const result = await caller.rules()

      expect(result).toHaveLength(2)
      const enabledRule = result.find((r) => r.name === 'enabled-rule')
      const disabledRule = result.find((r) => r.name === 'disabled-rule')
      expect(enabledRule?.enabled).toBe(true)
      expect(enabledRule?.content).toContain('Enabled Rule')
      expect(disabledRule?.enabled).toBe(false)
    })

    it('should handle rule content read errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({})
        }
        throw new Error('Read failed')
      })
      vi.mocked(readdir).mockResolvedValue([
        { name: 'broken-rule.md', isFile: () => true, isDirectory: () => false },
      ] as any)

      const result = await caller.rules()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('broken-rule')
      expect(result[0].content).toBeUndefined()
    })
  })

  // ===========================================================================
  // TOGGLE RULE PROCEDURE
  // ===========================================================================
  describe('toggleRule', () => {
    it('should enable a disabled rule', async () => {
      vi.mocked(access).mockResolvedValue(undefined) // Rule file exists
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ disabledRules: ['my-rule'] }))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.toggleRule({ name: 'my-rule', enabled: true })

      expect(result).toBe(true)
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      expect(written.disabledRules).not.toContain('my-rule')
    })

    it('should disable an enabled rule', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ disabledRules: [] }))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.toggleRule({ name: 'my-rule', enabled: false })

      expect(result).toBe(true)
      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      expect(written.disabledRules).toContain('my-rule')
    })

    it('should return false if rule file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.toggleRule({ name: 'nonexistent', enabled: true })

      expect(result).toBe(false)
    })

    it('should not duplicate rule in disabled list', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ disabledRules: ['already-disabled'] }))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await caller.toggleRule({ name: 'already-disabled', enabled: false })

      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      const count = written.disabledRules.filter((r: string) => r === 'already-disabled').length
      expect(count).toBe(1)
    })

    it('should reject empty rule name', async () => {
      await expect(caller.toggleRule({ name: '', enabled: true })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SAVE RULE PROCEDURE
  // ===========================================================================
  describe('saveRule', () => {
    it('should save rule content to file', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.saveRule({
        path: '/home/testuser/.claude/rules/my-rule.md',
        content: '# My Rule\n\nRule content',
      })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(
        '/home/testuser/.claude/rules/my-rule.md',
        '# My Rule\n\nRule content',
        'utf-8'
      )
    })

    it('should return false on write error', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('Write failed'))

      const result = await caller.saveRule({
        path: '/some/path.md',
        content: 'content',
      })

      expect(result).toBe(false)
    })

    it('should reject empty path', async () => {
      await expect(caller.saveRule({ path: '', content: 'test' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // LIST PROFILES PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return empty array when profiles dir does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should return list of profiles sorted by name', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readdir).mockResolvedValue([
        { name: 'engineering', isDirectory: () => true, isFile: () => false },
        { name: 'security', isDirectory: () => true, isFile: () => false },
        { name: 'not-a-profile.txt', isDirectory: () => false, isFile: () => true },
      ] as any)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            thinking: { type: 'enabled', budget_tokens: 16000 },
          })
        }
        if (typeof path === 'string' && path.includes('CLAUDE.md')) {
          return '# Profile Instructions'
        }
        if (typeof path === 'string' && path.includes('metadata.json')) {
          // Return metadata based on which profile directory
          if (path.includes('engineering')) {
            return JSON.stringify({
              name: 'engineering',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
          if (path.includes('security')) {
            return JSON.stringify({
              name: 'security',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
        }
        throw new Error('File not found')
      })
      vi.mocked(stat).mockResolvedValue({
        birthtime: new Date('2025-01-01'),
        mtime: new Date('2025-01-15'),
      } as any)

      const result = await caller.list()

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('engineering')
      expect(result[1].name).toBe('security')
      expect(result[0].settings.model).toBe('claude-sonnet-4-5-20250929')
      expect(result[0].settings.thinkingEnabled).toBe(true)
    })

    it('should handle profile load errors gracefully', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readdir).mockResolvedValue([
        { name: 'broken-profile', isDirectory: () => true, isFile: () => false },
      ] as any)
      vi.mocked(stat).mockRejectedValue(new Error('Stat failed'))

      const result = await caller.list()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // GET PROFILE PROCEDURE
  // ===========================================================================
  describe('get', () => {
    it('should return null for non-existent profile', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.get({ id: 'nonexistent' })

      expect(result).toBeNull()
    })

    it('should return profile with all details', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({ model: 'claude-opus-4-5-20251101' })
        }
        if (typeof path === 'string' && path.includes('CLAUDE.md')) {
          return '# My Profile'
        }
        if (typeof path === 'string' && path.includes('metadata.json')) {
          return JSON.stringify({
            name: 'my-profile',
            description: 'My test profile',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        }
        throw new Error('Not found')
      })
      vi.mocked(stat).mockResolvedValue({
        birthtime: new Date('2025-01-01'),
        mtime: new Date('2025-01-10'),
      } as any)

      const result = await caller.get({ id: 'my-profile' })

      expect(result).not.toBeNull()
      expect(result?.id).toBe('my-profile')
      expect(result?.settings.model).toBe('claude-opus-4-5-20251101')
      expect(result?.claudeMd).toBe('# My Profile')
    })

    it('should reject invalid profile ID format', async () => {
      await expect(caller.get({ id: 'invalid/path' })).rejects.toThrow()
      await expect(caller.get({ id: 'invalid path' })).rejects.toThrow()
      await expect(caller.get({ id: '' })).rejects.toThrow()
    })

    it('should accept valid profile ID formats', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      // Should not throw even if profile doesn't exist
      const result1 = await caller.get({ id: 'valid-profile' })
      const result2 = await caller.get({ id: 'valid.profile' })
      const result3 = await caller.get({ id: 'valid_profile' })

      expect(result1).toBeNull()
      expect(result2).toBeNull()
      expect(result3).toBeNull()
    })
  })

  // ===========================================================================
  // CREATE PROFILE PROCEDURE
  // ===========================================================================
  describe('create', () => {
    it('should create a new profile', async () => {
      // First call checks PROFILES_DIR exists, subsequent calls check profile dir doesn't exist
      let callCount = 0
      vi.mocked(access).mockImplementation(async (_path) => {
        callCount++
        // First call is for profiles dir (should exist)
        if (callCount === 1) {
          return undefined
        }
        // Second call is for the profile directory (should NOT exist)
        throw new Error('ENOENT')
      })
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.create({
        name: 'My New Profile',
        description: 'A test profile',
        settings: { model: 'claude-sonnet-4-5-20250929' },
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('My New Profile')
      expect(result?.id).toBe('my-new-profile')
      expect(result?.settings?.model).toBe('claude-sonnet-4-5-20250929')
      // Should have created directory and written files
      expect(mkdir).toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalled()
    })

    it('should return null if profile already exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined) // File exists
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const result = await caller.create({ name: 'Existing Profile' })

      expect(result).toBeNull()
    })

    it('should sanitize profile name for ID', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.create({
        name: '  My  Complex@#$%  Profile  Name  ',
      })

      expect(result?.id).toMatch(/^[a-z0-9-]+$/)
    })

    it('should reject profile name exceeding 50 characters', async () => {
      const longName = 'a'.repeat(51)
      await expect(caller.create({ name: longName })).rejects.toThrow()
    })

    it('should reject empty profile name', async () => {
      await expect(caller.create({ name: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // UPDATE PROFILE PROCEDURE
  // ===========================================================================
  describe('update', () => {
    it('should update existing profile', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      const originalCreatedAt = Date.now() - 1000000
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('metadata.json')) {
          return JSON.stringify({
            name: 'My Profile',
            createdAt: originalCreatedAt,
            updatedAt: Date.now() - 500000,
          })
        }
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({ model: 'claude-sonnet-4-5-20250929' })
        }
        throw new Error('File not found')
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await caller.update({
        id: 'my-profile',
        updates: { name: 'Updated Profile Name' },
      })

      expect(result).toBe(true)
      // Should have written to metadata.json
      expect(writeFile).toHaveBeenCalled()
    })

    it('should return false for non-existent profile', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.update({
        id: 'nonexistent',
        updates: { name: 'Test' },
      })

      expect(result).toBe(false)
    })

    it('should preserve createdAt timestamp', async () => {
      const originalCreatedAt = Date.now() - 1000000
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('metadata.json')) {
          return JSON.stringify({
            name: 'My Profile',
            createdAt: originalCreatedAt,
            updatedAt: Date.now() - 500000,
          })
        }
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({ model: 'claude-sonnet-4-5-20250929' })
        }
        throw new Error('File not found')
      })
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await caller.update({
        id: 'my-profile',
        updates: { description: 'New description' },
      })

      // Find the metadata.json write call and verify createdAt is preserved
      const metadataWriteCall = vi
        .mocked(writeFile)
        .mock.calls.find(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes('metadata.json')
        )
      expect(metadataWriteCall).toBeDefined()
      const written = JSON.parse(metadataWriteCall![1] as string)
      expect(written.createdAt).toBe(originalCreatedAt)
    })
  })

  // ===========================================================================
  // DELETE PROFILE PROCEDURE
  // ===========================================================================
  describe('delete', () => {
    it('should delete existing profile', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(rm).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('') // For active profile check

      const result = await caller.delete({ id: 'my-profile' })

      expect(result).toBe(true)
      expect(rm).toHaveBeenCalled()
    })

    it('should return false for non-existent profile', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.delete({ id: 'nonexistent' })

      expect(result).toBe(false)
    })

    it('should clear active profile if deleting active one', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('my-profile') // This is the active profile
      vi.mocked(rm).mockResolvedValue(undefined)
      vi.mocked(unlink).mockResolvedValue(undefined)

      await caller.delete({ id: 'my-profile' })

      // Should have called rm once for profile directory and unlink for active-profile file
      expect(rm).toHaveBeenCalledTimes(1)
      expect(unlink).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // ACTIVATE PROFILE PROCEDURE
  // ===========================================================================
  describe('activate', () => {
    it('should activate a profile', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('settings.json')) {
          return JSON.stringify({ model: 'claude-opus-4-5-20251101' })
        }
        if (typeof path === 'string' && path.includes('CLAUDE.md')) {
          return '# Profile instructions'
        }
        if (typeof path === 'string' && path.includes('metadata.json')) {
          return JSON.stringify({
            name: 'my-profile',
            description: 'Test profile',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        }
        return ''
      })
      vi.mocked(stat).mockResolvedValue({
        birthtime: new Date(),
        mtime: new Date(),
      } as any)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdir).mockResolvedValue([])

      const result = await caller.activate({ id: 'my-profile' })

      expect(result).toBe(true)
    })

    it('should return false for non-existent profile', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.activate({ id: 'nonexistent' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // GET ACTIVE PROCEDURE
  // ===========================================================================
  describe('getActive', () => {
    it('should return null when no active profile', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.getActive()

      expect(result).toBeNull()
    })

    it('should return active profile ID', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('engineering')

      const result = await caller.getActive()

      expect(result).toBe('engineering')
    })

    it('should trim whitespace from profile ID', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue('  my-profile  \n')

      const result = await caller.getActive()

      expect(result).toBe('my-profile')
    })
  })

  // ===========================================================================
  // LAUNCH PROFILE PROCEDURE
  // ===========================================================================
  describe('launch', () => {
    it('should return error for non-existent profile', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await caller.launch({ id: 'nonexistent' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Profile not found')
    })

    it('should launch profile with custom launcher script', async () => {
      // Profile exists
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ model: 'claude-opus' }))
      vi.mocked(stat).mockResolvedValue({
        birthtime: new Date(),
        mtime: new Date(),
      } as any)
      vi.mocked(existsSync).mockReturnValue(false)

      const mockSpawn = vi.mocked(spawn)
      mockSpawn.mockReturnValue({
        unref: vi.fn(),
      } as any)

      const result = await caller.launch({ id: 'engineering' })

      expect(result.success).toBe(true)
      expect(spawn).toHaveBeenCalled()
    })

    it('should pass project path to launcher', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ model: 'test' }))
      vi.mocked(stat).mockResolvedValue({
        birthtime: new Date(),
        mtime: new Date(),
      } as any)
      vi.mocked(existsSync).mockReturnValue(false)

      const mockSpawn = vi.mocked(spawn)
      mockSpawn.mockReturnValue({
        unref: vi.fn(),
      } as any)

      await caller.launch({ id: 'test', projectPath: '/path/to/project' })

      const spawnCall = mockSpawn.mock.calls[0]
      expect(spawnCall[1]).toContain('/path/to/project')
    })

    it('should handle spawn errors', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ model: 'test' }))
      vi.mocked(stat).mockResolvedValue({
        birthtime: new Date(),
        mtime: new Date(),
      } as any)
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error('Spawn failed')
      })

      const result = await caller.launch({ id: 'test' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Spawn failed')
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should reject path traversal in profile ID', async () => {
      const maliciousIds = ['../../../etc/passwd', '..\\..\\windows\\system32', 'profile/../secret']

      for (const id of maliciousIds) {
        await expect(caller.get({ id })).rejects.toThrow()
      }
    })

    it('should reject shell metacharacters in profile ID', async () => {
      const maliciousIds = [
        'profile; rm -rf /',
        'profile | cat /etc/passwd',
        'profile`whoami`',
        'profile$(id)',
      ]

      for (const id of maliciousIds) {
        await expect(caller.get({ id })).rejects.toThrow()
      }
    })

    it('should accept only alphanumeric, dots, dashes, and underscores in profile ID', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      // These should not throw validation errors (but may return null if not found)
      await expect(caller.get({ id: 'valid-profile' })).resolves.toBeNull()
      await expect(caller.get({ id: 'valid.profile' })).resolves.toBeNull()
      await expect(caller.get({ id: 'valid_profile' })).resolves.toBeNull()
      await expect(caller.get({ id: 'Valid123' })).resolves.toBeNull()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent settings operations', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const results = await Promise.all([
        caller.saveSettings({ model: 'model1' }),
        caller.saveSettings({ model: 'model2' }),
        caller.saveSettings({ model: 'model3' }),
      ])

      expect(results.every((r) => r === true)).toBe(true)
    })

    it('should handle unicode in CLAUDE.md content', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const unicodeContent =
        '# Instructions\n\nUse emojis: \u{1F680}\u{1F4BB}\u{2728}\nChinese: \u4F60\u597D'
      const result = await caller.saveClaudemd({ content: unicodeContent })

      expect(result).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(expect.any(String), unicodeContent)
    })

    it('should handle very long CLAUDE.md content', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const longContent = 'x'.repeat(100000)
      const result = await caller.saveClaudemd({ content: longContent })

      expect(result).toBe(true)
    })
  })
})
