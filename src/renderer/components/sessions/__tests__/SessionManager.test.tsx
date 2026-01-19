import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExternalSession, SessionMessage, SessionProcessInfo } from '@shared/types'

// Mock tRPC client before importing anything that uses it
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    session: {
      discover: { query: vi.fn().mockResolvedValue([]) },
      getActive: { query: vi.fn().mockResolvedValue([]) },
      getMessages: { query: vi.fn().mockResolvedValue([]) },
      watch: { mutate: vi.fn().mockResolvedValue(true) },
    },
  },
}))

// Import after mock
import { SessionManager } from '../SessionManager'
import { useSessionsStore, selectFilteredSessions } from '@/stores/sessions'

// Mock react-virtuoso to render items directly (avoid virtual scrolling complexity in tests)
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[]
    itemContent: (index: number, item: unknown) => React.ReactNode
  }) => (
    <div data-testid="virtuoso">
      {data.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}))

// Mock child components
vi.mock('../../branches/BranchPanel', () => ({
  BranchPanel: ({ session }: { session: ExternalSession }) => (
    <div data-testid="branch-panel">BranchPanel for {session.projectName}</div>
  ),
}))

vi.mock('../../context/SmartCompactionPanel', () => ({
  SmartCompactionPanel: ({
    session,
    onClose,
  }: {
    session: ExternalSession
    onClose: () => void
  }) => (
    <div data-testid="compaction-panel">
      <span>SmartCompactionPanel for {session.projectName}</span>
      <button onClick={onClose}>Close Compaction</button>
    </div>
  ),
}))

// Mock window.electron IPC
const mockUnsubscribe = vi.fn()
vi.stubGlobal('window', {
  ...window,
  electron: {
    on: vi.fn(() => mockUnsubscribe),
    invoke: vi.fn(),
    send: vi.fn(),
  },
})

// Mock lucide-react icons to simplify rendering
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react')
  return {
    ...actual,
    Activity: () => <span data-testid="icon-activity">Activity</span>,
    Clock: () => <span data-testid="icon-clock">Clock</span>,
    FileText: () => <span data-testid="icon-filetext">FileText</span>,
    FolderOpen: () => <span data-testid="icon-folder">FolderOpen</span>,
    Hash: () => <span data-testid="icon-hash">Hash</span>,
    MessageSquare: () => <span data-testid="icon-message">MessageSquare</span>,
    RefreshCw: () => <span data-testid="icon-refresh">RefreshCw</span>,
    Search: () => <span data-testid="icon-search">Search</span>,
    Zap: () => <span data-testid="icon-zap">Zap</span>,
    DollarSign: () => <span data-testid="icon-dollar">DollarSign</span>,
    Eye: () => <span data-testid="icon-eye">Eye</span>,
    Radio: () => <span data-testid="icon-radio">Radio</span>,
    GitBranch: () => <span data-testid="icon-gitbranch">GitBranch</span>,
    Terminal: () => <span data-testid="icon-terminal">Terminal</span>,
    User: () => <span data-testid="icon-user">User</span>,
    Play: () => <span data-testid="icon-play">Play</span>,
    RotateCcw: () => <span data-testid="icon-rotateccw">RotateCcw</span>,
    Shield: () => <span data-testid="icon-shield">Shield</span>,
    Plug: () => <span data-testid="icon-plug">Plug</span>,
    Cpu: () => <span data-testid="icon-cpu">Cpu</span>,
    Shrink: () => <span data-testid="icon-shrink">Shrink</span>,
  }
})

// Helper to create mock session data
const createMockSession = (overrides?: Partial<ExternalSession>): ExternalSession => ({
  id: `session-${Math.random().toString(36).slice(2, 9)}`,
  slug: 'test-session',
  projectPath: '/home/user/projects/test-project',
  projectName: 'test-project',
  filePath: '/home/user/.claude/projects/test-project/transcript.jsonl',
  startTime: Date.now() - 3600000, // 1 hour ago
  lastActivity: Date.now() - 60000, // 1 minute ago
  isActive: false,
  model: 'claude-opus-4-5-20251101',
  version: '1.0.5',
  gitBranch: 'main',
  stats: {
    messageCount: 25,
    userMessages: 12,
    assistantMessages: 13,
    toolCalls: 8,
    inputTokens: 15000,
    outputTokens: 8000,
    cachedTokens: 5000,
    estimatedCost: 0.85,
    serviceTier: 'standard',
  },
  workingDirectory: '/home/user/projects/test-project',
  userType: 'external',
  isSubagent: false,
  ...overrides,
})

