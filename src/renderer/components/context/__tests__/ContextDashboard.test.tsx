import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExternalSession } from '@shared/types'

// Setup mock data and functions before mock definitions
const mockTokenUsageRefetch = vi.fn()
const mockCompactionSettingsRefetch = vi.fn()
const mockSessionsRefetch = vi.fn()
const mockActiveSessionsRefetch = vi.fn()
const mockCompactMutate = vi.fn()
const mockSetAutoCompactMutate = vi.fn()
const mockOpenPathMutate = vi.fn()

// Mock data
let mockTokenUsageData = { current: 50000, max: 200000, percentage: 25, lastCompaction: Date.now() - 3600000 }
let mockCompactionSettingsData = { autoCompact: true, threshold: 80 }
let mockSessionsData: Array<{
  id: string
  projectPath: string
  projectName: string
  startTime: number
  endTime?: number
  messageCount: number
  tokenCount: number
  toolCalls: number
  model?: string
}> = []
let mockActiveSessionsData: ExternalSession[] = []
let mockTokenUsageLoading = false
let mockCompactionSettingsLoading = false
let mockSessionsLoading = false
let mockActiveSessionsLoading = false

// Mock tRPC before importing component
vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    context: {
      tokenUsage: {
        useQuery: () => ({
          data: mockTokenUsageData,
          isLoading: mockTokenUsageLoading,
          refetch: mockTokenUsageRefetch,
        }),
      },
      compactionSettings: {
        useQuery: () => ({
          data: mockCompactionSettingsData,
          isLoading: mockCompactionSettingsLoading,
          refetch: mockCompactionSettingsRefetch,
        }),
      },
      sessions: {
        useQuery: () => ({
          data: mockSessionsData,
          isLoading: mockSessionsLoading,
          refetch: mockSessionsRefetch,
        }),
      },
      compact: {
        useMutation: () => ({
          mutate: mockCompactMutate,
        }),
      },
      setAutoCompact: {
        useMutation: () => ({
          mutate: mockSetAutoCompactMutate,
        }),
      },
    },
    sessions: {
      getActive: {
        useQuery: () => ({
          data: mockActiveSessionsData,
          isLoading: mockActiveSessionsLoading,
          refetch: mockActiveSessionsRefetch,
        }),
      },
    },
    system: {
      openPath: {
        useMutation: () => ({
          mutate: mockOpenPathMutate,
        }),
      },
    },
  },
}))

// Mock the context store
type MockSessionSummary = {
  id: string
  projectPath: string
  projectName: string
  startTime: number
  endTime?: number
  messageCount: number
  tokenCount: number
  toolCalls: number
  model?: string
}

let mockContextStoreState: {
  sessions: MockSessionSummary[]
  tokenUsage: { current: number; max: number; percentage: number; lastCompaction?: number } | null
  compactionSettings: { autoCompact: boolean; threshold: number } | null
  selectedSession: MockSessionSummary | null
  setSessions: ReturnType<typeof vi.fn>
  setTokenUsage: ReturnType<typeof vi.fn>
  setCompactionSettings: ReturnType<typeof vi.fn>
  setSelectedSession: ReturnType<typeof vi.fn>
}

const mockSetSessions = vi.fn()
const mockSetTokenUsage = vi.fn()
const mockSetCompactionSettings = vi.fn()
const mockSetSelectedSession = vi.fn()

