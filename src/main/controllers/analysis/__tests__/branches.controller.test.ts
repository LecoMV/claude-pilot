/**
 * Branches Controller Tests
 *
 * Comprehensive tests for the branches tRPC controller.
 * Tests all 10 procedures: list, get, getTree, delete, rename, switch,
 * merge, abandon, stats, getActiveBranch
 *
 * @module branches.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { branchesRouter } from '../branches.controller'
import { branchService } from '../../../services/branches'
import type {
  ConversationBranch,
  BranchTree,
  BranchStats,
  BranchMergeParams,
} from '@shared/types'

// Mock the branch service
vi.mock('../../../services/branches', () => ({
  branchService: {
    list: vi.fn(),
    get: vi.fn(),
    getTree: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
    switch: vi.fn(),
    merge: vi.fn(),
    abandon: vi.fn(),
    stats: vi.fn(),
    getActiveBranch: vi.fn(),
  },
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => branchesRouter.createCaller({})

// Test data factories
const createMockBranch = (overrides: Partial<ConversationBranch> = {}): ConversationBranch => ({
  id: 'branch-123',
  name: 'feature-branch',
  sessionId: 'session-456',
  parentBranchId: 'main-branch-id',
  branchPointMessageId: 'msg-001',
  status: 'active',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [],
  ...overrides,
})

const createMockBranchTree = (): BranchTree => ({
  sessionId: 'session-456',
  mainBranchId: 'main-branch-id',
  branches: [
    createMockBranch({ id: 'main-branch-id', name: 'main', parentBranchId: null }),
    createMockBranch({ id: 'feature-1', name: 'feature-1', parentBranchId: 'main-branch-id' }),
    createMockBranch({ id: 'feature-2', name: 'feature-2', parentBranchId: 'main-branch-id' }),
  ],
})

const createMockBranchStats = (): BranchStats => ({
  totalBranches: 5,
  activeBranches: 3,
  mergedBranches: 1,
  abandonedBranches: 1,
  avgMessagesPerBranch: 10.5,
})

describe('branches.controller', () => {
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
    it('should return branches for a session', async () => {
      const mockBranches = [
        createMockBranch({ id: 'branch-1', name: 'main', parentBranchId: null }),
        createMockBranch({ id: 'branch-2', name: 'feature-1' }),
      ]
      vi.mocked(branchService.list).mockResolvedValue(mockBranches)

      const result = await caller.list({ sessionId: 'session-456' })

      expect(result).toEqual(mockBranches)
      expect(branchService.list).toHaveBeenCalledWith('session-456')
    })

    it('should return empty array when no branches exist', async () => {
      vi.mocked(branchService.list).mockResolvedValue([])

      const result = await caller.list({ sessionId: 'empty-session' })

      expect(result).toEqual([])
    })

    it('should reject empty sessionId', async () => {
      await expect(caller.list({ sessionId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.list).mockRejectedValue(new Error('Service unavailable'))

      await expect(caller.list({ sessionId: 'session-456' })).rejects.toThrow('Service unavailable')
    })
  })

  // ===========================================================================
  // GET PROCEDURE
  // ===========================================================================
  describe('get', () => {
    it('should return a branch by ID', async () => {
      const mockBranch = createMockBranch()
      vi.mocked(branchService.get).mockResolvedValue(mockBranch)

      const result = await caller.get({ branchId: 'branch-123' })

      expect(result).toEqual(mockBranch)
      expect(branchService.get).toHaveBeenCalledWith('branch-123')
    })

    it('should return null for non-existent branch', async () => {
      vi.mocked(branchService.get).mockResolvedValue(null)

      const result = await caller.get({ branchId: 'nonexistent' })

      expect(result).toBeNull()
    })

    it('should reject empty branchId', async () => {
      await expect(caller.get({ branchId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.get).mockRejectedValue(new Error('Database error'))

      await expect(caller.get({ branchId: 'branch-123' })).rejects.toThrow('Database error')
    })
  })

  // ===========================================================================
  // GET TREE PROCEDURE
  // ===========================================================================
  describe('getTree', () => {
    it('should return branch tree for a session', async () => {
      const mockTree = createMockBranchTree()
      vi.mocked(branchService.getTree).mockResolvedValue(mockTree)

      const result = await caller.getTree({ sessionId: 'session-456' })

      expect(result).toEqual(mockTree)
      expect(result?.branches).toHaveLength(3)
      expect(branchService.getTree).toHaveBeenCalledWith('session-456')
    })

    it('should return null for session without branches', async () => {
      vi.mocked(branchService.getTree).mockResolvedValue(null)

      const result = await caller.getTree({ sessionId: 'no-branches-session' })

      expect(result).toBeNull()
    })

    it('should reject empty sessionId', async () => {
      await expect(caller.getTree({ sessionId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.getTree).mockRejectedValue(new Error('Tree construction failed'))

      await expect(caller.getTree({ sessionId: 'session-456' })).rejects.toThrow(
        'Tree construction failed'
      )
    })
  })

  // ===========================================================================
  // DELETE PROCEDURE
  // ===========================================================================
  describe('delete', () => {
    it('should delete a branch successfully', async () => {
      vi.mocked(branchService.delete).mockResolvedValue(true)

      const result = await caller.delete({ branchId: 'branch-123' })

      expect(result).toBe(true)
      expect(branchService.delete).toHaveBeenCalledWith('branch-123')
    })

    it('should return false when branch cannot be deleted', async () => {
      vi.mocked(branchService.delete).mockResolvedValue(false)

      const result = await caller.delete({ branchId: 'main-branch' })

      expect(result).toBe(false)
    })

    it('should reject empty branchId', async () => {
      await expect(caller.delete({ branchId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.delete).mockRejectedValue(new Error('Delete failed'))

      await expect(caller.delete({ branchId: 'branch-123' })).rejects.toThrow('Delete failed')
    })
  })

  // ===========================================================================
  // RENAME PROCEDURE
  // ===========================================================================
  describe('rename', () => {
    it('should rename a branch successfully', async () => {
      vi.mocked(branchService.rename).mockResolvedValue(true)

      const result = await caller.rename({
        branchId: 'branch-123',
        name: 'new-feature-name',
      })

      expect(result).toBe(true)
      expect(branchService.rename).toHaveBeenCalledWith('branch-123', 'new-feature-name')
    })

    it('should return false when rename fails', async () => {
      vi.mocked(branchService.rename).mockResolvedValue(false)

      const result = await caller.rename({
        branchId: 'nonexistent',
        name: 'new-name',
      })

      expect(result).toBe(false)
    })

    it('should reject empty branchId', async () => {
      await expect(
        caller.rename({ branchId: '', name: 'valid-name' })
      ).rejects.toThrow()
    })

    it('should reject empty name', async () => {
      await expect(
        caller.rename({ branchId: 'branch-123', name: '' })
      ).rejects.toThrow()
    })

    it('should reject name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101)

      await expect(
        caller.rename({ branchId: 'branch-123', name: longName })
      ).rejects.toThrow()
    })

    it('should accept name at 100 character limit', async () => {
      vi.mocked(branchService.rename).mockResolvedValue(true)
      const maxName = 'a'.repeat(100)

      const result = await caller.rename({
        branchId: 'branch-123',
        name: maxName,
      })

      expect(result).toBe(true)
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.rename).mockRejectedValue(new Error('Rename failed'))

      await expect(
        caller.rename({ branchId: 'branch-123', name: 'new-name' })
      ).rejects.toThrow('Rename failed')
    })
  })

  // ===========================================================================
  // SWITCH PROCEDURE
  // ===========================================================================
  describe('switch', () => {
    it('should switch to a branch successfully', async () => {
      vi.mocked(branchService.switch).mockResolvedValue(true)

      const result = await caller.switch({ branchId: 'branch-123' })

      expect(result).toBe(true)
      expect(branchService.switch).toHaveBeenCalledWith('branch-123')
    })

    it('should return false when switch fails', async () => {
      vi.mocked(branchService.switch).mockResolvedValue(false)

      const result = await caller.switch({ branchId: 'abandoned-branch' })

      expect(result).toBe(false)
    })

    it('should reject empty branchId', async () => {
      await expect(caller.switch({ branchId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.switch).mockRejectedValue(new Error('Switch failed'))

      await expect(caller.switch({ branchId: 'branch-123' })).rejects.toThrow('Switch failed')
    })
  })

  // ===========================================================================
  // MERGE PROCEDURE
  // ===========================================================================
  describe('merge', () => {
    it('should merge branches with replace strategy', async () => {
      vi.mocked(branchService.merge).mockResolvedValue(true)

      const mergeParams: BranchMergeParams = {
        sourceBranchId: 'feature-branch',
        targetBranchId: 'main-branch',
        strategy: 'replace',
      }

      const result = await caller.merge(mergeParams)

      expect(result).toBe(true)
      expect(branchService.merge).toHaveBeenCalledWith(mergeParams)
    })

    it('should merge branches with append strategy', async () => {
      vi.mocked(branchService.merge).mockResolvedValue(true)

      const mergeParams: BranchMergeParams = {
        sourceBranchId: 'feature-branch',
        targetBranchId: 'main-branch',
        strategy: 'append',
      }

      const result = await caller.merge(mergeParams)

      expect(result).toBe(true)
      expect(branchService.merge).toHaveBeenCalledWith(mergeParams)
    })

    it('should merge branches with cherry-pick strategy', async () => {
      vi.mocked(branchService.merge).mockResolvedValue(true)

      const mergeParams: BranchMergeParams = {
        sourceBranchId: 'feature-branch',
        targetBranchId: 'main-branch',
        strategy: 'cherry-pick',
        messageIds: ['msg-1', 'msg-2', 'msg-3'],
      }

      const result = await caller.merge(mergeParams)

      expect(result).toBe(true)
      expect(branchService.merge).toHaveBeenCalledWith(mergeParams)
    })

    it('should return false when merge fails', async () => {
      vi.mocked(branchService.merge).mockResolvedValue(false)

      const result = await caller.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'append',
      })

      expect(result).toBe(false)
    })

    it('should reject empty sourceBranchId', async () => {
      await expect(
        caller.merge({
          sourceBranchId: '',
          targetBranchId: 'target',
          strategy: 'replace',
        })
      ).rejects.toThrow()
    })

    it('should reject empty targetBranchId', async () => {
      await expect(
        caller.merge({
          sourceBranchId: 'source',
          targetBranchId: '',
          strategy: 'replace',
        })
      ).rejects.toThrow()
    })

    it('should reject invalid strategy', async () => {
      await expect(
        caller.merge({
          sourceBranchId: 'source',
          targetBranchId: 'target',
          // @ts-expect-error Testing invalid strategy
          strategy: 'invalid-strategy',
        })
      ).rejects.toThrow()
    })

    it('should accept optional messageIds', async () => {
      vi.mocked(branchService.merge).mockResolvedValue(true)

      // Without messageIds
      const result1 = await caller.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'cherry-pick',
      })

      expect(result1).toBe(true)

      // With empty messageIds
      const result2 = await caller.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'cherry-pick',
        messageIds: [],
      })

      expect(result2).toBe(true)
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.merge).mockRejectedValue(new Error('Merge conflict'))

      await expect(
        caller.merge({
          sourceBranchId: 'source',
          targetBranchId: 'target',
          strategy: 'replace',
        })
      ).rejects.toThrow('Merge conflict')
    })
  })

  // ===========================================================================
  // ABANDON PROCEDURE
  // ===========================================================================
  describe('abandon', () => {
    it('should abandon a branch successfully', async () => {
      vi.mocked(branchService.abandon).mockResolvedValue(true)

      const result = await caller.abandon({ branchId: 'feature-branch' })

      expect(result).toBe(true)
      expect(branchService.abandon).toHaveBeenCalledWith('feature-branch')
    })

    it('should return false when abandon fails (e.g., main branch)', async () => {
      vi.mocked(branchService.abandon).mockResolvedValue(false)

      const result = await caller.abandon({ branchId: 'main-branch' })

      expect(result).toBe(false)
    })

    it('should reject empty branchId', async () => {
      await expect(caller.abandon({ branchId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.abandon).mockRejectedValue(new Error('Abandon failed'))

      await expect(caller.abandon({ branchId: 'branch-123' })).rejects.toThrow('Abandon failed')
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return global stats when no sessionId provided', async () => {
      const mockStats = createMockBranchStats()
      vi.mocked(branchService.stats).mockResolvedValue(mockStats)

      const result = await caller.stats()

      expect(result).toEqual(mockStats)
      expect(branchService.stats).toHaveBeenCalledWith(undefined)
    })

    it('should return stats for specific session', async () => {
      const mockStats = createMockBranchStats()
      vi.mocked(branchService.stats).mockResolvedValue(mockStats)

      const result = await caller.stats({ sessionId: 'session-456' })

      expect(result).toEqual(mockStats)
      expect(branchService.stats).toHaveBeenCalledWith('session-456')
    })

    it('should return zero stats for empty session', async () => {
      const emptyStats: BranchStats = {
        totalBranches: 0,
        activeBranches: 0,
        mergedBranches: 0,
        abandonedBranches: 0,
        avgMessagesPerBranch: 0,
      }
      vi.mocked(branchService.stats).mockResolvedValue(emptyStats)

      const result = await caller.stats({ sessionId: 'empty-session' })

      expect(result.totalBranches).toBe(0)
      expect(result.activeBranches).toBe(0)
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.stats).mockRejectedValue(new Error('Stats calculation failed'))

      await expect(caller.stats()).rejects.toThrow('Stats calculation failed')
    })
  })

  // ===========================================================================
  // GET ACTIVE BRANCH PROCEDURE
  // ===========================================================================
  describe('getActiveBranch', () => {
    it('should return active branch ID', async () => {
      vi.mocked(branchService.getActiveBranch).mockResolvedValue('branch-123')

      const result = await caller.getActiveBranch({ sessionId: 'session-456' })

      expect(result).toBe('branch-123')
      expect(branchService.getActiveBranch).toHaveBeenCalledWith('session-456')
    })

    it('should return null when no active branch', async () => {
      vi.mocked(branchService.getActiveBranch).mockResolvedValue(null)

      const result = await caller.getActiveBranch({ sessionId: 'no-active' })

      expect(result).toBeNull()
    })

    it('should reject empty sessionId', async () => {
      await expect(caller.getActiveBranch({ sessionId: '' })).rejects.toThrow()
    })

    it('should propagate service errors', async () => {
      vi.mocked(branchService.getActiveBranch).mockRejectedValue(
        new Error('Active branch lookup failed')
      )

      await expect(caller.getActiveBranch({ sessionId: 'session-456' })).rejects.toThrow(
        'Active branch lookup failed'
      )
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('branch lifecycle', () => {
    it('should handle list -> get -> rename -> switch flow', async () => {
      const mockBranch = createMockBranch()
      vi.mocked(branchService.list).mockResolvedValue([mockBranch])
      vi.mocked(branchService.get).mockResolvedValue(mockBranch)
      vi.mocked(branchService.rename).mockResolvedValue(true)
      vi.mocked(branchService.switch).mockResolvedValue(true)

      // List branches
      const branches = await caller.list({ sessionId: 'session-456' })
      expect(branches).toHaveLength(1)

      // Get specific branch
      const branch = await caller.get({ branchId: branches[0].id })
      expect(branch?.name).toBe('feature-branch')

      // Rename branch
      const renamed = await caller.rename({
        branchId: branch!.id,
        name: 'renamed-feature',
      })
      expect(renamed).toBe(true)

      // Switch to branch
      const switched = await caller.switch({ branchId: branch!.id })
      expect(switched).toBe(true)
    })

    it('should handle merge and abandon flow', async () => {
      vi.mocked(branchService.merge).mockResolvedValue(true)
      vi.mocked(branchService.abandon).mockResolvedValue(true)
      vi.mocked(branchService.stats).mockResolvedValue({
        totalBranches: 2,
        activeBranches: 1,
        mergedBranches: 1,
        abandonedBranches: 0,
        avgMessagesPerBranch: 5,
      })

      // Merge feature into main
      const merged = await caller.merge({
        sourceBranchId: 'feature',
        targetBranchId: 'main',
        strategy: 'append',
      })
      expect(merged).toBe(true)

      // Abandon old feature branch
      const abandoned = await caller.abandon({ branchId: 'old-feature' })
      expect(abandoned).toBe(true)

      // Check stats
      const stats = await caller.stats()
      expect(stats.mergedBranches).toBe(1)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle branch with many messages', async () => {
      const messagesArray = Array.from({ length: 1000 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user' as const,
        content: `Message ${i}`,
        timestamp: Date.now() + i,
      }))
      const branchWithManyMessages = createMockBranch({ messages: messagesArray })
      vi.mocked(branchService.get).mockResolvedValue(branchWithManyMessages)

      const result = await caller.get({ branchId: 'branch-123' })

      expect(result?.messages).toHaveLength(1000)
    })

    it('should handle deeply nested branch tree', async () => {
      const deepTree = createMockBranchTree()
      deepTree.branches = Array.from({ length: 50 }, (_, i) =>
        createMockBranch({
          id: `branch-${i}`,
          name: `branch-${i}`,
          parentBranchId: i === 0 ? null : `branch-${i - 1}`,
        })
      )
      vi.mocked(branchService.getTree).mockResolvedValue(deepTree)

      const result = await caller.getTree({ sessionId: 'session-456' })

      expect(result?.branches).toHaveLength(50)
    })

    it('should handle special characters in branch name', async () => {
      vi.mocked(branchService.rename).mockResolvedValue(true)

      // Names with special characters but valid
      const specialNames = [
        'feature/auth-fix',
        'bug-fix-#123',
        'v2.0.0-beta',
        "feature(new)'s test",
      ]

      for (const name of specialNames) {
        const result = await caller.rename({ branchId: 'branch-123', name })
        expect(result).toBe(true)
      }
    })

    it('should handle unicode in branch name', async () => {
      vi.mocked(branchService.rename).mockResolvedValue(true)

      const result = await caller.rename({
        branchId: 'branch-123',
        name: 'feature-branch',
      })

      expect(result).toBe(true)
    })
  })
})