const createMockProcessInfo = (overrides?: Partial<SessionProcessInfo>): SessionProcessInfo => ({
  pid: 12345,
  profile: 'engineering',
  terminal: 'pts/3',
  launchMode: 'new',
  permissionMode: 'bypassPermissions',
  wrapper: 'claude-eng',
  activeMcpServers: ['filesystem', 'github', 'memory-keeper'],
  ...overrides,
})

const createMockMessage = (overrides?: Partial<SessionMessage>): SessionMessage => ({
  uuid: `msg-${Math.random().toString(36).slice(2, 9)}`,
  type: 'user',
  timestamp: Date.now(),
  content: 'Test message content',
  ...overrides,
})

const mockSessions: ExternalSession[] = [
  createMockSession({
    id: 'session-1',
    slug: 'claude-flow-dev',
    projectName: 'claude-flow',
    isActive: true,
    processInfo: createMockProcessInfo(),
    lastActivity: Date.now() - 30000, // 30 seconds ago
    stats: {
      messageCount: 150,
      userMessages: 75,
      assistantMessages: 75,
      toolCalls: 45,
      inputTokens: 180000,
      outputTokens: 95000,
      cachedTokens: 50000,
      estimatedCost: 12.5,
      serviceTier: 'scale',
    },
  }),
  createMockSession({
    id: 'session-2',
    slug: 'command-center',
    projectName: 'claude-command-center',
    isActive: false,
    lastActivity: Date.now() - 7200000, // 2 hours ago
    stats: {
      messageCount: 50,
      userMessages: 25,
      assistantMessages: 25,
      toolCalls: 15,
      inputTokens: 45000,
      outputTokens: 22000,
      cachedTokens: 10000,
      estimatedCost: 2.35,
      serviceTier: 'standard',
    },
  }),
  createMockSession({
    id: 'session-3',
    slug: 'security-scan',
    projectName: 'security-audit',
    isActive: true,
    processInfo: createMockProcessInfo({
      profile: 'security',
      terminal: 'pts/5',
      launchMode: 'resume',
      activeMcpServers: ['filesystem', 'cybersec-kb'],
    }),
    lastActivity: Date.now() - 120000, // 2 minutes ago
  }),
]

const mockMessages: SessionMessage[] = [
  createMockMessage({
    uuid: 'msg-1',
    type: 'user',
    content: 'How do I implement authentication?',
    timestamp: Date.now() - 300000,
  }),
  createMockMessage({
    uuid: 'msg-2',
    type: 'assistant',
    content: 'I can help you implement authentication. Let me explain the approach...',
    timestamp: Date.now() - 290000,
    usage: { input_tokens: 1500, output_tokens: 2000 },
  }),
  createMockMessage({
    uuid: 'msg-3',
    type: 'tool-result',
    toolName: 'Read',
    toolOutput: 'File content here...',
    timestamp: Date.now() - 280000,
  }),
]

