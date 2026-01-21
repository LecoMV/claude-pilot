/**
 * Beads Controller Tests
 *
 * Comprehensive tests for the beads tRPC controller.
 * Tests all 9 procedures: list, get, stats, create, update, close, ready, blocked, hasBeads
 *
 * @module beads.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { beadsRouter } from '../beads.controller'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import { join } from 'path'

// Use home directory for test paths (allowed by path security)
const TEST_PROJECT_PATH = join(homedir(), 'test-project')

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock fs - include realpathSync for path validation
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  realpathSync: vi.fn((path: string) => path), // Return path as-is for mocking
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => beadsRouter.createCaller({})

// Helper to create a mock process
function createMockProcess(
  stdout = '',
  stderr = '',
  exitCode = 0
): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const mockProcess = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  mockProcess.stdout = new EventEmitter()
  mockProcess.stderr = new EventEmitter()

  // Simulate async process execution
  setImmediate(() => {
    if (stdout) {
      mockProcess.stdout.emit('data', stdout)
    }
    if (stderr) {
      mockProcess.stderr.emit('data', stderr)
    }
    mockProcess.emit('close', exitCode)
  })

  return mockProcess
}

describe('beads.controller', () => {
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
    it('should return empty array when bd command fails', async () => {
      const mockProcess = createMockProcess('', 'bd: command not found', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({})

      expect(result).toEqual([])
    })

    it('should parse beads from bd list output', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Fix authentication bug
deploy-cd34 [P2] [feature] in_progress - Add dark mode
deploy-ef56 [P0] [bug] closed - Critical security fix`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({})

      expect(result).toHaveLength(3)
      expect(result[0]).toMatchObject({
        id: 'deploy-ab12',
        priority: 1,
        type: 'task',
        status: 'open',
        title: 'Fix authentication bug',
      })
      expect(result[1]).toMatchObject({
        id: 'deploy-cd34',
        priority: 2,
        type: 'feature',
        status: 'in_progress',
      })
      expect(result[2]).toMatchObject({
        id: 'deploy-ef56',
        priority: 0,
        type: 'bug',
        status: 'closed',
      })
    })

    it('should filter by status', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Task 1`
      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      await caller.list({ filter: { status: 'open' } })

      expect(spawn).toHaveBeenCalledWith('bd', ['list', '--status=open'], expect.any(Object))
    })

    it('should filter by priority client-side', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - High priority task
deploy-cd34 [P3] [task] open - Low priority task`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({ filter: { priority: 1 } })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('deploy-ab12')
    })

    it('should filter by type client-side', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - A task
deploy-cd34 [P2] [bug] open - A bug`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({ filter: { type: 'bug' } })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('deploy-cd34')
    })

    it('should filter by search term', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Fix authentication
deploy-cd34 [P2] [task] open - Add feature`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({ filter: { search: 'auth' } })

      expect(result).toHaveLength(1)
      expect(result[0].title).toContain('authentication')
    })

    it('should apply limit filter', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Task 1
deploy-cd34 [P2] [task] open - Task 2
deploy-ef56 [P3] [task] open - Task 3`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({ filter: { limit: 2 } })

      expect(result).toHaveLength(2)
    })

    it('should accept status: all', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Task 1`
      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      await caller.list({ filter: { status: 'all' } })

      // Should NOT add --status flag when status is 'all'
      expect(spawn).toHaveBeenCalledWith('bd', ['list'], expect.any(Object))
    })

    it('should skip unparseable lines', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Valid task
Invalid line that doesn't match pattern
deploy-cd34 [P2] [task] open - Another task`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({})

      expect(result).toHaveLength(2)
    })
  })

  // ===========================================================================
  // GET PROCEDURE
  // ===========================================================================
  describe('get', () => {
    it('should reject empty bead ID', async () => {
      await expect(caller.get({ id: '' })).rejects.toThrow()
    })

    it('should reject invalid bead ID format', async () => {
      await expect(caller.get({ id: '../etc/passwd' })).rejects.toThrow()
      await expect(caller.get({ id: 'bead@invalid' })).rejects.toThrow()
      await expect(caller.get({ id: 'bead with space' })).rejects.toThrow()
    })

    it('should accept valid bead ID formats', async () => {
      // Create a new mock process for each call
      vi.mocked(spawn).mockImplementation(() => {
        return createMockProcess('') as never
      })

      // These should not throw
      await caller.get({ id: 'deploy-ab12' })
      await caller.get({ id: 'bead_123' })
      await caller.get({ id: 'bead.name.test' })
    })

    it('should return null when bead not found', async () => {
      const mockProcess = createMockProcess('', 'Bead not found', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.get({ id: 'nonexistent-bead' })

      expect(result).toBeNull()
    })

    it('should parse bd show output correctly', async () => {
      const bdShowOutput = `deploy-ab12: Fix authentication bug
Status: in_progress
Priority: P1
Type: task
Created: 2024-01-15 10:30:00
Updated: 2024-01-16 14:00:00
Description: Need to fix the auth flow
Assignee: developer1
Blocked by: deploy-xy99
Blocks: deploy-cd34, deploy-ef56`

      const mockProcess = createMockProcess(bdShowOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.get({ id: 'deploy-ab12' })

      expect(result).toMatchObject({
        id: 'deploy-ab12',
        title: 'Fix authentication bug',
        status: 'in_progress',
        priority: 1,
        type: 'task',
        description: 'Need to fix the auth flow',
        assignee: 'developer1',
      })
      expect(result?.blockedBy).toContain('deploy-xy99')
      expect(result?.blocks).toContain('deploy-cd34')
      expect(result?.blocks).toContain('deploy-ef56')
    })

    it('should handle bead without optional fields', async () => {
      const bdShowOutput = `deploy-simple: Simple bead
Status: open
Priority: P2
Type: task
Created: 2024-01-15
Updated: 2024-01-15`

      const mockProcess = createMockProcess(bdShowOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.get({ id: 'deploy-simple' })

      expect(result).toMatchObject({
        id: 'deploy-simple',
        title: 'Simple bead',
        status: 'open',
        priority: 2,
        type: 'task',
      })
      expect(result?.description).toBeUndefined()
      expect(result?.assignee).toBeUndefined()
      expect(result?.blockedBy).toBeUndefined()
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return zeroed stats on error', async () => {
      const mockProcess = createMockProcess('', 'Error', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.stats()

      expect(result).toEqual({
        total: 0,
        open: 0,
        inProgress: 0,
        closed: 0,
        blocked: 0,
        ready: 0,
      })
    })

    it('should parse bd stats output', async () => {
      const statsOutput = `Total: 25
Open: 10
In progress: 5
Closed: 8
Blocked: 2
Ready: 6
Avg lead time: 3.5 days`

      const mockProcess = createMockProcess(statsOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.stats()

      expect(result).toMatchObject({
        total: 25,
        open: 10,
        inProgress: 5,
        closed: 8,
        blocked: 2,
        ready: 6,
        avgLeadTime: 3.5,
      })
    })
  })

  // ===========================================================================
  // CREATE PROCEDURE
  // ===========================================================================
  describe('create', () => {
    it('should reject empty title', async () => {
      await expect(
        caller.create({
          params: {
            title: '',
            type: 'task',
            priority: 2,
          },
        })
      ).rejects.toThrow()
    })

    it('should reject title exceeding 200 characters', async () => {
      await expect(
        caller.create({
          params: {
            title: 'a'.repeat(201),
            type: 'task',
            priority: 2,
          },
        })
      ).rejects.toThrow()
    })

    it('should reject invalid type', async () => {
      await expect(
        caller.create({
          params: {
            title: 'Test bead',
            type: 'invalid' as never,
            priority: 2,
          },
        })
      ).rejects.toThrow()
    })

    it('should reject invalid priority', async () => {
      await expect(
        caller.create({
          params: {
            title: 'Test bead',
            type: 'task',
            priority: 5 as never,
          },
        })
      ).rejects.toThrow()
    })

    it('should reject description exceeding 2000 characters', async () => {
      await expect(
        caller.create({
          params: {
            title: 'Test bead',
            type: 'task',
            priority: 2,
            description: 'x'.repeat(2001),
          },
        })
      ).rejects.toThrow()
    })

    it('should reject invalid assignee format', async () => {
      await expect(
        caller.create({
          params: {
            title: 'Test bead',
            type: 'task',
            priority: 2,
            assignee: 'user@invalid',
          },
        })
      ).rejects.toThrow()
    })

    it('should create bead with valid parameters', async () => {
      const createOutput = 'Created: deploy-new1'
      const showOutput = `deploy-new1: Test bead
Status: open
Priority: P2
Type: task
Created: 2024-01-15
Updated: 2024-01-15`

      let callCount = 0
      vi.mocked(spawn).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockProcess(createOutput) as never
        }
        return createMockProcess(showOutput) as never
      })

      const result = await caller.create({
        params: {
          title: 'Test bead',
          type: 'task',
          priority: 2,
        },
      })

      expect(result).not.toBeNull()
      expect(result?.id).toBe('deploy-new1')
    })

    it('should escape quotes in title', async () => {
      const createOutput = 'Created: deploy-new1'
      const showOutput = `deploy-new1: Test "quoted" bead
Status: open
Priority: P2
Type: task
Created: 2024-01-15
Updated: 2024-01-15`

      let callCount = 0
      vi.mocked(spawn).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockProcess(createOutput) as never
        }
        return createMockProcess(showOutput) as never
      })

      await caller.create({
        params: {
          title: 'Test "quoted" bead',
          type: 'task',
          priority: 2,
        },
      })

      expect(spawn).toHaveBeenCalledWith(
        'bd',
        expect.arrayContaining([expect.stringContaining('--title="Test \\"quoted\\" bead"')]),
        expect.any(Object)
      )
    })

    it('should return null when creation fails', async () => {
      const mockProcess = createMockProcess('', 'Error creating bead', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.create({
        params: {
          title: 'Test bead',
          type: 'task',
          priority: 2,
        },
      })

      expect(result).toBeNull()
    })

    it('should include optional parameters when provided', async () => {
      const createOutput = 'Created: deploy-new1'
      const showOutput = `deploy-new1: Test bead
Status: open
Priority: P1
Type: feature
Created: 2024-01-15
Updated: 2024-01-15`

      let callCount = 0
      vi.mocked(spawn).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockProcess(createOutput) as never
        }
        return createMockProcess(showOutput) as never
      })

      await caller.create({
        params: {
          title: 'Test bead',
          type: 'feature',
          priority: 1,
          description: 'A detailed description',
          assignee: 'developer1',
        },
      })

      const args = (spawn as Mock).mock.calls[0][1] as string[]
      expect(args).toContain('--type=feature')
      expect(args).toContain('--priority=1')
      expect(args).toContainEqual(expect.stringContaining('--description='))
      expect(args).toContain('--assignee=developer1')
    })
  })

  // ===========================================================================
  // UPDATE PROCEDURE
  // ===========================================================================
  describe('update', () => {
    it('should reject empty bead ID', async () => {
      await expect(
        caller.update({
          id: '',
          params: { status: 'closed' },
        })
      ).rejects.toThrow()
    })

    it('should reject invalid bead ID format', async () => {
      await expect(
        caller.update({
          id: '../../../etc/passwd',
          params: { status: 'closed' },
        })
      ).rejects.toThrow()
    })

    it('should reject invalid status', async () => {
      await expect(
        caller.update({
          id: 'deploy-ab12',
          params: { status: 'invalid' as never },
        })
      ).rejects.toThrow()
    })

    it('should update bead with valid parameters', async () => {
      const mockProcess = createMockProcess('Updated')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.update({
        id: 'deploy-ab12',
        params: { status: 'in_progress', priority: 1 },
      })

      expect(result).toBe(true)
      expect(spawn).toHaveBeenCalledWith(
        'bd',
        ['update', 'deploy-ab12', '--status=in_progress', '--priority=1'],
        expect.any(Object)
      )
    })

    it('should return false on update failure', async () => {
      const mockProcess = createMockProcess('', 'Error', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.update({
        id: 'deploy-ab12',
        params: { status: 'closed' },
      })

      expect(result).toBe(false)
    })

    it('should handle priority 0 correctly', async () => {
      const mockProcess = createMockProcess('Updated')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      await caller.update({
        id: 'deploy-ab12',
        params: { priority: 0 },
      })

      const args = (spawn as Mock).mock.calls[0][1] as string[]
      expect(args).toContain('--priority=0')
    })
  })

  // ===========================================================================
  // CLOSE PROCEDURE
  // ===========================================================================
  describe('close', () => {
    it('should reject empty bead ID', async () => {
      await expect(caller.close({ id: '' })).rejects.toThrow()
    })

    it('should reject reason exceeding 500 characters', async () => {
      await expect(
        caller.close({
          id: 'deploy-ab12',
          reason: 'x'.repeat(501),
        })
      ).rejects.toThrow()
    })

    it('should close bead without reason', async () => {
      const mockProcess = createMockProcess('Closed')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.close({ id: 'deploy-ab12' })

      expect(result).toBe(true)
      expect(spawn).toHaveBeenCalledWith('bd', ['close', 'deploy-ab12'], expect.any(Object))
    })

    it('should close bead with reason', async () => {
      const mockProcess = createMockProcess('Closed')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      await caller.close({
        id: 'deploy-ab12',
        reason: 'Fixed in commit abc123',
      })

      expect(spawn).toHaveBeenCalledWith(
        'bd',
        ['close', 'deploy-ab12', '--reason="Fixed in commit abc123"'],
        expect.any(Object)
      )
    })

    it('should escape quotes in reason', async () => {
      const mockProcess = createMockProcess('Closed')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      await caller.close({
        id: 'deploy-ab12',
        reason: 'Fixed "that" bug',
      })

      expect(spawn).toHaveBeenCalledWith(
        'bd',
        ['close', 'deploy-ab12', '--reason="Fixed \\"that\\" bug"'],
        expect.any(Object)
      )
    })

    it('should return false on close failure', async () => {
      const mockProcess = createMockProcess('', 'Error', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.close({ id: 'deploy-ab12' })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // READY PROCEDURE
  // ===========================================================================
  describe('ready', () => {
    it('should return empty array on error', async () => {
      const mockProcess = createMockProcess('', 'Error', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.ready()

      expect(result).toEqual([])
    })

    it('should return ready beads', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Ready task 1
deploy-cd34 [P2] [feature] open - Ready task 2`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.ready()

      expect(result).toHaveLength(2)
      expect(spawn).toHaveBeenCalledWith('bd', ['ready'], expect.any(Object))
    })
  })

  // ===========================================================================
  // BLOCKED PROCEDURE
  // ===========================================================================
  describe('blocked', () => {
    it('should return empty array on error', async () => {
      const mockProcess = createMockProcess('', 'Error', 1)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.blocked()

      expect(result).toEqual([])
    })

    it('should return blocked beads', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Blocked task`

      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.blocked()

      expect(result).toHaveLength(1)
      expect(spawn).toHaveBeenCalledWith('bd', ['blocked'], expect.any(Object))
    })
  })

  // ===========================================================================
  // HAS BEADS PROCEDURE
  // ===========================================================================
  describe('hasBeads', () => {
    it('should reject empty project path', async () => {
      await expect(caller.hasBeads({ projectPath: '' })).rejects.toThrow()
    })

    it('should return true when .beads directory exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const result = await caller.hasBeads({ projectPath: TEST_PROJECT_PATH })

      expect(result).toBe(true)
      expect(existsSync).toHaveBeenCalledWith(join(TEST_PROJECT_PATH, '.beads'))
    })

    it('should return false when .beads directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await caller.hasBeads({ projectPath: TEST_PROJECT_PATH })

      expect(result).toBe(false)
    })

    it('should return false on filesystem error in handler', async () => {
      // Path validation calls existsSync multiple times before the handler runs
      // We need validation to pass, then have the handler's existsSync throw
      let callCount = 0
      vi.mocked(existsSync).mockImplementation(() => {
        callCount++
        // Let validation calls pass (return true for path checks)
        // Then throw on the handler's .beads check (typically the 5th+ call)
        if (callCount <= 4) {
          return true
        }
        throw new Error('Permission denied')
      })

      const result = await caller.hasBeads({ projectPath: TEST_PROJECT_PATH })

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should reject path traversal attempts in bead ID', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'bead/../../../secret',
        'bead%00null',
      ]

      for (const id of maliciousIds) {
        await expect(caller.get({ id })).rejects.toThrow()
      }
    })

    it('should reject shell injection attempts in bead ID', async () => {
      const maliciousIds = [
        'bead; rm -rf /',
        'bead | cat /etc/passwd',
        'bead`whoami`',
        'bead$(id)',
        'bead && evil',
      ]

      for (const id of maliciousIds) {
        await expect(caller.get({ id })).rejects.toThrow()
      }
    })

    it('should spawn bd without shell to prevent injection', async () => {
      const mockProcess = createMockProcess('deploy-ab12 [P1] [task] open - Task')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      await caller.list({})

      expect(spawn).toHaveBeenCalledWith(
        'bd',
        expect.any(Array),
        expect.objectContaining({ shell: false })
      )
    })

    it('should reject invalid assignee format to prevent injection', async () => {
      const maliciousAssignees = [
        'user;rm -rf /',
        'user|cat /etc/passwd',
        'user`id`',
        'user$(whoami)',
      ]

      for (const assignee of maliciousAssignees) {
        await expect(
          caller.create({
            params: {
              title: 'Test',
              type: 'task',
              priority: 2,
              assignee,
            },
          })
        ).rejects.toThrow()
      }
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent list calls', async () => {
      const bdOutput = `deploy-ab12 [P1] [task] open - Task`
      const mockProcess = createMockProcess(bdOutput)
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const results = await Promise.all([caller.list({}), caller.list({}), caller.list({})])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(Array.isArray(result)).toBe(true)
      })
    })

    it('should handle empty bd output', async () => {
      const mockProcess = createMockProcess('')
      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({})

      expect(result).toEqual([])
    })

    it('should handle bd process error event', async () => {
      const mockProcess = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
      }
      mockProcess.stdout = new EventEmitter()
      mockProcess.stderr = new EventEmitter()

      setImmediate(() => {
        mockProcess.emit('error', new Error('spawn ENOENT'))
      })

      vi.mocked(spawn).mockReturnValue(mockProcess as never)

      const result = await caller.list({})

      expect(result).toEqual([])
    })

    it('should handle valid special characters in bead ID', async () => {
      // Create a new mock process for each call
      vi.mocked(spawn).mockImplementation(() => {
        return createMockProcess('') as never
      })

      // These are valid according to the regex pattern
      await caller.get({ id: 'bead-with-dashes' })
      await caller.get({ id: 'bead_with_underscores' })
      await caller.get({ id: 'bead.with.dots' })
      await caller.get({ id: 'BEAD123' })

      expect(spawn).toHaveBeenCalledTimes(4)
    })
  })
})
