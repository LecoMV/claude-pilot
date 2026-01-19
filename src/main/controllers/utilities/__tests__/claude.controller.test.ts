/**
 * Claude Controller Tests
 *
 * Comprehensive tests for the Claude Code tRPC controller.
 * Tests binary resolution, version checking, project listing, and path validation.
 *
 * Procedures tested:
 * - ping
 * - version
 * - projects
 * - status
 * - testBinary
 * - testProjectsPath
 *
 * @module claude.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { claudeRouter } from '../claude.controller'
import * as spawnAsyncModule from '../../../utils/spawn-async'
import * as fs from 'fs'

// Mock the spawn-async utility
vi.mock('../../../utils/spawn-async', () => ({
  spawnAsync: vi.fn(),
}))

// Mock fs module - define mocks inline to avoid hoisting issues
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    promises: {
      access: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      constants: { X_OK: 1, R_OK: 4, W_OK: 2 },
    },
  }
})

// Get access to the mock functions after import
import { promises as fsPromisesMocked } from 'fs'
const fsPromises = {
  get access() { return vi.mocked(fsPromisesMocked.access) },
  get stat() { return vi.mocked(fsPromisesMocked.stat) },
  get readdir() { return vi.mocked(fsPromisesMocked.readdir) },
}

// Mock path module partially
vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return {
    ...actual,
    join: (...args: string[]) => args.join('/'),
    basename: (p: string) => p.split('/').pop() || p,
  }
})

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

// Create a test caller
const createTestCaller = () => claudeRouter.createCaller({})

describe('claude.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // PING PROCEDURE
  // ===========================================================================
  describe('ping', () => {
    it('should return pong', async () => {
      const result = await caller.ping()

      expect(result).toBe('pong')
    })

    it('should always return consistent response', async () => {
      const result1 = await caller.ping()
      const result2 = await caller.ping()
      const result3 = await caller.ping()

      expect(result1).toBe('pong')
      expect(result2).toBe('pong')
      expect(result3).toBe('pong')
    })
  })

  // ===========================================================================
  // VERSION PROCEDURE
  // ===========================================================================
  describe('version', () => {
    it('should return version when Claude is found in PATH', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude') // which claude
        .mockResolvedValueOnce('1.0.0') // claude --version

      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = await caller.version()

      expect(result).toBe('1.0.0')
    })

    it('should return not installed when Claude is not found', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      vi.mocked(fs.existsSync).mockReturnValue(false)
      fsPromises.access.mockRejectedValue(new Error('not found'))

      const result = await caller.version()

      expect(result).toBe('not installed')
    })

    it('should return unknown when version check fails', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude') // which claude
        .mockRejectedValueOnce(new Error('version error')) // claude --version

      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = await caller.version()

      expect(result).toBe('unknown')
    })

    it('should trim whitespace from version output', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude\n') // which claude
        .mockResolvedValueOnce('  1.2.3\n\n') // claude --version

      const result = await caller.version()

      expect(result).toBe('1.2.3')
    })

    it('should check user-configured path first', async () => {
      // Mock settings file with configured path
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.includes('settings.json')) return true
        if (pathStr.includes('/custom/bin/claude')) return true
        return false
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ claude: { binaryPath: '/custom/bin/claude' } })
      )

      fsPromises.access.mockResolvedValue(undefined)
      vi.mocked(spawnAsyncModule.spawnAsync).mockResolvedValue('2.0.0')

      const result = await caller.version()

      expect(result).toBe('2.0.0')
    })

    it('should fall back to PATH when configured path is invalid', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.includes('settings.json')) return true
        if (pathStr.includes('/usr/local/bin/claude')) return true
        return false
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ claude: { binaryPath: '/invalid/path/claude' } })
      )

      // Configured path fails
      fsPromises.access.mockRejectedValueOnce(
        new Error('not executable')
      )

      // Fall back to which
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude')
        .mockResolvedValueOnce('1.0.0')

      const result = await caller.version()

      expect(result).toBe('1.0.0')
    })

    it('should check standard installation paths', async () => {
      // which fails
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValueOnce(
        new Error('which failed')
      )

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr === '/home/testuser/.local/bin/claude'
      })

      fsPromises.access.mockImplementation(async (p) => {
        const pathStr = String(p)
        if (pathStr === '/home/testuser/.local/bin/claude') return
        throw new Error('not found')
      })

      // Version check succeeds
      vi.mocked(spawnAsyncModule.spawnAsync).mockResolvedValueOnce('1.5.0')

      const result = await caller.version()

      expect(result).toBe('1.5.0')
    })
  })

  // ===========================================================================
  // PROJECTS PROCEDURE
  // ===========================================================================
  describe('projects', () => {
    it('should return empty array when projects directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await caller.projects()

      expect(result).toEqual([])
    })

    it('should return list of projects', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr.includes('projects')
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects')) {
          return [
            { name: 'project1', isDirectory: () => true } as fs.Dirent,
            { name: 'project2', isDirectory: () => true } as fs.Dirent,
            { name: 'file.txt', isDirectory: () => false } as fs.Dirent,
          ]
        }
        // Session files in project directories
        return ['session1.jsonl', 'session2.jsonl']
      })

      const result = await caller.projects()

      expect(result).toHaveLength(2)
      expect(result.some((p) => p.name === 'project1')).toBe(true)
      expect(result.some((p) => p.name === 'project2')).toBe(true)
    })

    it('should count session files per project', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'myproject', isDirectory: () => true } as fs.Dirent]
        }
        // Session files for project subdirectories
        return ['session1.jsonl', 'session2.jsonl', 'session3.jsonl']
      })

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].sessionCount).toBe(3)
    })

    it('should detect CLAUDE.md in project root', async () => {
      // The controller checks: 1) projects dir, 2) decoded path exists, 3) CLAUDE.md exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        // Allow projects dir
        if (pathStr.endsWith('projects')) return true
        // Allow the decoded project path itself (e.g. /home/testuser/myproject)
        if (pathStr.includes('testuser') && pathStr.endsWith('myproject')) return true
        // Allow CLAUDE.md in root
        if (pathStr.endsWith('CLAUDE.md')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const _dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (_dirPathStr.endsWith('projects') && withFileTypes) {
          // Use a path that will decode to /home/testuser/myproject
          return [{ name: 'myproject', isDirectory: () => true } as fs.Dirent]
        }
        return []
      })

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].hasCLAUDEMD).toBe(true)
    })

    it('should detect CLAUDE.md in .claude subdirectory', async () => {
      // The controller checks: 1) projects dir, 2) decoded path exists, 3) .claude/CLAUDE.md exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        // Allow projects dir
        if (pathStr.endsWith('projects')) return true
        // Allow the decoded project path
        if (pathStr.includes('testuser') && pathStr.endsWith('myproject')) return true
        // Allow .claude/CLAUDE.md
        if (pathStr.includes('.claude') && pathStr.endsWith('CLAUDE.md')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'myproject', isDirectory: () => true } as fs.Dirent]
        }
        return []
      })

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].hasCLAUDEMD).toBe(true)
    })

    it('should detect .beads directory', async () => {
      // The controller checks: 1) projects dir, 2) decoded path exists, 3) .beads exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        // Allow projects dir
        if (pathStr.endsWith('projects')) return true
        // Allow the decoded project path
        if (pathStr.includes('testuser') && pathStr.endsWith('myproject')) return true
        // Allow .beads
        if (pathStr.endsWith('.beads')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'myproject', isDirectory: () => true } as fs.Dirent]
        }
        return []
      })

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].hasBeads).toBe(true)
    })

    it('should decode project path from project_config.json', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.endsWith('projects')) return true
        if (pathStr.includes('project_config.json')) return true
        if (pathStr === '/real/project/path') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'encoded-name', isDirectory: () => true } as fs.Dirent]
        }
        return []
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ path: '/real/project/path' })
      )

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('/real/project/path')
    })

    it('should decode project path from sessions-index.json', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.endsWith('projects')) return true
        if (pathStr.includes('sessions-index.json')) return true
        if (pathStr === '/indexed/project') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'enc-name', isDirectory: () => true } as fs.Dirent]
        }
        return []
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ projectPath: '/indexed/project' })
      )

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('/indexed/project')
    })

    it('should decode project path from session file cwd', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.endsWith('projects')) return true
        if (pathStr === '/session/cwd/path') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'proj-name', isDirectory: () => true } as fs.Dirent]
        }
        return ['session.jsonl']
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        '{"cwd":"/session/cwd/path","type":"message"}'
      )

      const result = await caller.projects()

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('/session/cwd/path')
    })

    it('should handle user-configured projects path', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.includes('settings.json')) return true
        if (pathStr === '/custom/projects') return true
        return false
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ claude: { projectsPath: '/custom/projects' } })
      )

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const _dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (withFileTypes) {
          return [{ name: 'customproj', isDirectory: () => true } as fs.Dirent]
        }
        return []
      })

      const _result = await caller.projects()

      // Should use the custom path
      expect(fs.readdirSync).toHaveBeenCalledWith('/custom/projects', expect.any(Object))
    })

    it('should handle unreadable project directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'proj', isDirectory: () => true } as fs.Dirent]
        }
        throw new Error('Permission denied')
      })

      const result = await caller.projects()

      // Should have project but with 0 session count
      expect(result).toHaveLength(1)
      expect(result[0].sessionCount).toBe(0)
    })
  })

  // ===========================================================================
  // STATUS PROCEDURE
  // ===========================================================================
  describe('status', () => {
    it('should return comprehensive status when Claude is installed', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude')
        .mockResolvedValueOnce('1.0.0')

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return (
          pathStr.includes('projects') ||
          pathStr === '/usr/local/bin/claude'
        )
      })

      fsPromises.access.mockResolvedValue(undefined)

      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'proj1', isDirectory: () => true } as fs.Dirent,
        { name: 'proj2', isDirectory: () => true } as fs.Dirent,
      ])

      const result = await caller.status()

      expect(result.installed).toBe(true)
      expect(result.version).toBe('1.0.0')
      expect(result.binaryPath).toBe('/usr/local/bin/claude')
      expect(result.projectCount).toBe(2)
      expect(result.error).toBeUndefined()
    })

    it('should return not installed status when Claude is not found', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      vi.mocked(fs.existsSync).mockReturnValue(false)
      fsPromises.access.mockRejectedValue(new Error('not found'))

      const result = await caller.status()

      expect(result.installed).toBe(false)
      expect(result.version).toBeUndefined()
      expect(result.binaryPath).toBeUndefined()
      expect(result.error).toBe('Claude Code binary not found')
    })

    it('should return projects directory path', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      vi.mocked(fs.existsSync).mockReturnValue(false)
      fsPromises.access.mockRejectedValue(new Error('not found'))

      const result = await caller.status()

      expect(result.projectsPath).toBe(
        '/home/testuser/.claude/projects'
      )
    })

    it('should return custom projects path from settings', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr.includes('settings.json')
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ claude: { projectsPath: '/custom/claude/projects' } })
      )

      fsPromises.access.mockRejectedValue(new Error('not found'))

      const result = await caller.status()

      expect(result.projectsPath).toBe('/custom/claude/projects')
    })

    it('should handle zero projects', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude')
        .mockResolvedValueOnce('1.0.0')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      fsPromises.access.mockResolvedValue(undefined)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      const result = await caller.status()

      expect(result.projectCount).toBe(0)
    })

    it('should exclude files from project count', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude')
        .mockResolvedValueOnce('1.0.0')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      fsPromises.access.mockResolvedValue(undefined)

      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'proj1', isDirectory: () => true } as fs.Dirent,
        { name: 'file.txt', isDirectory: () => false } as fs.Dirent,
        { name: '.gitignore', isDirectory: () => false } as fs.Dirent,
      ])

      const result = await caller.status()

      expect(result.projectCount).toBe(1)
    })
  })

  // ===========================================================================
  // TEST BINARY PROCEDURE
  // ===========================================================================
  describe('testBinary', () => {
    it('should return valid true when binary exists and is executable', async () => {
      fsPromises.access.mockResolvedValue(undefined)
      vi.mocked(spawnAsyncModule.spawnAsync).mockResolvedValue('1.5.0')

      const result = await caller.testBinary('/usr/local/bin/claude')

      expect(result.valid).toBe(true)
      expect(result.version).toBe('1.5.0')
      expect(result.error).toBeUndefined()
    })

    it('should return valid false when binary does not exist', async () => {
      fsPromises.access.mockRejectedValue(new Error('ENOENT: no such file'))

      const result = await caller.testBinary('/nonexistent/claude')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('ENOENT')
    })

    it('should return valid false when binary is not executable', async () => {
      fsPromises.access.mockRejectedValue(new Error('EACCES: permission denied'))

      const result = await caller.testBinary('/path/to/claude')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('EACCES')
    })

    it('should return valid false when version command fails', async () => {
      fsPromises.access.mockResolvedValue(undefined)
      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('Command failed')
      )

      const result = await caller.testBinary('/usr/local/bin/claude')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Command failed')
    })

    it('should reject non-string input', async () => {
      await expect(
        // @ts-expect-error Testing invalid input
        caller.testBinary(123)
      ).rejects.toThrow('path must be a string')
    })

    it('should trim version output', async () => {
      fsPromises.access.mockResolvedValue(undefined)
      vi.mocked(spawnAsyncModule.spawnAsync).mockResolvedValue('  2.0.0-beta\n')

      const result = await caller.testBinary('/usr/local/bin/claude')

      // The test depends on fs.promises.access working correctly
      // If it resolves, then spawnAsync for version is called
      expect(result.valid).toBe(true)
      expect(result.version).toBe('2.0.0-beta')
    })
  })

  // ===========================================================================
  // TEST PROJECTS PATH PROCEDURE
  // ===========================================================================
  describe('testProjectsPath', () => {
    it('should return valid true for existing directory', async () => {
      fsPromises.stat.mockResolvedValue({
        isDirectory: () => true,
      } as fs.Stats)

      fsPromises.readdir.mockResolvedValue([
        { name: 'proj1', isDirectory: () => true } as fs.Dirent,
        { name: 'proj2', isDirectory: () => true } as fs.Dirent,
      ])

      const result = await caller.testProjectsPath('/home/user/.claude/projects')

      expect(result.valid).toBe(true)
      expect(result.projectCount).toBe(2)
      expect(result.error).toBeUndefined()
    })

    it('should return valid false for non-existent path', async () => {
      fsPromises.stat.mockRejectedValue(new Error('ENOENT: no such file'))

      const result = await caller.testProjectsPath('/nonexistent/path')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('ENOENT')
    })

    it('should return valid false for file (not directory)', async () => {
      fsPromises.stat.mockResolvedValue({
        isDirectory: () => false,
      } as fs.Stats)

      const result = await caller.testProjectsPath('/path/to/file.txt')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Path is not a directory')
    })

    it('should count only directories as projects', async () => {
      fsPromises.stat.mockResolvedValue({
        isDirectory: () => true,
      } as fs.Stats)

      fsPromises.readdir.mockResolvedValue([
        { name: 'proj1', isDirectory: () => true } as fs.Dirent,
        { name: 'file.txt', isDirectory: () => false } as fs.Dirent,
        { name: 'proj2', isDirectory: () => true } as fs.Dirent,
        { name: '.gitignore', isDirectory: () => false } as fs.Dirent,
      ])

      const result = await caller.testProjectsPath('/home/user/.claude/projects')

      expect(result.valid).toBe(true)
      expect(result.projectCount).toBe(2)
    })

    it('should return zero projects for empty directory', async () => {
      fsPromises.stat.mockResolvedValue({
        isDirectory: () => true,
      } as fs.Stats)

      fsPromises.readdir.mockResolvedValue([])

      const result = await caller.testProjectsPath('/empty/projects')

      expect(result.valid).toBe(true)
      expect(result.projectCount).toBe(0)
    })

    it('should reject non-string input', async () => {
      await expect(
        // @ts-expect-error Testing invalid input
        caller.testProjectsPath(123)
      ).rejects.toThrow('path must be a string')
    })

    it('should handle permission denied error', async () => {
      fsPromises.stat.mockRejectedValue(new Error('EACCES: permission denied'))

      const result = await caller.testProjectsPath('/protected/path')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('EACCES')
    })
  })

  // ===========================================================================
  // BINARY RESOLUTION TESTS
  // ===========================================================================
  describe('binary resolution', () => {
    it('should prefer configured path over PATH', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr.includes('settings.json') || pathStr.includes('/custom')
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ claude: { binaryPath: '/custom/claude' } })
      )

      // Mock fs.promises.access to succeed for the custom path
      fsPromises.access.mockResolvedValue(undefined)
      // Mock spawnAsync for version check
      vi.mocked(spawnAsyncModule.spawnAsync).mockResolvedValue('custom-1.0.0')

      const result = await caller.status()

      // Since configured path is checked first and succeeds, it should be used
      expect(result.installed).toBe(true)
      expect(result.binaryPath).toBe('/custom/claude')
      expect(result.version).toBe('custom-1.0.0')
    })

    it('should check ~/.local/bin/claude when which fails', async () => {
      // No settings file
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        // Return true for the .local/bin/claude path
        return pathStr === '/home/testuser/.local/bin/claude'
      })

      // which fails
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockRejectedValueOnce(new Error('which failed'))
        .mockResolvedValueOnce('1.0.0') // version check

      // fs.promises.access succeeds only for .local/bin/claude
      fsPromises.access.mockImplementation(async (p) => {
        const pathStr = String(p)
        if (pathStr === '/home/testuser/.local/bin/claude') return
        throw new Error('not found')
      })

      const result = await caller.status()

      expect(result.installed).toBe(true)
      expect(result.binaryPath).toBe('/home/testuser/.local/bin/claude')
    })

    it('should check /usr/local/bin/claude when which and .local fail', async () => {
      // No settings file
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr === '/usr/local/bin/claude'
      })

      // which fails
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockRejectedValueOnce(new Error('which failed'))
        .mockResolvedValueOnce('1.0.0') // version check

      // fs.promises.access succeeds only for /usr/local/bin/claude
      fsPromises.access.mockImplementation(async (p) => {
        const pathStr = String(p)
        if (pathStr === '/usr/local/bin/claude') return
        throw new Error('not found')
      })

      const result = await caller.status()

      expect(result.installed).toBe(true)
      expect(result.binaryPath).toBe('/usr/local/bin/claude')
    })
  })

  // ===========================================================================
  // PROJECT PATH DECODING TESTS
  // ===========================================================================
  describe('project path decoding', () => {
    it('should decode absolute path starting with dash', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.includes('projects')) return true
        if (pathStr === '/home/user/projects/myapp') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects') && !dirPathStr.includes('-home')) {
          return [
            { name: '-home-user-projects-myapp', isDirectory: () => true } as fs.Dirent,
          ]
        }
        return []
      })

      const result = await caller.projects()

      expect(result[0].path).toBe('/home/user/projects/myapp')
    })

    it('should decode home-relative paths', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.includes('projects')) return true
        if (pathStr === '/home/testuser/projects/myapp') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        const dirPathStr = String(dirPath)
        if (dirPathStr.includes('projects') && !dirPathStr.includes('proj-')) {
          return [
            { name: 'projects-myapp', isDirectory: () => true } as fs.Dirent,
          ]
        }
        return []
      })

      const result = await caller.projects()

      expect(result[0].path).toBe('/home/testuser/projects/myapp')
    })

    it('should handle invalid JSON in project config', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.endsWith('projects')) return true
        if (pathStr.includes('project_config.json')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'proj', isDirectory: () => true } as fs.Dirent]
        }
        // Return empty for session files listing
        return []
      })

      vi.mocked(fs.readFileSync).mockReturnValue('invalid json {')

      // Should not throw - project should still be listed with fallback path
      const result = await caller.projects()
      expect(result).toHaveLength(1)
    })

    it('should handle read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        if (pathStr.endsWith('projects')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((dirPath, options) => {
        const dirPathStr = String(dirPath)
        const withFileTypes = options && typeof options === 'object' && (options as { withFileTypes?: boolean }).withFileTypes
        if (dirPathStr.endsWith('projects') && withFileTypes) {
          return [{ name: 'proj', isDirectory: () => true } as fs.Dirent]
        }
        // Return empty for session files listing
        return []
      })

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      // Should not throw - project should still be listed with fallback path
      const result = await caller.projects()
      expect(result).toHaveLength(1)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle settings file with empty claude section', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr.includes('settings.json')
      })

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ claude: {} }))

      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      fsPromises.access.mockRejectedValue(new Error('not found'))

      // Should not throw
      const result = await caller.status()
      expect(result.installed).toBe(false)
    })

    it('should handle settings file without claude section', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr.includes('settings.json')
      })

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ theme: 'dark' })
      )

      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      fsPromises.access.mockRejectedValue(new Error('not found'))

      // Should not throw
      const result = await caller.status()
      expect(result.installed).toBe(false)
    })

    it('should handle corrupted settings file', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p)
        return pathStr.includes('settings.json')
      })

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Corrupted file')
      })

      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      fsPromises.access.mockRejectedValue(new Error('not found'))

      // Should not throw and use defaults
      const result = await caller.status()
      expect(result.installed).toBe(false)
    })

    it('should handle readdirSync throwing error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      vi.mocked(spawnAsyncModule.spawnAsync).mockRejectedValue(
        new Error('not found')
      )
      fsPromises.access.mockRejectedValue(new Error('not found'))

      // status should still work
      const result = await caller.status()
      expect(result.projectCount).toBe(0)
    })

    it('should handle timeout in version check', async () => {
      vi.mocked(spawnAsyncModule.spawnAsync)
        .mockResolvedValueOnce('/usr/local/bin/claude')
        .mockRejectedValueOnce(new Error('Timeout'))

      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = await caller.version()

      expect(result).toBe('unknown')
    })
  })
})
