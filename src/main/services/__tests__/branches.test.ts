/**
 * Branch Service Tests
 *
 * Comprehensive tests for the conversation branching service.
 * Tests all public methods: init, list, get, getTree, create, ensureMainBranch,
 * delete, rename, switch, addMessage, diff, merge, abandon, stats, getActiveBranch
 *
 * @module branches.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import { BrowserWindow } from 'electron'
import type {
  ConversationBranch,
  ConversationMessage,
  BranchCreateParams,
  BranchMergeParams,
} from '@shared/types'

// Mock Electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}))

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/tmp/test-home'),
}))

// Import after mocks
import { branchService } from '../branches'

// Test data factories
const createMockMessage = (overrides: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  role: 'user',
  content: 'Test message',
  timestamp: Date.now(),
  ...overrides,
})

const createMockBranch = (overrides: Partial<ConversationBranch> = {}): ConversationBranch => ({
  id: `branch-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  name: 'test-branch',
  sessionId: 'session-123',
  parentBranchId: 'parent-branch-id',
  branchPointMessageId: 'msg-001',
  status: 'active',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [],
  ...overrides,
})

describe('BranchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the service state by accessing internal properties
    // Note: This is a workaround since the service is a singleton
    ;(branchService as unknown as { initialized: boolean }).initialized = false
    ;(branchService as unknown as { branches: Map<string, ConversationBranch> }).branches =
      new Map()
    ;(branchService as unknown as { activeBranches: Map<string, string> }).activeBranches =
      new Map()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  describe('init', () => {
    it('should create branches directory on init', async () => {
      await branchService.init()

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('branches'),
        { recursive: true }
      )
    })

    it('should load existing branches from disk', async () => {
      const mockBranch = createMockBranch({ id: 'existing-branch', name: 'main' })
      vi.mocked(fs.readdir).mockResolvedValue(['existing-branch.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockBranch))

      await branchService.init()
      const result = await branchService.get('existing-branch')

      expect(result).toEqual(mockBranch)
    })

    it('should skip non-json files when loading', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'branch1.json',
        'readme.txt',
        '.gitkeep',
      ] as unknown as string[])

      await branchService.init()

      // readFile should only be called once for the .json file
      expect(fs.readFile).toHaveBeenCalledTimes(1)
    })

    it('should not reinitialize if already initialized', async () => {
      await branchService.init()
      const callCount = vi.mocked(fs.mkdir).mock.calls.length

      await branchService.init()

      expect(fs.mkdir).toHaveBeenCalledTimes(callCount)
    })

    it('should handle initialization errors gracefully', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'))

      // Should not throw
      await expect(branchService.init()).resolves.not.toThrow()
    })

    it('should handle empty branches directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      await branchService.init()
      const branches = await branchService.list('any-session')

      expect(branches).toEqual([])
    })
  })

  // ===========================================================================
  // LIST
  // ===========================================================================
  describe('list', () => {
    it('should return branches for a specific session', async () => {
      const branch1 = createMockBranch({ id: 'b1', sessionId: 'session-1' })
      const branch2 = createMockBranch({ id: 'b2', sessionId: 'session-1' })
      const branch3 = createMockBranch({ id: 'b3', sessionId: 'session-2' })

      vi.mocked(fs.readdir).mockResolvedValue(['b1.json', 'b2.json', 'b3.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(branch1))
        .mockResolvedValueOnce(JSON.stringify(branch2))
        .mockResolvedValueOnce(JSON.stringify(branch3))

      await branchService.init()
      const result = await branchService.list('session-1')

      expect(result).toHaveLength(2)
      expect(result.every((b) => b.sessionId === 'session-1')).toBe(true)
    })

    it('should return empty array for session with no branches', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.list('nonexistent-session')

      expect(result).toEqual([])
    })

    it('should sort branches by createdAt', async () => {
      const now = Date.now()
      const branch1 = createMockBranch({ id: 'b1', sessionId: 's1', createdAt: now + 1000 })
      const branch2 = createMockBranch({ id: 'b2', sessionId: 's1', createdAt: now })
      const branch3 = createMockBranch({ id: 'b3', sessionId: 's1', createdAt: now + 500 })

      vi.mocked(fs.readdir).mockResolvedValue(['b1.json', 'b2.json', 'b3.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(branch1))
        .mockResolvedValueOnce(JSON.stringify(branch2))
        .mockResolvedValueOnce(JSON.stringify(branch3))

      await branchService.init()
      const result = await branchService.list('s1')

      expect(result[0].id).toBe('b2')
      expect(result[1].id).toBe('b3')
      expect(result[2].id).toBe('b1')
    })
  })

  // ===========================================================================
  // GET
  // ===========================================================================
  describe('get', () => {
    it('should return a branch by ID', async () => {
      const mockBranch = createMockBranch({ id: 'target-branch' })
      vi.mocked(fs.readdir).mockResolvedValue(['target-branch.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockBranch))

      await branchService.init()
      const result = await branchService.get('target-branch')

      expect(result).toEqual(mockBranch)
    })

    it('should return null for non-existent branch', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.get('nonexistent')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // GET TREE
  // ===========================================================================
  describe('getTree', () => {
    it('should return branch tree for a session', async () => {
      const mainBranch = createMockBranch({
        id: 'main',
        name: 'main',
        sessionId: 's1',
        parentBranchId: null,
      })
      const featureBranch = createMockBranch({
        id: 'feature',
        sessionId: 's1',
        parentBranchId: 'main',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['main.json', 'feature.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(mainBranch))
        .mockResolvedValueOnce(JSON.stringify(featureBranch))

      await branchService.init()
      const result = await branchService.getTree('s1')

      expect(result).not.toBeNull()
      expect(result?.sessionId).toBe('s1')
      expect(result?.mainBranchId).toBe('main')
      expect(result?.branches).toHaveLength(2)
    })

    it('should return null for session with no branches', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.getTree('empty-session')

      expect(result).toBeNull()
    })

    it('should return null if no main branch exists', async () => {
      const branch = createMockBranch({
        id: 'orphan',
        sessionId: 's1',
        parentBranchId: 'missing-parent',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['orphan.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.getTree('s1')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create', () => {
    beforeEach(() => {
      // Mock BrowserWindow for emitUpdate
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
        {
          webContents: {
            send: vi.fn(),
          },
        } as unknown as BrowserWindow,
      ])
    })

    it('should create a new branch', async () => {
      const createParams: BranchCreateParams = {
        sessionId: 'session-123',
        branchPointMessageId: 'msg-001',
        name: 'feature-branch',
        description: 'A new feature',
      }

      const result = await branchService.create(createParams)

      expect(result).not.toBeNull()
      expect(result?.name).toBe('feature-branch')
      expect(result?.sessionId).toBe('session-123')
      expect(result?.description).toBe('A new feature')
      expect(result?.status).toBe('active')
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should set parent branch correctly when existing branches exist', async () => {
      const mainBranch = createMockBranch({
        id: 'main',
        sessionId: 's1',
        parentBranchId: null,
        messages: [createMockMessage({ id: 'msg-001' })],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['main.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mainBranch))

      await branchService.init()

      const createParams: BranchCreateParams = {
        sessionId: 's1',
        branchPointMessageId: 'msg-001',
        name: 'feature',
      }

      const result = await branchService.create(createParams)

      expect(result?.parentBranchId).toBe('main')
    })

    it('should use main branch as parent if message not found in specific branch', async () => {
      const mainBranch = createMockBranch({
        id: 'main',
        sessionId: 's1',
        parentBranchId: null,
        messages: [],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['main.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mainBranch))

      await branchService.init()

      const createParams: BranchCreateParams = {
        sessionId: 's1',
        branchPointMessageId: 'unknown-msg',
        name: 'orphan-feature',
      }

      const result = await branchService.create(createParams)

      expect(result?.parentBranchId).toBe('main')
    })

    it('should emit update event when branch is created', async () => {
      const mockWindow = {
        webContents: { send: vi.fn() },
      } as unknown as BrowserWindow

      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWindow])

      await branchService.create({
        sessionId: 's1',
        branchPointMessageId: 'msg',
        name: 'new-branch',
      })

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('branches:updated', 's1')
    })
  })

  // ===========================================================================
  // ENSURE MAIN BRANCH
  // ===========================================================================
  describe('ensureMainBranch', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should create main branch if none exists', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.ensureMainBranch('new-session')

      expect(result.name).toBe('main')
      expect(result.parentBranchId).toBeNull()
      expect(result.status).toBe('active')
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should return existing main branch if one exists', async () => {
      const existingMain = createMockBranch({
        id: 'existing-main',
        name: 'main',
        sessionId: 's1',
        parentBranchId: null,
      })

      vi.mocked(fs.readdir).mockResolvedValue(['existing-main.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMain))

      await branchService.init()

      const result = await branchService.ensureMainBranch('s1')

      expect(result.id).toBe('existing-main')
      // writeFile should only be called during init, not for ensureMainBranch
      const writeCallsAfterInit = vi.mocked(fs.writeFile).mock.calls.length
      expect(writeCallsAfterInit).toBe(0)
    })
  })

  // ===========================================================================
  // DELETE
  // ===========================================================================
  describe('delete', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should delete a non-main branch', async () => {
      const branch = createMockBranch({
        id: 'feature',
        sessionId: 's1',
        parentBranchId: 'main',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.delete('feature')

      expect(result).toBe(true)
      expect(fs.unlink).toHaveBeenCalled()
    })

    it('should not delete main branch', async () => {
      const mainBranch = createMockBranch({
        id: 'main',
        sessionId: 's1',
        parentBranchId: null,
      })

      vi.mocked(fs.readdir).mockResolvedValue(['main.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mainBranch))

      await branchService.init()
      const result = await branchService.delete('main')

      expect(result).toBe(false)
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('should not delete branch with children', async () => {
      const parentBranch = createMockBranch({
        id: 'parent',
        sessionId: 's1',
        parentBranchId: 'main',
      })
      const childBranch = createMockBranch({
        id: 'child',
        sessionId: 's1',
        parentBranchId: 'parent',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['parent.json', 'child.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(parentBranch))
        .mockResolvedValueOnce(JSON.stringify(childBranch))

      await branchService.init()
      const result = await branchService.delete('parent')

      expect(result).toBe(false)
    })

    it('should return false for non-existent branch', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.delete('nonexistent')

      expect(result).toBe(false)
    })

    it('should handle unlink errors gracefully', async () => {
      const branch = createMockBranch({
        id: 'feature',
        sessionId: 's1',
        parentBranchId: 'main',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))
      vi.mocked(fs.unlink).mockRejectedValue(new Error('File not found'))

      await branchService.init()
      const result = await branchService.delete('feature')

      // Should still return true and remove from memory
      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // RENAME
  // ===========================================================================
  describe('rename', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should rename a branch', async () => {
      const branch = createMockBranch({ id: 'feature', name: 'old-name' })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.rename('feature', 'new-name')

      expect(result).toBe(true)
      expect(fs.writeFile).toHaveBeenCalled()

      const updatedBranch = await branchService.get('feature')
      expect(updatedBranch?.name).toBe('new-name')
    })

    it('should return false for non-existent branch', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.rename('nonexistent', 'new-name')

      expect(result).toBe(false)
    })

    it('should update updatedAt timestamp', async () => {
      const originalTime = Date.now() - 10000
      const branch = createMockBranch({
        id: 'feature',
        updatedAt: originalTime,
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      await branchService.rename('feature', 'renamed')

      const updatedBranch = await branchService.get('feature')
      expect(updatedBranch?.updatedAt).toBeGreaterThan(originalTime)
    })
  })

  // ===========================================================================
  // SWITCH
  // ===========================================================================
  describe('switch', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should switch to an active branch', async () => {
      const branch = createMockBranch({
        id: 'feature',
        sessionId: 's1',
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.switch('feature')

      expect(result).toBe(true)
    })

    it('should not switch to abandoned branch', async () => {
      const branch = createMockBranch({
        id: 'abandoned',
        status: 'abandoned',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['abandoned.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.switch('abandoned')

      expect(result).toBe(false)
    })

    it('should not switch to merged branch', async () => {
      const branch = createMockBranch({
        id: 'merged',
        status: 'merged',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['merged.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.switch('merged')

      expect(result).toBe(false)
    })

    it('should return false for non-existent branch', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.switch('nonexistent')

      expect(result).toBe(false)
    })

    it('should emit update event when switching', async () => {
      const mockWindow = {
        webContents: { send: vi.fn() },
      } as unknown as BrowserWindow

      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWindow])

      const branch = createMockBranch({
        id: 'feature',
        sessionId: 's1',
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      await branchService.switch('feature')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('branches:updated', 's1')
    })
  })

  // ===========================================================================
  // ADD MESSAGE
  // ===========================================================================
  describe('addMessage', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should add message to active branch', async () => {
      const branch = createMockBranch({
        id: 'feature',
        status: 'active',
        messages: [],
      })
      const message = createMockMessage({ content: 'New message' })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.addMessage('feature', message)

      expect(result).toBe(true)

      const updatedBranch = await branchService.get('feature')
      expect(updatedBranch?.messages).toHaveLength(1)
      expect(updatedBranch?.messages[0].content).toBe('New message')
    })

    it('should set branchPointMessageId on first message', async () => {
      const branch = createMockBranch({
        id: 'feature',
        status: 'active',
        branchPointMessageId: '',
        messages: [],
      })
      const message = createMockMessage({ id: 'first-msg' })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      await branchService.addMessage('feature', message)

      const updatedBranch = await branchService.get('feature')
      expect(updatedBranch?.branchPointMessageId).toBe('first-msg')
    })

    it('should not add message to abandoned branch', async () => {
      const branch = createMockBranch({
        id: 'abandoned',
        status: 'abandoned',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['abandoned.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.addMessage(
        'abandoned',
        createMockMessage()
      )

      expect(result).toBe(false)
    })

    it('should return false for non-existent branch', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.addMessage(
        'nonexistent',
        createMockMessage()
      )

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // DIFF
  // ===========================================================================
  describe('diff', () => {
    it('should return diff between two branches', async () => {
      const branchA = createMockBranch({
        id: 'branchA',
        createdAt: Date.now(),
        messages: [
          createMockMessage({ id: 'a1' }),
          createMockMessage({ id: 'common' }),
        ],
      })
      const branchB = createMockBranch({
        id: 'branchB',
        createdAt: Date.now() - 1000,
        branchPointMessageId: 'common',
        messages: [
          createMockMessage({ id: 'b1' }),
          createMockMessage({ id: 'common' }),
        ],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['branchA.json', 'branchB.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(branchA))
        .mockResolvedValueOnce(JSON.stringify(branchB))

      await branchService.init()
      const result = await branchService.diff('branchA', 'branchB')

      expect(result).not.toBeNull()
      expect(result?.branchA).toBe('branchA')
      expect(result?.branchB).toBe('branchB')
      expect(result?.messagesOnlyInA).toHaveLength(1)
      expect(result?.messagesOnlyInB).toHaveLength(1)
    })

    it('should return null if branch A does not exist', async () => {
      const branchB = createMockBranch({ id: 'branchB' })

      vi.mocked(fs.readdir).mockResolvedValue(['branchB.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branchB))

      await branchService.init()
      const result = await branchService.diff('nonexistent', 'branchB')

      expect(result).toBeNull()
    })

    it('should return null if branch B does not exist', async () => {
      const branchA = createMockBranch({ id: 'branchA' })

      vi.mocked(fs.readdir).mockResolvedValue(['branchA.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branchA))

      await branchService.init()
      const result = await branchService.diff('branchA', 'nonexistent')

      expect(result).toBeNull()
    })

    it('should handle common ancestor detection', async () => {
      const parentBranch = createMockBranch({
        id: 'parent',
        createdAt: Date.now() - 2000,
        messages: [createMockMessage({ id: 'common' })],
      })
      const childBranch = createMockBranch({
        id: 'child',
        parentBranchId: 'parent',
        createdAt: Date.now(),
        branchPointMessageId: 'branch-point',
        messages: [createMockMessage({ id: 'child-msg' })],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['parent.json', 'child.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(parentBranch))
        .mockResolvedValueOnce(JSON.stringify(childBranch))

      await branchService.init()
      const result = await branchService.diff('child', 'parent')

      expect(result?.commonAncestorId).toBe('branch-point')
    })
  })

  // ===========================================================================
  // MERGE
  // ===========================================================================
  describe('merge', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should merge with replace strategy', async () => {
      const source = createMockBranch({
        id: 'source',
        status: 'active',
        messages: [createMockMessage({ id: 'src-msg' })],
      })
      const target = createMockBranch({
        id: 'target',
        status: 'active',
        messages: [createMockMessage({ id: 'tgt-msg' })],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['source.json', 'target.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(source))
        .mockResolvedValueOnce(JSON.stringify(target))

      await branchService.init()

      const mergeParams: BranchMergeParams = {
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'replace',
      }

      const result = await branchService.merge(mergeParams)

      expect(result).toBe(true)

      const updatedTarget = await branchService.get('target')
      expect(updatedTarget?.messages).toHaveLength(1)
      expect(updatedTarget?.messages[0].id).toBe('src-msg')

      const updatedSource = await branchService.get('source')
      expect(updatedSource?.status).toBe('merged')
      expect(updatedSource?.mergedInto).toBe('target')
    })

    it('should merge with append strategy', async () => {
      const source = createMockBranch({
        id: 'source',
        status: 'active',
        messages: [createMockMessage({ id: 'src-msg' })],
      })
      const target = createMockBranch({
        id: 'target',
        status: 'active',
        messages: [createMockMessage({ id: 'tgt-msg' })],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['source.json', 'target.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(source))
        .mockResolvedValueOnce(JSON.stringify(target))

      await branchService.init()

      const result = await branchService.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'append',
      })

      expect(result).toBe(true)

      const updatedTarget = await branchService.get('target')
      expect(updatedTarget?.messages).toHaveLength(2)
    })

    it('should merge with cherry-pick strategy', async () => {
      const source = createMockBranch({
        id: 'source',
        status: 'active',
        messages: [
          createMockMessage({ id: 'pick-me' }),
          createMockMessage({ id: 'skip-me' }),
        ],
      })
      const target = createMockBranch({
        id: 'target',
        status: 'active',
        messages: [],
      })

      vi.mocked(fs.readdir).mockResolvedValue(['source.json', 'target.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(source))
        .mockResolvedValueOnce(JSON.stringify(target))

      await branchService.init()

      const result = await branchService.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'cherry-pick',
        messageIds: ['pick-me'],
      })

      expect(result).toBe(true)

      const updatedTarget = await branchService.get('target')
      expect(updatedTarget?.messages).toHaveLength(1)
      expect(updatedTarget?.messages[0].id).toBe('pick-me')
    })

    it('should not merge into non-active branch', async () => {
      const source = createMockBranch({ id: 'source', status: 'active' })
      const target = createMockBranch({ id: 'target', status: 'abandoned' })

      vi.mocked(fs.readdir).mockResolvedValue(['source.json', 'target.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(source))
        .mockResolvedValueOnce(JSON.stringify(target))

      await branchService.init()

      const result = await branchService.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        strategy: 'replace',
      })

      expect(result).toBe(false)
    })

    it('should return false if source does not exist', async () => {
      const target = createMockBranch({ id: 'target', status: 'active' })

      vi.mocked(fs.readdir).mockResolvedValue(['target.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(target))

      await branchService.init()

      const result = await branchService.merge({
        sourceBranchId: 'nonexistent',
        targetBranchId: 'target',
        strategy: 'replace',
      })

      expect(result).toBe(false)
    })

    it('should handle unknown strategy gracefully', async () => {
      const source = createMockBranch({ id: 'source', status: 'active' })
      const target = createMockBranch({ id: 'target', status: 'active' })

      vi.mocked(fs.readdir).mockResolvedValue(['source.json', 'target.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(source))
        .mockResolvedValueOnce(JSON.stringify(target))

      await branchService.init()

      const result = await branchService.merge({
        sourceBranchId: 'source',
        targetBranchId: 'target',
        // @ts-expect-error Testing invalid strategy
        strategy: 'unknown',
      })

      // Should still mark source as merged
      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // ABANDON
  // ===========================================================================
  describe('abandon', () => {
    beforeEach(() => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
    })

    it('should abandon a non-main branch', async () => {
      const branch = createMockBranch({
        id: 'feature',
        parentBranchId: 'main',
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))

      await branchService.init()
      const result = await branchService.abandon('feature')

      expect(result).toBe(true)

      const updatedBranch = await branchService.get('feature')
      expect(updatedBranch?.status).toBe('abandoned')
    })

    it('should not abandon main branch', async () => {
      const mainBranch = createMockBranch({
        id: 'main',
        parentBranchId: null,
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['main.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mainBranch))

      await branchService.init()
      const result = await branchService.abandon('main')

      expect(result).toBe(false)
    })

    it('should return false for non-existent branch', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.abandon('nonexistent')

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // STATS
  // ===========================================================================
  describe('stats', () => {
    it('should return global stats when no sessionId provided', async () => {
      const branches = [
        createMockBranch({ id: 'b1', status: 'active', messages: [createMockMessage()] }),
        createMockBranch({ id: 'b2', status: 'merged', messages: [] }),
        createMockBranch({ id: 'b3', status: 'abandoned', messages: [createMockMessage(), createMockMessage()] }),
      ]

      vi.mocked(fs.readdir).mockResolvedValue(branches.map((b) => `${b.id}.json`) as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(branches[0]))
        .mockResolvedValueOnce(JSON.stringify(branches[1]))
        .mockResolvedValueOnce(JSON.stringify(branches[2]))

      await branchService.init()
      const result = await branchService.stats()

      expect(result.totalBranches).toBe(3)
      expect(result.activeBranches).toBe(1)
      expect(result.mergedBranches).toBe(1)
      expect(result.abandonedBranches).toBe(1)
      expect(result.avgMessagesPerBranch).toBe(1) // 3 messages / 3 branches
    })

    it('should return stats for specific session', async () => {
      const branches = [
        createMockBranch({ id: 'b1', sessionId: 's1', status: 'active' }),
        createMockBranch({ id: 'b2', sessionId: 's1', status: 'active' }),
        createMockBranch({ id: 'b3', sessionId: 's2', status: 'active' }),
      ]

      vi.mocked(fs.readdir).mockResolvedValue(branches.map((b) => `${b.id}.json`) as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(branches[0]))
        .mockResolvedValueOnce(JSON.stringify(branches[1]))
        .mockResolvedValueOnce(JSON.stringify(branches[2]))

      await branchService.init()
      const result = await branchService.stats('s1')

      expect(result.totalBranches).toBe(2)
      expect(result.activeBranches).toBe(2)
    })

    it('should return zero stats for empty session', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.stats('empty-session')

      expect(result.totalBranches).toBe(0)
      expect(result.activeBranches).toBe(0)
      expect(result.mergedBranches).toBe(0)
      expect(result.abandonedBranches).toBe(0)
      expect(result.avgMessagesPerBranch).toBe(0)
    })
  })

  // ===========================================================================
  // GET ACTIVE BRANCH
  // ===========================================================================
  describe('getActiveBranch', () => {
    it('should return stored active branch', async () => {
      const branch = createMockBranch({
        id: 'feature',
        sessionId: 's1',
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['feature.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(branch))
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      await branchService.init()
      await branchService.switch('feature')

      const result = await branchService.getActiveBranch('s1')

      expect(result).toBe('feature')
    })

    it('should fall back to main branch if no active branch set', async () => {
      const mainBranch = createMockBranch({
        id: 'main',
        sessionId: 's1',
        parentBranchId: null,
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['main.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mainBranch))

      await branchService.init()
      const result = await branchService.getActiveBranch('s1')

      expect(result).toBe('main')
    })

    it('should return null if no active branch exists', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([])

      const result = await branchService.getActiveBranch('empty-session')

      expect(result).toBeNull()
    })

    it('should not return abandoned branch as active', async () => {
      const abandonedBranch = createMockBranch({
        id: 'abandoned',
        sessionId: 's1',
        status: 'abandoned',
      })
      const mainBranch = createMockBranch({
        id: 'main',
        sessionId: 's1',
        parentBranchId: null,
        status: 'active',
      })

      vi.mocked(fs.readdir).mockResolvedValue(['abandoned.json', 'main.json'] as unknown as string[])
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(abandonedBranch))
        .mockResolvedValueOnce(JSON.stringify(mainBranch))
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      await branchService.init()

      // Manually set abandoned branch as active (simulating corrupted state)
      ;(branchService as unknown as { activeBranches: Map<string, string> }).activeBranches.set(
        's1',
        'abandoned'
      )

      const result = await branchService.getActiveBranch('s1')

      expect(result).toBe('main')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle corrupted JSON files gracefully', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['corrupted.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue('not valid json {{{')

      // Should not throw during init
      await expect(branchService.init()).resolves.not.toThrow()
    })

    it('should handle concurrent operations', async () => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      // Create multiple branches concurrently
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        branchService.create({
          sessionId: 's1',
          branchPointMessageId: `msg-${i}`,
          name: `branch-${i}`,
        })
      )

      const results = await Promise.all(createPromises)

      expect(results.every((r) => r !== null)).toBe(true)
      expect(new Set(results.map((r) => r?.id)).size).toBe(5) // All unique IDs
    })

    it('should generate unique branch IDs', async () => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const branch = await branchService.create({
          sessionId: 's1',
          branchPointMessageId: `msg-${i}`,
          name: `branch-${i}`,
        })
        if (branch?.id) {
          expect(ids.has(branch.id)).toBe(false)
          ids.add(branch.id)
        }
      }

      expect(ids.size).toBe(100)
    })
  })
})