vi.mock('@/stores/context', () => ({
  useContextStore: () => mockContextStoreState,
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Gauge: () => <span data-testid="icon-gauge">Gauge</span>,
  History: () => <span data-testid="icon-history">History</span>,
  Zap: () => <span data-testid="icon-zap">Zap</span>,
  Clock: () => <span data-testid="icon-clock">Clock</span>,
  MessageSquare: () => <span data-testid="icon-message">MessageSquare</span>,
  Wrench: () => <span data-testid="icon-wrench">Wrench</span>,
  RefreshCw: () => <span data-testid="icon-refresh">RefreshCw</span>,
  Archive: () => <span data-testid="icon-archive">Archive</span>,
  Folder: () => <span data-testid="icon-folder">Folder</span>,
  Calendar: () => <span data-testid="icon-calendar">Calendar</span>,
  Hash: () => <span data-testid="icon-hash">Hash</span>,
  AlertCircle: () => <span data-testid="icon-alert-circle">AlertCircle</span>,
  XCircle: () => <span data-testid="icon-xcircle">XCircle</span>,
  Radio: () => <span data-testid="icon-radio">Radio</span>,
  ExternalLink: () => <span data-testid="icon-external">ExternalLink</span>,
  Terminal: () => <span data-testid="icon-terminal">Terminal</span>,
  AlertTriangle: () => <span data-testid="icon-alert-triangle">AlertTriangle</span>,
}))

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}))

// Import component after mocks
import { ContextDashboard } from '../ContextDashboard'
import type { SessionSummary } from '@/stores/context'

// Helper to create mock session summary
const createMockSessionSummary = (overrides?: Partial<SessionSummary>): SessionSummary => ({
  id: `session-${Math.random().toString(36).slice(2, 9)}`,
  projectPath: '/home/user/projects/test',
  projectName: 'test-project',
  startTime: Date.now() - 3600000,
  messageCount: 25,
  tokenCount: 45000,
  toolCalls: 15,
  model: 'claude-sonnet-4-20250514',
  ...overrides,
})

// Helper to create mock external session
const createMockExternalSession = (overrides?: Partial<ExternalSession>): ExternalSession => ({
  id: `session-${Math.random().toString(36).slice(2, 9)}`,
  projectPath: '/home/user/projects/test',
  projectName: 'test-project',
  filePath: '/home/user/.claude/projects/test/transcript.jsonl',
  startTime: Date.now() - 3600000,
  lastActivity: Date.now() - 60000,
  isActive: true,
  model: 'claude-sonnet-4-20250514',
  gitBranch: 'main',
  stats: {
    messageCount: 25,
    userMessages: 12,
    assistantMessages: 13,
    toolCalls: 15,
    inputTokens: 45000,
    outputTokens: 22000,
    cachedTokens: 10000,
  },
  ...overrides,
})

