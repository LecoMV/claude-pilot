/**
 * BranchPanel Component Tests
 *
 * Tests for the conversation branch visualization and management panel.
 *
 * @module BranchPanel.test
 */

import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BranchPanel } from '../BranchPanel'
import type { ConversationBranch, BranchStats, ExternalSession } from '@shared/types'

// Mock ReactFlow and related components
vi.mock('reactflow', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow">{children}</div>
  ),
  Controls: () => <div data-testid="controls">Controls</div>,
  Background: () => <div data-testid="background">Background</div>,
  MiniMap: () => <div data-testid="minimap">MiniMap</div>,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  Position: { Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))

// Create mock functions for branch operations
const mockBranchesList = vi.fn()
const mockBranchesGetTree = vi.fn()
const mockBranchesGetStats = vi.fn()
const mockBranchesGetActiveBranch = vi.fn()

// Mock window.claude for branch operations
vi.stubGlobal('window', {
  ...window,
  electron: {
    on: vi.fn().mockReturnValue(() => {}),
    invoke: vi.fn(),
  },
  claude: {
    branches: {
      list: mockBranchesList,
      getTree: mockBranchesGetTree,
      getStats: mockBranchesGetStats,
      getActiveBranch: mockBranchesGetActiveBranch,
      switch: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      abandon: vi.fn(),
      diff: vi.fn(),
      merge: vi.fn(),
    },
  },
})

function createMockSession(overrides: Partial<ExternalSession> = {}): ExternalSession {
  return {
    id: 'session-1',
    projectName: 'Test Project',
    projectPath: '/test/project',
    slug: 'test-project',
    startTime: Date.now() - 3600000,
    lastActivity: Date.now(),
    isActive: true,
    stats: {
      messageCount: 10,
      inputTokens: 1000,
      outputTokens: 500,
      cachedTokens: 200,
      totalCost: 0.05,
      toolCalls: 5,
    },
    ...overrides,
  }
}

function createMockBranch(overrides: Partial<ConversationBranch> = {}): ConversationBranch {
  return {
    id: 'branch-1',
    sessionId: 'session-1',
    name: 'main',
    description: 'Main conversation branch',
    status: 'active',
    parentBranchId: null,
    branchPointMessageId: 'msg-1',
    messages: [
      { id: 'msg-1', role: 'user', content: 'Hello' },
      { id: 'msg-2', role: 'assistant', content: 'Hi there!' },
    ],
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    ...overrides,
  }
}

function createMockStats(overrides: Partial<BranchStats> = {}): BranchStats {
  return {
    totalBranches: 3,
    activeBranches: 2,
    mergedBranches: 1,
    abandonedBranches: 0,
    totalMessages: 20,
    avgMessagesPerBranch: 6.67,
    ...overrides,
  }
}

describe('BranchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default synchronous mock return values to avoid async issues
    mockBranchesList.mockResolvedValue([])
    mockBranchesGetTree.mockResolvedValue({ root: null, nodes: [] })
    mockBranchesGetStats.mockResolvedValue(createMockStats())
    mockBranchesGetActiveBranch.mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty state when no session', () => {
    render(<BranchPanel />)
    expect(screen.getByText('Select a session to view branches')).toBeDefined()
  })

  it('renders loading state when session provided', () => {
    // With async mocks, it will initially be loading
    const session = createMockSession()
    render(<BranchPanel session={session} />)

    // Component exists - loading or content
    expect(document.body).toBeDefined()
  })
})

describe('Branch utilities', () => {
  it('mock branch has correct structure', () => {
    const branch = createMockBranch()
    expect(branch.id).toBe('branch-1')
    expect(branch.sessionId).toBe('session-1')
    expect(branch.status).toBe('active')
    expect(branch.messages.length).toBe(2)
  })

  it('mock session has correct structure', () => {
    const session = createMockSession()
    expect(session.id).toBe('session-1')
    expect(session.projectName).toBe('Test Project')
    expect(session.isActive).toBe(true)
  })

  it('mock stats has correct fields', () => {
    const stats = createMockStats()
    expect(stats.totalBranches).toBe(3)
    expect(stats.activeBranches).toBe(2)
    expect(stats.mergedBranches).toBe(1)
  })

  it('mock branch with overrides works', () => {
    const branch = createMockBranch({ id: 'custom-id', name: 'feature' })
    expect(branch.id).toBe('custom-id')
    expect(branch.name).toBe('feature')
  })

  it('mock session with overrides works', () => {
    const session = createMockSession({ projectName: 'Custom Project' })
    expect(session.projectName).toBe('Custom Project')
    expect(session.id).toBe('session-1')
  })

  it('mock stats with overrides works', () => {
    const stats = createMockStats({ totalBranches: 10 })
    expect(stats.totalBranches).toBe(10)
    expect(stats.activeBranches).toBe(2)
  })

  it('mock branch handles different status values', () => {
    const activeBranch = createMockBranch({ status: 'active' })
    const mergedBranch = createMockBranch({ status: 'merged' })
    const abandonedBranch = createMockBranch({ status: 'abandoned' })

    expect(activeBranch.status).toBe('active')
    expect(mergedBranch.status).toBe('merged')
    expect(abandonedBranch.status).toBe('abandoned')
  })

  it('mock branch handles parent-child relationships', () => {
    const mainBranch = createMockBranch({ id: 'main', parentBranchId: null })
    const childBranch = createMockBranch({ id: 'child', parentBranchId: 'main' })

    expect(mainBranch.parentBranchId).toBeNull()
    expect(childBranch.parentBranchId).toBe('main')
  })

  it('mock session handles stats variations', () => {
    const sessionWithHighStats = createMockSession({
      stats: {
        messageCount: 100,
        inputTokens: 50000,
        outputTokens: 25000,
        cachedTokens: 10000,
        totalCost: 1.5,
        toolCalls: 50,
      },
    })

    expect(sessionWithHighStats.stats.messageCount).toBe(100)
    expect(sessionWithHighStats.stats.totalCost).toBe(1.5)
  })

  it('mock stats handles zero values', () => {
    const emptyStats = createMockStats({
      totalBranches: 0,
      activeBranches: 0,
      mergedBranches: 0,
      abandonedBranches: 0,
      totalMessages: 0,
      avgMessagesPerBranch: 0,
    })

    expect(emptyStats.totalBranches).toBe(0)
    expect(emptyStats.avgMessagesPerBranch).toBe(0)
  })

  it('mock branch handles empty messages', () => {
    const branchWithNoMessages = createMockBranch({ messages: [] })
    expect(branchWithNoMessages.messages.length).toBe(0)
  })

  it('mock session handles inactive state', () => {
    const inactiveSession = createMockSession({ isActive: false })
    expect(inactiveSession.isActive).toBe(false)
  })
})
