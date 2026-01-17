/**
 * Conversation Branching Service
 * Git-like branching for conversation sessions
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { homedir } from 'os'
import type {
  ConversationBranch,
  ConversationMessage,
  BranchTree,
  BranchDiff,
  BranchMergeParams,
  BranchCreateParams,
  BranchStats,
  BranchStatus,
} from '@shared/types'

const BRANCHES_DIR = path.join(homedir(), '.config', 'claude-pilot', 'branches')

class BranchService {
  private branches: Map<string, ConversationBranch> = new Map()
  private activeBranches: Map<string, string> = new Map() // sessionId -> branchId
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return

    try {
      await fs.mkdir(BRANCHES_DIR, { recursive: true })
      await this.loadBranches()
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize branch service:', error)
    }
  }

  private async loadBranches(): Promise<void> {
    try {
      const files = await fs.readdir(BRANCHES_DIR)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(BRANCHES_DIR, file), 'utf-8')
          const branch = JSON.parse(content) as ConversationBranch
          this.branches.set(branch.id, branch)
        }
      }
    } catch (error) {
      // Directory might be empty, that's okay
    }
  }

  private async saveBranch(branch: ConversationBranch): Promise<void> {
    const filePath = path.join(BRANCHES_DIR, `${branch.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(branch, null, 2))
    this.branches.set(branch.id, branch)
    this.emitUpdate(branch.sessionId)
  }

  private async deleteBranchFile(branchId: string): Promise<void> {
    const filePath = path.join(BRANCHES_DIR, `${branchId}.json`)
    try {
      await fs.unlink(filePath)
    } catch {
      // File might not exist
    }
    this.branches.delete(branchId)
  }

  private emitUpdate(sessionId: string): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('branches:updated', sessionId)
    }
  }

  private generateId(): string {
    return `branch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  // List all branches for a session
  async list(sessionId: string): Promise<ConversationBranch[]> {
    await this.init()
    return Array.from(this.branches.values())
      .filter(b => b.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  // Get a specific branch
  async get(branchId: string): Promise<ConversationBranch | null> {
    await this.init()
    return this.branches.get(branchId) || null
  }

  // Get the branch tree for visualization
  async getTree(sessionId: string): Promise<BranchTree | null> {
    await this.init()
    const branches = await this.list(sessionId)
    if (branches.length === 0) return null

    const mainBranch = branches.find(b => b.parentBranchId === null)
    if (!mainBranch) return null

    return {
      sessionId,
      mainBranchId: mainBranch.id,
      branches,
    }
  }

  // Create a new branch from a specific message point
  async create(params: BranchCreateParams): Promise<ConversationBranch | null> {
    await this.init()

    const { sessionId, branchPointMessageId, name, description } = params

    // Check if this is the first branch (create main branch implicitly)
    const existingBranches = await this.list(sessionId)
    let parentBranchId: string | null = null

    if (existingBranches.length > 0) {
      // Find which branch the message belongs to
      for (const branch of existingBranches) {
        const hasMessage = branch.messages.some(m => m.id === branchPointMessageId) ||
          branch.branchPointMessageId === branchPointMessageId
        if (hasMessage) {
          parentBranchId = branch.id
          break
        }
      }
      // If no parent found, use main branch
      if (!parentBranchId) {
        const mainBranch = existingBranches.find(b => b.parentBranchId === null)
        if (mainBranch) {
          parentBranchId = mainBranch.id
        }
      }
    }

    const branch: ConversationBranch = {
      id: this.generateId(),
      name,
      sessionId,
      parentBranchId,
      branchPointMessageId,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      description,
    }

    await this.saveBranch(branch)
    return branch
  }

  // Create main branch for a session (called when first message is added)
  async ensureMainBranch(sessionId: string): Promise<ConversationBranch> {
    await this.init()

    const existingBranches = await this.list(sessionId)
    const mainBranch = existingBranches.find(b => b.parentBranchId === null)

    if (mainBranch) {
      return mainBranch
    }

    const branch: ConversationBranch = {
      id: this.generateId(),
      name: 'main',
      sessionId,
      parentBranchId: null,
      branchPointMessageId: '', // Will be set on first message
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    }

    await this.saveBranch(branch)
    this.activeBranches.set(sessionId, branch.id)
    return branch
  }

  // Delete a branch
  async delete(branchId: string): Promise<boolean> {
    await this.init()

    const branch = this.branches.get(branchId)
    if (!branch) return false

    // Don't allow deleting main branch
    if (branch.parentBranchId === null) {
      return false
    }

    // Check for child branches
    const hasChildren = Array.from(this.branches.values())
      .some(b => b.parentBranchId === branchId)
    if (hasChildren) {
      return false // Can't delete branch with children
    }

    await this.deleteBranchFile(branchId)
    this.emitUpdate(branch.sessionId)
    return true
  }

  // Rename a branch
  async rename(branchId: string, name: string): Promise<boolean> {
    await this.init()

    const branch = this.branches.get(branchId)
    if (!branch) return false

    branch.name = name
    branch.updatedAt = Date.now()
    await this.saveBranch(branch)
    return true
  }

  // Switch to a different branch (set as active)
  async switch(branchId: string): Promise<boolean> {
    await this.init()

    const branch = this.branches.get(branchId)
    if (!branch) return false

    if (branch.status !== 'active') {
      return false // Can't switch to abandoned/merged branch
    }

    this.activeBranches.set(branch.sessionId, branchId)
    this.emitUpdate(branch.sessionId)
    return true
  }

  // Add a message to a branch
  async addMessage(branchId: string, message: ConversationMessage): Promise<boolean> {
    await this.init()

    const branch = this.branches.get(branchId)
    if (!branch) return false

    if (branch.status !== 'active') {
      return false // Can't add to abandoned/merged branch
    }

    // Set branch point if this is the first message
    if (!branch.branchPointMessageId && branch.messages.length === 0) {
      branch.branchPointMessageId = message.id
    }

    branch.messages.push(message)
    branch.updatedAt = Date.now()
    await this.saveBranch(branch)
    return true
  }

  // Get diff between two branches
  async diff(branchA: string, branchB: string): Promise<BranchDiff | null> {
    await this.init()

    const a = this.branches.get(branchA)
    const b = this.branches.get(branchB)
    if (!a || !b) return null

    // Find common ancestor
    let commonAncestorId = ''
    const aMessageIds = new Set(a.messages.map(m => m.id))
    const bMessageIds = new Set(b.messages.map(m => m.id))

    // Messages unique to each branch
    const messagesOnlyInA = a.messages.filter(m => !bMessageIds.has(m.id))
    const messagesOnlyInB = b.messages.filter(m => !aMessageIds.has(m.id))

    // Common ancestor is the branch point of the more recent branch
    if (a.createdAt > b.createdAt) {
      commonAncestorId = a.branchPointMessageId
    } else if (b.createdAt > a.createdAt) {
      commonAncestorId = b.branchPointMessageId
    } else {
      // Same time, find common parent
      if (a.parentBranchId === b.id) {
        commonAncestorId = a.branchPointMessageId
      } else if (b.parentBranchId === a.id) {
        commonAncestorId = b.branchPointMessageId
      }
    }

    return {
      branchA,
      branchB,
      commonAncestorId,
      messagesOnlyInA,
      messagesOnlyInB,
    }
  }

  // Merge branches
  async merge(params: BranchMergeParams): Promise<boolean> {
    await this.init()

    const { sourceBranchId, targetBranchId, strategy, messageIds } = params

    const source = this.branches.get(sourceBranchId)
    const target = this.branches.get(targetBranchId)
    if (!source || !target) return false

    if (target.status !== 'active') {
      return false // Can't merge into non-active branch
    }

    let messagesToMerge: ConversationMessage[] = []

    switch (strategy) {
      case 'replace':
        // Replace target messages with source messages after branch point
        target.messages = [...source.messages]
        break

      case 'append':
        // Append source messages to target
        messagesToMerge = source.messages.filter(
          sm => !target.messages.some(tm => tm.id === sm.id)
        )
        target.messages.push(...messagesToMerge)
        break

      case 'cherry-pick':
        // Only add specified messages
        if (messageIds) {
          messagesToMerge = source.messages.filter(m => messageIds.includes(m.id))
          target.messages.push(...messagesToMerge)
        }
        break
    }

    // Mark source as merged
    source.status = 'merged'
    source.mergedInto = targetBranchId
    source.updatedAt = Date.now()

    target.updatedAt = Date.now()

    await Promise.all([
      this.saveBranch(source),
      this.saveBranch(target),
    ])

    return true
  }

  // Abandon a branch
  async abandon(branchId: string): Promise<boolean> {
    await this.init()

    const branch = this.branches.get(branchId)
    if (!branch) return false

    // Don't allow abandoning main branch
    if (branch.parentBranchId === null) {
      return false
    }

    branch.status = 'abandoned'
    branch.updatedAt = Date.now()
    await this.saveBranch(branch)
    return true
  }

  // Get branch statistics
  async stats(sessionId?: string): Promise<BranchStats> {
    await this.init()

    const branches = sessionId
      ? Array.from(this.branches.values()).filter(b => b.sessionId === sessionId)
      : Array.from(this.branches.values())

    const totalBranches = branches.length
    const activeBranches = branches.filter(b => b.status === 'active').length
    const mergedBranches = branches.filter(b => b.status === 'merged').length
    const abandonedBranches = branches.filter(b => b.status === 'abandoned').length

    const totalMessages = branches.reduce((sum, b) => sum + b.messages.length, 0)
    const avgMessagesPerBranch = totalBranches > 0 ? totalMessages / totalBranches : 0

    return {
      totalBranches,
      activeBranches,
      mergedBranches,
      abandonedBranches,
      avgMessagesPerBranch,
    }
  }

  // Get active branch for a session
  async getActiveBranch(sessionId: string): Promise<string | null> {
    await this.init()

    // Check stored active branch
    const storedActive = this.activeBranches.get(sessionId)
    if (storedActive && this.branches.has(storedActive)) {
      const branch = this.branches.get(storedActive)!
      if (branch.status === 'active') {
        return storedActive
      }
    }

    // Find main branch as fallback
    const branches = await this.list(sessionId)
    const mainBranch = branches.find(b => b.parentBranchId === null && b.status === 'active')
    if (mainBranch) {
      this.activeBranches.set(sessionId, mainBranch.id)
      return mainBranch.id
    }

    return null
  }
}

export const branchService = new BranchService()

// Register IPC handlers
export function registerBranchHandlers(): void {
  ipcMain.handle('branches:list', async (_event, sessionId: string) =>
    branchService.list(sessionId)
  )

  ipcMain.handle('branches:get', async (_event, branchId: string) =>
    branchService.get(branchId)
  )

  ipcMain.handle('branches:getTree', async (_event, sessionId: string) =>
    branchService.getTree(sessionId)
  )

  ipcMain.handle('branches:create', async (_event, params: BranchCreateParams) =>
    branchService.create(params)
  )

  ipcMain.handle('branches:delete', async (_event, branchId: string) =>
    branchService.delete(branchId)
  )

  ipcMain.handle('branches:rename', async (_event, branchId: string, name: string) =>
    branchService.rename(branchId, name)
  )

  ipcMain.handle('branches:switch', async (_event, branchId: string) =>
    branchService.switch(branchId)
  )

  ipcMain.handle('branches:addMessage', async (_event, branchId: string, message: ConversationMessage) =>
    branchService.addMessage(branchId, message)
  )

  ipcMain.handle('branches:diff', async (_event, branchA: string, branchB: string) =>
    branchService.diff(branchA, branchB)
  )

  ipcMain.handle('branches:merge', async (_event, params: BranchMergeParams) =>
    branchService.merge(params)
  )

  ipcMain.handle('branches:abandon', async (_event, branchId: string) =>
    branchService.abandon(branchId)
  )

  ipcMain.handle('branches:stats', async (_event, sessionId?: string) =>
    branchService.stats(sessionId)
  )

  ipcMain.handle('branches:getActiveBranch', async (_event, sessionId: string) =>
    branchService.getActiveBranch(sessionId)
  )
}