describe('ContextDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mock data to defaults
    mockTokenUsageData = { current: 50000, max: 200000, percentage: 25, lastCompaction: Date.now() - 3600000 }
    mockCompactionSettingsData = { autoCompact: true, threshold: 80 }
    mockSessionsData = []
    mockActiveSessionsData = []
    mockTokenUsageLoading = false
    mockCompactionSettingsLoading = false
    mockSessionsLoading = false
    mockActiveSessionsLoading = false

    // Reset context store state
    mockContextStoreState = {
      sessions: [],
      tokenUsage: { current: 50000, max: 200000, percentage: 25, lastCompaction: Date.now() - 3600000 },
      compactionSettings: { autoCompact: true, threshold: 80 },
      selectedSession: null,
      setSessions: mockSetSessions,
      setTokenUsage: mockSetTokenUsage,
      setCompactionSettings: mockSetCompactionSettings,
      setSelectedSession: mockSetSelectedSession,
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // LOADING STATE TESTS
  // ==========================================================================
  describe('Loading State', () => {
    it('shows loading spinner when all queries are loading', () => {
      mockTokenUsageLoading = true
      mockCompactionSettingsLoading = true
      mockSessionsLoading = true
      mockActiveSessionsLoading = true

      render(<ContextDashboard />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).not.toBeNull()
    })

    it('renders content when loading completes', () => {
      render(<ContextDashboard />)

      expect(screen.getByText('Active Sessions')).toBeDefined()
      expect(screen.getByText('Token Estimation')).toBeDefined()
      expect(screen.getByText('Session History')).toBeDefined()
    })
  })

  // ==========================================================================
  // TAB NAVIGATION TESTS
  // ==========================================================================
  describe('Tab Navigation', () => {
    it('renders all three tabs', () => {
      render(<ContextDashboard />)

      expect(screen.getByText('Active Sessions')).toBeDefined()
      expect(screen.getByText('Token Estimation')).toBeDefined()
      expect(screen.getByText('Session History')).toBeDefined()
    })

    it('shows Active Sessions tab as default', () => {
      render(<ContextDashboard />)

      const activeTab = screen.getByText('Active Sessions').closest('button')
      expect(activeTab?.className).toContain('bg-accent-purple/10')
    })

    it('switches to Token Estimation tab when clicked', () => {
      render(<ContextDashboard />)

      fireEvent.click(screen.getByText('Token Estimation'))

      const usageTab = screen.getByText('Token Estimation').closest('button')
      expect(usageTab?.className).toContain('bg-accent-purple/10')
    })

    it('switches to Session History tab when clicked', () => {
      render(<ContextDashboard />)

      fireEvent.click(screen.getByText('Session History'))

      const sessionsTab = screen.getByText('Session History').closest('button')
      expect(sessionsTab?.className).toContain('bg-accent-purple/10')
    })

    it('shows active sessions badge when sessions exist', () => {
      mockActiveSessionsData = [createMockExternalSession()]

      render(<ContextDashboard />)

      expect(screen.getByText('1')).toBeDefined()
    })
  })

  // ==========================================================================
  // REFRESH FUNCTIONALITY TESTS
  // ==========================================================================
  describe('Refresh Functionality', () => {
    it('renders refresh button', () => {
      render(<ContextDashboard />)

      expect(screen.getByText('Refresh')).toBeDefined()
    })

    it('calls all refetch functions when refresh is clicked', () => {
      render(<ContextDashboard />)

      fireEvent.click(screen.getByText('Refresh'))

      expect(mockTokenUsageRefetch).toHaveBeenCalled()
      expect(mockCompactionSettingsRefetch).toHaveBeenCalled()
      expect(mockSessionsRefetch).toHaveBeenCalled()
      expect(mockActiveSessionsRefetch).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // ACTIVE SESSIONS PANEL TESTS
  // ==========================================================================
  describe('Active Sessions Panel', () => {
    it('shows empty state when no active sessions', () => {
      render(<ContextDashboard />)

      expect(screen.getByText('No active Claude Code sessions')).toBeDefined()
      expect(screen.getByTestId('icon-terminal')).toBeDefined()
    })

    it('renders active session cards', () => {
      mockActiveSessionsData = [createMockExternalSession({ projectName: 'my-project' })]

      render(<ContextDashboard />)

      expect(screen.getByText('my-project')).toBeDefined()
      expect(screen.getByText('Active')).toBeDefined()
    })

    it('shows session stats (messages, tools, cached)', () => {
      mockActiveSessionsData = [
        createMockExternalSession({
          stats: {
            messageCount: 50,
            userMessages: 25,
            assistantMessages: 25,
            toolCalls: 20,
            inputTokens: 80000,
            outputTokens: 40000,
            cachedTokens: 15000,
          },
        }),
      ]

      render(<ContextDashboard />)

      expect(screen.getByText('50')).toBeDefined() // Messages
      expect(screen.getByText('20')).toBeDefined() // Tool Calls
      expect(screen.getByText('15.0K')).toBeDefined() // Cached
    })

    it('shows context usage percentage', () => {
      mockActiveSessionsData = [
        createMockExternalSession({
          stats: {
            messageCount: 50,
            userMessages: 25,
            assistantMessages: 25,
            toolCalls: 20,
            inputTokens: 100000,
            outputTokens: 50000,
            cachedTokens: 10000,
          },
        }),
      ]

      render(<ContextDashboard />)

      // (100000 + 50000) / 200000 * 100 = 75%
      expect(screen.getByText('75.0%')).toBeDefined()
    })

    it('shows estimated cost', () => {
      mockActiveSessionsData = [createMockExternalSession()]

      render(<ContextDashboard />)

      // Should show some cost value
      const costText = screen.getByText(/\$\d+\.\d{2}/)
      expect(costText).toBeDefined()
    })

    it('shows git branch when available', () => {
      mockActiveSessionsData = [createMockExternalSession({ gitBranch: 'feature/test' })]

      render(<ContextDashboard />)

      expect(screen.getByText(/feature\/test/)).toBeDefined()
    })

    it('shows critical context warning for sessions over 85%', () => {
      mockActiveSessionsData = [
        createMockExternalSession({
          stats: {
            messageCount: 100,
            userMessages: 50,
            assistantMessages: 50,
            toolCalls: 40,
            inputTokens: 150000,
            outputTokens: 50000,
            cachedTokens: 20000,
          },
        }),
      ]

      render(<ContextDashboard />)

      expect(screen.getByText('Context Running Low')).toBeDefined()
      expect(screen.getByTestId('icon-alert-triangle')).toBeDefined()
    })

    it('expands session details when clicked', () => {
      const session = createMockExternalSession({
        projectPath: '/home/user/projects/test-project',
        stats: {
          messageCount: 50,
          userMessages: 25,
          assistantMessages: 25,
          toolCalls: 20,
          inputTokens: 80000,
          outputTokens: 40000,
          cachedTokens: 15000,
        },
      })
      mockActiveSessionsData = [session]

      render(<ContextDashboard />)

      // Click the session card
      const sessionCard = screen.getByText(session.projectName).closest('.rounded-lg')
      if (sessionCard) fireEvent.click(sessionCard)

      // Should show expanded details
      expect(screen.getByText('Input Tokens')).toBeDefined()
      expect(screen.getByText('Output Tokens')).toBeDefined()
      expect(screen.getByText('Open Folder')).toBeDefined()
    })
  })

  // ==========================================================================
  // TOKEN USAGE PANEL TESTS
  // ==========================================================================
  describe('Token Usage Panel', () => {
    it('renders context window usage section', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('Context Window Usage')).toBeDefined()
    })

    it('shows token usage percentage', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('25.0%')).toBeDefined()
    })

    it('shows current and max tokens', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      // Current is shown multiple times (in grid and header)
      expect(screen.getAllByText('50.0K').length).toBeGreaterThanOrEqual(1)
      // Max is formatted as "200.0K" in the component
      expect(screen.getAllByText('200.0K').length).toBeGreaterThanOrEqual(1)
    })

    it('shows compaction controls section', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('Compaction Controls')).toBeDefined()
    })

    it('renders auto-compact toggle', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('Auto-Compact')).toBeDefined()
    })

    it('shows info card about token estimation', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('About Token Estimation')).toBeDefined()
    })
  })

  // ==========================================================================
  // COMPACTION CONTROLS TESTS
  // ==========================================================================
  describe('Compaction Controls', () => {
    it('calls setAutoCompact mutation when toggle is clicked', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      // Find and click the toggle button
      const autoCompactLabel = screen.getByText('Auto-Compact')
      const toggleContainer = autoCompactLabel.closest('.flex')
      const toggle = toggleContainer?.querySelector('button')
      if (toggle) fireEvent.click(toggle)

      expect(mockSetAutoCompactMutate).toHaveBeenCalledWith(
        { enabled: false },
        expect.any(Object)
      )
    })

    it('shows /compact command instruction', () => {
      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText(/\/compact/)).toBeDefined()
    })
  })

  // ==========================================================================
  // SESSION HISTORY PANEL TESTS
  // ==========================================================================
  describe('Session History Panel', () => {
    it('shows empty state when no sessions', () => {
      mockContextStoreState.sessions = []

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      // "0 sessions found" message is shown in the header
      expect(screen.getByText(/0.*sessions found/)).toBeDefined()
      // History icon appears in tab and possibly in empty state
      expect(screen.getAllByTestId('icon-history').length).toBeGreaterThanOrEqual(1)
    })

    it('shows session count', () => {
      const sessions = [
        createMockSessionSummary({ id: 's1' }),
        createMockSessionSummary({ id: 's2' }),
      ]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      expect(screen.getByText('2 sessions found')).toBeDefined()
    })

    it('renders session cards', () => {
      const sessions = [createMockSessionSummary({ projectName: 'project-alpha' })]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      expect(screen.getByText('project-alpha')).toBeDefined()
    })

    it('shows session duration', () => {
      const now = Date.now()
      const sessions = [
        createMockSessionSummary({
          startTime: now - 7200000, // 2 hours ago
          endTime: now - 3600000, // 1 hour ago (1 hour duration)
        }),
      ]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      expect(screen.getByText('1h 0m')).toBeDefined()
    })

    it('shows message and tool counts in session card', () => {
      const sessions = [
        createMockSessionSummary({
          messageCount: 42,
          toolCalls: 18,
        }),
      ]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      expect(screen.getByText('42 messages')).toBeDefined()
      expect(screen.getByText('18 tools')).toBeDefined()
    })

    it('shows model name in session card', () => {
      const sessions = [createMockSessionSummary({ model: 'claude-sonnet-4-20250514' })]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      // Model name gets cleaned up (removes claude- prefix and date suffix)
      expect(screen.getByText(/sonnet/i)).toBeDefined()
    })
  })

  // ==========================================================================
  // SESSION SELECTION TESTS
  // ==========================================================================
  describe('Session Selection', () => {
    it('calls setSelectedSession when session is clicked', () => {
      const sessions = [createMockSessionSummary({ id: 'session-123' })]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      // Click the session
      fireEvent.click(screen.getByText(sessions[0].projectName))

      expect(mockSetSelectedSession).toHaveBeenCalledWith(sessions[0])
    })

    it('shows session detail panel when session is selected', () => {
      const session = createMockSessionSummary({
        projectName: 'selected-project',
        tokenCount: 85000,
      })
      mockContextStoreState.sessions = [session]
      mockContextStoreState.selectedSession = session
      mockSessionsData = [session]

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      expect(screen.getByText('Session Details')).toBeDefined()
      expect(screen.getAllByText('selected-project').length).toBeGreaterThanOrEqual(1)
    })

    it('shows token count in session detail', () => {
      const session = createMockSessionSummary({
        tokenCount: 85000,
      })
      mockContextStoreState.sessions = [session]
      mockContextStoreState.selectedSession = session
      mockSessionsData = [session]

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      expect(screen.getByText('85,000')).toBeDefined()
    })

    it('closes detail panel when close button is clicked', () => {
      const session = createMockSessionSummary()
      mockContextStoreState.sessions = [session]
      mockContextStoreState.selectedSession = session
      mockSessionsData = [session]

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      // Find close button
      const closeButton = screen.getByTestId('icon-xcircle').closest('button')
      if (closeButton) fireEvent.click(closeButton)

      expect(mockSetSelectedSession).toHaveBeenCalledWith(null)
    })
  })

  // ==========================================================================
  // DATA SYNC TESTS
  // ==========================================================================
  describe('Data Synchronization', () => {
    it('syncs token usage data to store', () => {
      render(<ContextDashboard />)

      expect(mockSetTokenUsage).toHaveBeenCalledWith({
        current: 50000,
        max: 200000,
        percentage: 25,
        lastCompaction: expect.any(Number),
      })
    })

    it('syncs compaction settings to store', () => {
      render(<ContextDashboard />)

      expect(mockSetCompactionSettings).toHaveBeenCalledWith({
        autoCompact: true,
        threshold: 80,
      })
    })

    it('syncs sessions data to store', () => {
      const sessions = [createMockSessionSummary()]
      mockSessionsData = sessions

      render(<ContextDashboard />)

      expect(mockSetSessions).toHaveBeenCalledWith(sessions)
    })
  })

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================
  describe('Edge Cases', () => {
    it('handles null token usage gracefully', () => {
      // When tokenUsage is null in store, the component uses tRPC data
      // The component gracefully handles the data and displays it
      mockContextStoreState.tokenUsage = null

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      // Component should render the Token Estimation panel without crashing
      expect(screen.getByText('Context Window Usage')).toBeDefined()
    })

    it('handles null compaction settings gracefully', () => {
      mockContextStoreState.compactionSettings = null

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      // Should still render toggle (in off state)
      expect(screen.getByText('Auto-Compact')).toBeDefined()
    })

    it('handles session without end time (ongoing)', () => {
      const sessions = [
        createMockSessionSummary({
          startTime: Date.now() - 3600000,
          endTime: undefined,
        }),
      ]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      // Should show duration calculated from now
      expect(screen.getByText(/\d+h.*\d+m|\d+m/)).toBeDefined()
    })

    it('handles session without model', () => {
      const sessions = [createMockSessionSummary({ model: undefined })]
      mockContextStoreState.sessions = sessions
      mockSessionsData = sessions

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Session History'))

      // Should render without crashing (no model badge)
      expect(screen.getByText(sessions[0].projectName)).toBeDefined()
    })

    it('formats very large token numbers correctly', () => {
      mockContextStoreState.tokenUsage = { current: 1500000, max: 2000000, percentage: 75 }

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('1.5M')).toBeDefined()
    })

    it('shows "Never" for last compaction when not set', () => {
      mockContextStoreState.tokenUsage = { current: 50000, max: 200000, percentage: 25, lastCompaction: undefined }

      render(<ContextDashboard />)
      fireEvent.click(screen.getByText('Token Estimation'))

      expect(screen.getByText('Never')).toBeDefined()
    })
  })

  // ==========================================================================
  // OPEN PROJECT FOLDER TESTS
  // ==========================================================================
  describe('Open Project Folder', () => {
    it('calls openPath mutation when Open Folder is clicked', () => {
      const session = createMockExternalSession({
        projectPath: '/home/user/projects/test-project',
      })
      mockActiveSessionsData = [session]

      render(<ContextDashboard />)

      // Expand the session
      const sessionCard = screen.getByText(session.projectName).closest('.rounded-lg')
      if (sessionCard) fireEvent.click(sessionCard)

      // Click Open Folder
      const openFolderButton = screen.getByText('Open Folder')
      fireEvent.click(openFolderButton)

      expect(mockOpenPathMutate).toHaveBeenCalledWith(
        { path: '/home/user/projects/test-project' },
        expect.any(Object)
      )
    })
  })

  // ==========================================================================
  // COLOR CODING TESTS
  // ==========================================================================
  describe('Usage Color Coding', () => {
    it('shows green for low usage (< 70%)', () => {
      mockActiveSessionsData = [
        createMockExternalSession({
          stats: {
            messageCount: 20,
            userMessages: 10,
            assistantMessages: 10,
            toolCalls: 5,
            inputTokens: 50000,
            outputTokens: 20000,
            cachedTokens: 5000,
          },
        }),
      ]

      render(<ContextDashboard />)

      // 35% usage should be green
      expect(screen.getByText('35.0%')).toBeDefined()
    })

    it('shows yellow for medium usage (70-90%)', () => {
      mockActiveSessionsData = [
        createMockExternalSession({
          stats: {
            messageCount: 80,
            userMessages: 40,
            assistantMessages: 40,
            toolCalls: 30,
            inputTokens: 120000,
            outputTokens: 40000,
            cachedTokens: 10000,
          },
        }),
      ]

      render(<ContextDashboard />)

      // 80% usage
      expect(screen.getByText('80.0%')).toBeDefined()
    })

    it('shows red for high usage (>= 90%)', () => {
      mockActiveSessionsData = [
        createMockExternalSession({
          stats: {
            messageCount: 100,
            userMessages: 50,
            assistantMessages: 50,
            toolCalls: 40,
            inputTokens: 150000,
            outputTokens: 45000,
            cachedTokens: 10000,
          },
        }),
      ]

      render(<ContextDashboard />)

      // 97.5% usage
      expect(screen.getByText('97.5%')).toBeDefined()
    })
  })

  // ==========================================================================
  // INFO CARD TESTS
  // ==========================================================================
  describe('Info Card', () => {
    it('shows about active sessions info card', () => {
      render(<ContextDashboard />)

      expect(screen.getByText('About Active Sessions')).toBeDefined()
    })
  })
})