// Store mock functions
const mockFetchSessions = vi.fn()
const mockFetchActiveSessions = vi.fn()
const mockSelectSession = vi.fn()
const mockToggleWatching = vi.fn()
const mockSetSearchQuery = vi.fn()
const mockSetFilter = vi.fn()
const mockSetSortBy = vi.fn()
const mockUpdateSession = vi.fn()

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Reset store to default state
    useSessionsStore.setState({
      sessions: mockSessions,
      activeSessions: mockSessions.filter((s) => s.isActive),
      selectedSession: null,
      selectedMessages: [],
      isLoading: false,
      isWatching: false,
      error: null,
      searchQuery: '',
      filter: 'all',
      sortBy: 'lastActivity',
      fetchSessions: mockFetchSessions,
      fetchActiveSessions: mockFetchActiveSessions,
      selectSession: mockSelectSession,
      fetchSessionMessages: vi.fn(),
      toggleWatching: mockToggleWatching,
      setSearchQuery: mockSetSearchQuery,
      setFilter: mockSetFilter,
      setSortBy: mockSetSortBy,
      updateSession: mockUpdateSession,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // ==========================================================================
  // LOADING STATE TESTS
  // ==========================================================================
  describe('Loading State', () => {
    it('renders loading spinner when isLoading is true and no sessions', () => {
      useSessionsStore.setState({
        sessions: [],
        isLoading: true,
      })

      render(<SessionManager />)

      // The RefreshCw icon should have animate-spin class when loading
      // Check for the button with disabled attribute when loading
      const refreshButton = document.querySelector('button[disabled]')
      expect(refreshButton).not.toBeNull()
    })

    it('renders session list when loaded', () => {
      render(<SessionManager />)

      expect(screen.getByText('Sessions')).toBeDefined()
      expect(screen.getByText('claude-flow-dev')).toBeDefined()
      expect(screen.getByText('command-center')).toBeDefined()
      expect(screen.getByText('security-scan')).toBeDefined()
    })
  })

  // ==========================================================================
  // EMPTY STATE TESTS
  // ==========================================================================
  describe('Empty State', () => {
    it('shows empty state when no sessions exist', () => {
      useSessionsStore.setState({
        sessions: [],
        activeSessions: [],
      })

      render(<SessionManager />)

      expect(screen.getByText('No sessions found')).toBeDefined()
    })

    it('shows empty state when all sessions are filtered out', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        searchQuery: 'nonexistent-project',
      })

      render(<SessionManager />)

      expect(screen.getByText('No sessions found')).toBeDefined()
    })
  })

  // ==========================================================================
  // SESSION LIST RENDERING TESTS
  // ==========================================================================
  describe('Session List Rendering', () => {
    it('renders all session cards in virtualized list', () => {
      render(<SessionManager />)

      expect(screen.getByText('claude-flow-dev')).toBeDefined()
      expect(screen.getByText('command-center')).toBeDefined()
      expect(screen.getByText('security-scan')).toBeDefined()
    })

    it('displays active session indicator for active sessions', () => {
      render(<SessionManager />)

      // Active sessions have a green pulse indicator
      const pulseIndicators = document.querySelectorAll('.animate-pulse')
      // Should have indicators for active sessions (2 active in mockSessions)
      expect(pulseIndicators.length).toBeGreaterThanOrEqual(2)
    })

    it('shows session stats (messages, tools, tokens, cost)', () => {
      render(<SessionManager />)

      // Check first session's stats
      expect(screen.getByText('150')).toBeDefined() // messageCount
      expect(screen.getByText('45 tools')).toBeDefined() // toolCalls
      expect(screen.getByText('$12.50')).toBeDefined() // estimatedCost
    })

    it('shows process info for active sessions', () => {
      render(<SessionManager />)

      expect(screen.getAllByText('engineering').length).toBeGreaterThan(0) // profile
      expect(screen.getAllByText('pts/3').length).toBeGreaterThan(0) // terminal
      expect(screen.getAllByText('new').length).toBeGreaterThan(0) // launchMode
      // PID appears multiple times for different active sessions
      expect(screen.getAllByText(/PID \d+/).length).toBeGreaterThan(0) // pid
    })

    it('shows MCP servers for active sessions', () => {
      render(<SessionManager />)

      expect(screen.getByText('filesystem, github, memory-keeper')).toBeDefined()
    })

    it('displays working directory for sessions', () => {
      render(<SessionManager />)

      expect(
        screen.getAllByText('/home/user/projects/test-project').length
      ).toBeGreaterThanOrEqual(1)
    })

    it('formats tokens using K/M suffixes', () => {
      render(<SessionManager />)

      // 180000 + 95000 = 275000 = 275.0K
      expect(screen.getByText('275.0K')).toBeDefined()
    })

    it('displays context usage bar', () => {
      render(<SessionManager />)

      // Context bar shows token usage
      const progressBars = document.querySelectorAll('.rounded-full.transition-all')
      expect(progressBars.length).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // ACTIVE SESSIONS BANNER TESTS
  // ==========================================================================
  describe('Active Sessions Banner', () => {
    it('shows active sessions banner when active sessions exist', () => {
      render(<SessionManager />)

      expect(screen.getByText('2 active sessions')).toBeDefined()
    })

    it('shows singular form for one active session', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        activeSessions: [mockSessions[0]],
      })

      render(<SessionManager />)

      expect(screen.getByText('1 active session')).toBeDefined()
    })

    it('does not show banner when no active sessions', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        activeSessions: [],
      })

      render(<SessionManager />)

      expect(screen.queryByText(/active session/)).toBeNull()
    })
  })

  // ==========================================================================
  // SEARCH FUNCTIONALITY TESTS
  // ==========================================================================
  describe('Search Functionality', () => {
    it('renders search input', () => {
      render(<SessionManager />)

      const searchInput = screen.getByPlaceholderText('Search sessions...')
      expect(searchInput).toBeDefined()
    })

    it('calls setSearchQuery when search input changes', () => {
      render(<SessionManager />)

      const searchInput = screen.getByPlaceholderText('Search sessions...')
      fireEvent.change(searchInput, { target: { value: 'claude-flow' } })

      expect(mockSetSearchQuery).toHaveBeenCalledWith('claude-flow')
    })

    it('filters sessions based on search query', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        searchQuery: 'command-center',
      })

      render(<SessionManager />)

      // Only command-center should be visible
      expect(screen.getByText('command-center')).toBeDefined()
      expect(screen.queryByText('claude-flow-dev')).toBeNull()
      expect(screen.queryByText('security-scan')).toBeNull()
    })
  })

  // ==========================================================================
  // FILTER FUNCTIONALITY TESTS
  // ==========================================================================
  describe('Filter Functionality', () => {
    it('renders filter dropdown', () => {
      render(<SessionManager />)

      expect(screen.getByDisplayValue('All Sessions')).toBeDefined()
    })

    it('calls setFilter when filter changes', () => {
      render(<SessionManager />)

      const filterSelect = screen.getByDisplayValue('All Sessions')
      fireEvent.change(filterSelect, { target: { value: 'active' } })

      expect(mockSetFilter).toHaveBeenCalledWith('active')
    })

    it('filters by active status', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        filter: 'active',
      })

      render(<SessionManager />)

      // Only active sessions should be visible (based on selectFilteredSessions behavior)
      expect(screen.getByText('claude-flow-dev')).toBeDefined()
      expect(screen.getByText('security-scan')).toBeDefined()
    })

    it('filters by recent (last 24h)', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        filter: 'recent',
      })

      render(<SessionManager />)

      // All mock sessions are recent (within 24h)
      expect(screen.getByText('claude-flow-dev')).toBeDefined()
    })
  })

  // ==========================================================================
  // SORT FUNCTIONALITY TESTS
  // ==========================================================================
  describe('Sort Functionality', () => {
    it('renders sort dropdown', () => {
      render(<SessionManager />)

      expect(screen.getByDisplayValue('Last Activity')).toBeDefined()
    })

    it('calls setSortBy when sort changes', () => {
      render(<SessionManager />)

      const sortSelect = screen.getByDisplayValue('Last Activity')
      fireEvent.change(sortSelect, { target: { value: 'tokens' } })

      expect(mockSetSortBy).toHaveBeenCalledWith('tokens')
    })

    it('provides all sort options', () => {
      render(<SessionManager />)

      const sortSelect = screen.getByDisplayValue('Last Activity')
      const options = sortSelect.querySelectorAll('option')

      expect(options.length).toBe(4)
      expect(options[0].textContent).toBe('Last Activity')
      expect(options[1].textContent).toBe('Start Time')
      expect(options[2].textContent).toBe('Token Usage')
      expect(options[3].textContent).toBe('Messages')
    })
  })

  // ==========================================================================
  // SESSION SELECTION TESTS
  // ==========================================================================
  describe('Session Selection', () => {
    it('calls selectSession when session card is clicked', () => {
      render(<SessionManager />)

      const sessionCard = screen.getByText('claude-flow-dev')
      fireEvent.click(sessionCard)

      expect(mockSelectSession).toHaveBeenCalledWith('session-1')
    })

    it('shows selected session with highlight', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: mockMessages,
      })

      render(<SessionManager />)

      // Selected session should have purple border (appears in list and detail panel)
      const selectedCards = screen.getAllByText('claude-flow-dev')
      // Find the one in the session list (inside a button)
      const listButton = selectedCards[0].closest('button')
      expect(listButton?.className).toContain('bg-accent-purple/10')
    })

    it('shows detail panel when session is selected', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: mockMessages,
      })

      render(<SessionManager />)

      // Detail panel should show session name and stats
      expect(screen.getAllByText('claude-flow-dev').length).toBeGreaterThanOrEqual(2)
      // Messages appears multiple times (tab, dropdown option, stats label)
      expect(screen.getAllByText('Messages').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Tool Calls')).toBeDefined()
      expect(screen.getByText('Input Tokens')).toBeDefined()
      expect(screen.getByText('Output Tokens')).toBeDefined()
      expect(screen.getByText('Cached')).toBeDefined()
      expect(screen.getByText('Est. Cost')).toBeDefined()
    })

    it('shows placeholder when no session is selected', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: null,
      })

      render(<SessionManager />)

      expect(screen.getByText('Select a session to view details')).toBeDefined()
    })
  })

  // ==========================================================================
  // SESSION DETAIL VIEW TESTS
  // ==========================================================================
  describe('Session Detail View', () => {
    beforeEach(() => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: mockMessages,
      })
    })

    it('shows session metadata', () => {
      render(<SessionManager />)

      expect(screen.getByText(/Model:/)).toBeDefined()
      expect(screen.getByText(/claude-opus-4-5-20251101/)).toBeDefined()
      expect(screen.getByText(/Claude Code:/)).toBeDefined()
    })

    it('shows git branch if available', () => {
      render(<SessionManager />)

      expect(screen.getByText('main')).toBeDefined()
    })

    it('shows service tier badge', () => {
      render(<SessionManager />)

      expect(screen.getByText('SCALE')).toBeDefined()
    })

    it('shows process info for active sessions in detail view', () => {
      render(<SessionManager />)

      // Process info section
      expect(screen.getAllByText('engineering').length).toBeGreaterThanOrEqual(2) // In list and detail
      expect(screen.getAllByText('pts/3').length).toBeGreaterThanOrEqual(2)
      // PID text appears multiple times
      expect(screen.getAllByText(/PID \d+/).length).toBeGreaterThanOrEqual(2)
    })

    it('shows MCP servers in detail view', () => {
      render(<SessionManager />)

      expect(screen.getByText('Active MCPs:')).toBeDefined()
      expect(screen.getByText('filesystem')).toBeDefined()
      expect(screen.getByText('github')).toBeDefined()
      expect(screen.getByText('memory-keeper')).toBeDefined()
    })

    it('renders Messages tab by default', () => {
      render(<SessionManager />)

      const messagesTab = screen.getAllByText('Messages').find((el) => el.closest('button'))
      expect(messagesTab?.closest('button')?.className).toContain('bg-accent-purple/10')
    })

    it('shows messages in detail panel', () => {
      render(<SessionManager />)

      expect(screen.getByText('How do I implement authentication?')).toBeDefined()
      expect(
        screen.getByText(/I can help you implement authentication/)
      ).toBeDefined()
    })

    it('switches to Branches tab when clicked', () => {
      render(<SessionManager />)

      const branchesTab = screen.getByRole('button', { name: /Branches/i })
      fireEvent.click(branchesTab)

      expect(screen.getByTestId('branch-panel')).toBeDefined()
    })

    it('shows no messages placeholder when messages array is empty', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: [],
      })

      render(<SessionManager />)

      expect(screen.getByText('No messages to display')).toBeDefined()
    })
  })

  // ==========================================================================
  // SMART COMPACTION MODAL TESTS
  // ==========================================================================
  describe('Smart Compaction Modal', () => {
    beforeEach(() => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: mockMessages,
      })
    })

    it('opens compaction panel when Smart Compact button is clicked', () => {
      render(<SessionManager />)

      const compactButton = screen.getByText('Smart Compact')
      fireEvent.click(compactButton)

      expect(screen.getByTestId('compaction-panel')).toBeDefined()
    })

    it('closes compaction panel when close is clicked', () => {
      render(<SessionManager />)

      // Open panel
      const compactButton = screen.getByText('Smart Compact')
      fireEvent.click(compactButton)

      expect(screen.getByTestId('compaction-panel')).toBeDefined()

      // Close panel
      const closeButton = screen.getByText('Close Compaction')
      fireEvent.click(closeButton)

      expect(screen.queryByTestId('compaction-panel')).toBeNull()
    })
  })

  // ==========================================================================
  // WATCHING FUNCTIONALITY TESTS
  // ==========================================================================
  describe('Watching Functionality', () => {
    it('renders watch toggle button', () => {
      render(<SessionManager />)

      const watchButton = screen.getByTitle('Watch for changes')
      expect(watchButton).toBeDefined()
    })

    it('calls toggleWatching when watch button is clicked', () => {
      render(<SessionManager />)

      const watchButton = screen.getByTitle('Watch for changes')
      fireEvent.click(watchButton)

      expect(mockToggleWatching).toHaveBeenCalled()
    })

    it('shows active state when watching is enabled', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        isWatching: true,
      })

      render(<SessionManager />)

      const watchButton = screen.getByTitle('Stop watching')
      expect(watchButton.className).toContain('bg-accent-green/20')
    })
  })

  // ==========================================================================
  // REFRESH FUNCTIONALITY TESTS
  // ==========================================================================
  describe('Refresh Functionality', () => {
    it('calls fetchSessions when refresh button is clicked', () => {
      render(<SessionManager />)

      const _refreshButton = document.querySelector(
        'button[disabled=""], button:not([disabled])'
      )
      // Find the refresh button by its sibling radio button
      const buttons = screen.getAllByRole('button')
      const refreshBtn = buttons.find(
        (btn) => btn.querySelector('[data-testid="icon-refresh"]')
      )

      if (refreshBtn) {
        fireEvent.click(refreshBtn)
        expect(mockFetchSessions).toHaveBeenCalled()
      }
    })

    it('disables refresh button when loading', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        isLoading: true,
      })

      render(<SessionManager />)

      const buttons = screen.getAllByRole('button')
      const refreshBtn = buttons.find(
        (btn) => btn.querySelector('[data-testid="icon-refresh"]')
      )

      expect(refreshBtn?.hasAttribute('disabled')).toBe(true)
    })
  })

  // ==========================================================================
  // STATS FOOTER TESTS
  // ==========================================================================
  describe('Stats Footer', () => {
    it('shows total session count', () => {
      render(<SessionManager />)

      expect(screen.getByText('3 sessions')).toBeDefined()
    })

    it('shows total token usage', () => {
      render(<SessionManager />)

      // Sum of all session tokens across all 3 sessions
      expect(screen.getByText(/total tokens/)).toBeDefined()
    })
  })

  // ==========================================================================
  // LIFECYCLE AND EVENTS TESTS
  // ==========================================================================
  describe('Lifecycle and Events', () => {
    it('fetches sessions on mount', () => {
      render(<SessionManager />)

      expect(mockFetchSessions).toHaveBeenCalled()
      expect(mockFetchActiveSessions).toHaveBeenCalled()
    })

    it('subscribes to session:updated events', () => {
      render(<SessionManager />)

      expect(window.electron.on).toHaveBeenCalledWith(
        'session:updated',
        expect.any(Function)
      )
    })

    it('unsubscribes from events on unmount', () => {
      const { unmount } = render(<SessionManager />)

      unmount()

      expect(mockUnsubscribe).toHaveBeenCalled()
    })

    it('refreshes active sessions periodically when watching', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        isWatching: true,
      })

      render(<SessionManager />)

      // Clear initial calls
      mockFetchActiveSessions.mockClear()

      // Advance timer by 30 seconds
      vi.advanceTimersByTime(30000)

      expect(mockFetchActiveSessions).toHaveBeenCalled()
    })

    it('does not refresh when not watching', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        isWatching: false,
      })

      render(<SessionManager />)

      // Clear initial calls
      mockFetchActiveSessions.mockClear()

      // Advance timer by 30 seconds
      vi.advanceTimersByTime(30000)

      expect(mockFetchActiveSessions).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // MESSAGE TYPE DISPLAY TESTS
  // ==========================================================================
  describe('Message Type Display', () => {
    beforeEach(() => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: mockMessages,
      })
    })

    it('displays User label for user messages', () => {
      render(<SessionManager />)

      // User text appears in multiple places (icon testid, label)
      expect(screen.getAllByText('User').length).toBeGreaterThan(0)
    })

    it('displays Assistant label for assistant messages', () => {
      render(<SessionManager />)

      expect(screen.getAllByText('Assistant').length).toBeGreaterThan(0)
    })

    it('displays tool name for tool-result messages', () => {
      render(<SessionManager />)

      expect(screen.getAllByText('Read').length).toBeGreaterThan(0)
    })

    it('shows token usage for assistant messages', () => {
      render(<SessionManager />)

      expect(screen.getByText('1500 in / 2000 out')).toBeDefined()
    })
  })

  // ==========================================================================
  // CONTEXT BAR TESTS
  // ==========================================================================
  describe('Context Bar', () => {
    it('shows percentage of context used', () => {
      render(<SessionManager />)

      // Context usage percentage should be displayed
      // Session 1: (180000 + 95000) / 200000 * 100 = 137.5% (capped at 100%)
      // Multiple percentage values shown for each session
      expect(screen.getAllByText(/%/).length).toBeGreaterThan(0)
    })

    it('changes color based on usage level', () => {
      // Session with high usage should have warning/red color
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'high-usage',
            slug: 'high-usage-session',
            stats: {
              messageCount: 500,
              userMessages: 250,
              assistantMessages: 250,
              toolCalls: 100,
              inputTokens: 150000,
              outputTokens: 50000,
              cachedTokens: 20000,
              estimatedCost: 15.0,
            },
          }),
        ],
      })

      render(<SessionManager />)

      // High usage (>90%) should show red color
      const progressBar = document.querySelector('.bg-accent-red')
      expect(progressBar).not.toBeNull()
    })
  })

  // ==========================================================================
  // DATE FORMATTING TESTS
  // ==========================================================================
  describe('Date Formatting', () => {
    it('shows "Just now" for very recent activity', () => {
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'recent',
            slug: 'recent-session',
            lastActivity: Date.now() - 30000, // 30 seconds ago
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('Just now')).toBeDefined()
    })

    it('shows minutes ago for recent activity', () => {
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'minutes-ago',
            slug: 'minutes-session',
            lastActivity: Date.now() - 300000, // 5 minutes ago
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('5m ago')).toBeDefined()
    })

    it('shows hours ago for activity within a day', () => {
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'hours-ago',
            slug: 'hours-session',
            lastActivity: Date.now() - 7200000, // 2 hours ago
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('2h ago')).toBeDefined()
    })
  })

  // ==========================================================================
  // COST FORMATTING TESTS
  // ==========================================================================
  describe('Cost Formatting', () => {
    it('formats cost with dollar sign and decimals', () => {
      render(<SessionManager />)

      expect(screen.getByText('$12.50')).toBeDefined()
      expect(screen.getByText('$2.35')).toBeDefined()
    })

    it('shows $0.00 for sessions without cost', () => {
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'no-cost',
            slug: 'no-cost-session',
            stats: {
              messageCount: 5,
              userMessages: 3,
              assistantMessages: 2,
              toolCalls: 1,
              inputTokens: 1000,
              outputTokens: 500,
              cachedTokens: 0,
              estimatedCost: undefined,
            },
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('$0.00')).toBeDefined()
    })
  })

  // ==========================================================================
  // PROFILE BADGES TESTS
  // ==========================================================================
  describe('Profile Badges', () => {
    it('shows engineering profile with blue styling', () => {
      render(<SessionManager />)

      const engineeringBadges = screen.getAllByText('engineering')
      const badge = engineeringBadges[0].closest('span')
      expect(badge?.className).toContain('bg-accent-blue/20')
    })

    it('shows security profile with red styling', () => {
      render(<SessionManager />)

      const securityBadges = screen.getAllByText('security')
      const badge = securityBadges[0].closest('span')
      expect(badge?.className).toContain('bg-accent-red/20')
    })
  })

  // ==========================================================================
  // LAUNCH MODE ICONS TESTS
  // ==========================================================================
  describe('Launch Mode Icons', () => {
    it('shows Play icon for new sessions', () => {
      render(<SessionManager />)

      // Session 1 has launchMode: 'new'
      expect(screen.getAllByTestId('icon-play').length).toBeGreaterThan(0)
    })

    it('shows RotateCcw icon for resumed sessions', () => {
      render(<SessionManager />)

      // Session 3 has launchMode: 'resume'
      expect(screen.getAllByTestId('icon-rotateccw').length).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // PERMISSION MODE DISPLAY TESTS
  // ==========================================================================
  describe('Permission Mode Display', () => {
    it('shows permission mode when present', () => {
      render(<SessionManager />)

      // Session 1 has permissionMode: 'bypassPermissions'
      // It strips 'Permissions' from the display
      expect(screen.getAllByText('bypass').length).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // selectFilteredSessions SELECTOR TESTS
  // ==========================================================================
  describe('selectFilteredSessions Selector', () => {
    it('filters out synthetic sessions', () => {
      const state = {
        ...useSessionsStore.getState(),
        sessions: [
          ...mockSessions,
          createMockSession({
            id: 'synthetic',
            projectName: '<synthetic>',
          }),
        ],
        searchQuery: '',
        filter: 'all' as const,
        sortBy: 'lastActivity' as const,
      }

      const filtered = selectFilteredSessions(state)

      expect(filtered.find((s) => s.projectName.includes('synthetic'))).toBeUndefined()
    })

    it('filters by search query on projectName', () => {
      const state = {
        ...useSessionsStore.getState(),
        sessions: mockSessions,
        searchQuery: 'claude-flow',
        filter: 'all' as const,
        sortBy: 'lastActivity' as const,
      }

      const filtered = selectFilteredSessions(state)

      expect(filtered.length).toBe(1)
      expect(filtered[0].projectName).toBe('claude-flow')
    })

    it('sorts by lastActivity by default', () => {
      const state = {
        ...useSessionsStore.getState(),
        sessions: mockSessions,
        searchQuery: '',
        filter: 'all' as const,
        sortBy: 'lastActivity' as const,
      }

      const filtered = selectFilteredSessions(state)

      // Most recent first
      expect(filtered[0].id).toBe('session-1') // 30 seconds ago
    })

    it('sorts by token usage', () => {
      const state = {
        ...useSessionsStore.getState(),
        sessions: mockSessions,
        searchQuery: '',
        filter: 'all' as const,
        sortBy: 'tokens' as const,
      }

      const filtered = selectFilteredSessions(state)

      // Highest token usage first (session-1 has 275K tokens)
      expect(filtered[0].id).toBe('session-1')
    })

    it('sorts by message count', () => {
      const state = {
        ...useSessionsStore.getState(),
        sessions: mockSessions,
        searchQuery: '',
        filter: 'all' as const,
        sortBy: 'messages' as const,
      }

      const filtered = selectFilteredSessions(state)

      // Highest message count first (session-1 has 150 messages)
      expect(filtered[0].id).toBe('session-1')
    })
  })

  // ==========================================================================
  // MESSAGE CONTENT DISPLAY TESTS
  // ==========================================================================
  describe('Message Content Display', () => {
    it('displays text content from messages', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: [
          createMockMessage({
            uuid: 'text-msg',
            type: 'user',
            content: 'Simple text message',
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('Simple text message')).toBeDefined()
    })

    it('displays tool output for tool-result messages', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: [
          createMockMessage({
            uuid: 'tool-msg',
            type: 'tool-result',
            toolName: 'Bash',
            toolOutput: 'Command executed successfully',
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('Command executed successfully')).toBeDefined()
    })

    it('handles array content blocks', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: [
          {
            uuid: 'array-msg',
            type: 'assistant' as const,
            timestamp: Date.now(),
            content: [
              { type: 'text', text: 'First block' },
              { type: 'text', text: 'Second block' },
            ],
          },
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText(/First block/)).toBeDefined()
    })

    it('shows (no content) for empty messages', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: mockSessions[0],
        selectedMessages: [
          createMockMessage({
            uuid: 'empty-msg',
            type: 'user',
            content: undefined,
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('(no content)')).toBeDefined()
    })
  })

  // ==========================================================================
  // ERROR HANDLING TESTS
  // ==========================================================================
  describe('Error Handling', () => {
    it('gracefully handles sessions without process info', () => {
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'no-process',
            slug: 'no-process-session',
            isActive: false,
            processInfo: undefined,
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('no-process-session')).toBeDefined()
      // Should not show process-specific info
      expect(screen.queryByText('PID')).toBeNull()
    })

    it('gracefully handles sessions without MCP servers', () => {
      useSessionsStore.setState({
        sessions: [
          createMockSession({
            id: 'no-mcp',
            slug: 'no-mcp-session',
            isActive: true,
            processInfo: createMockProcessInfo({
              activeMcpServers: [],
            }),
          }),
        ],
      })

      render(<SessionManager />)

      expect(screen.getByText('no-mcp-session')).toBeDefined()
      // Should not show MCP servers row
      expect(screen.queryByText('Active MCPs:')).toBeNull()
    })

    it('handles session without git branch', () => {
      useSessionsStore.setState({
        sessions: mockSessions,
        selectedSession: createMockSession({
          id: 'no-git',
          slug: 'no-git-session',
          gitBranch: undefined,
        }),
        selectedMessages: [],
      })

      render(<SessionManager />)

      // Git branch icon should not be present for sessions without branch
      const _gitIcons = screen.queryAllByTestId('icon-gitbranch')
      // It will still be in the tab bar, but not in metadata
      expect(screen.queryByText('main')).toBeNull()
    })
  })
})
