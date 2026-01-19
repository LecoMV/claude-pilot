import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LogsViewer } from '../LogsViewer'
import { useLogsStore, type LogEntry, type LogSource, type LogLevel } from '@/stores/logs'

// Mock tRPC
const mockRecentRefetch = vi.fn()
let mockRecentData: LogEntry[] = []
let mockRecentLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    logs: {
      recent: {
        useQuery: () => ({
          data: mockRecentData,
          isLoading: mockRecentLoading,
          refetch: mockRecentRefetch,
        }),
      },
    },
  },
}))

// Mock window.electron for IPC
vi.stubGlobal('window', {
  ...window,
  electron: {
    on: vi.fn().mockReturnValue(() => {}),
    invoke: vi.fn(),
  },
})

// Mock URL.createObjectURL and revokeObjectURL for export functionality
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url')
const mockRevokeObjectURL = vi.fn()
vi.stubGlobal('URL', {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
})

let logIdCounter = 0

function createMockLog(overrides: Partial<LogEntry> = {}): LogEntry {
  logIdCounter++
  return {
    id: `log-${logIdCounter}`,
    timestamp: Date.now(),
    source: 'claude' as LogSource,
    level: 'info' as LogLevel,
    message: 'Test log message',
    metadata: undefined,
    ...overrides,
  }
}

function resetState() {
  mockRecentData = []
  mockRecentLoading = false
  logIdCounter = 0
  useLogsStore.setState({
    logs: [],
    filter: 'all',
    levelFilter: 'all',
    searchQuery: '',
    paused: false,
    maxLogs: 1000,
    autoScroll: true,
  })
}

describe('LogsViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders header stats', () => {
    render(<LogsViewer />)

    expect(screen.getByText('Total Logs')).toBeDefined()
    expect(screen.getByText('Errors')).toBeDefined()
    expect(screen.getByText('Warnings')).toBeDefined()
    expect(screen.getByText('Stream Status')).toBeDefined()
    expect(screen.getByText('Auto-scroll')).toBeDefined()
  })

  it('renders empty state when no logs', () => {
    render(<LogsViewer />)

    expect(screen.getByText('No logs to display')).toBeDefined()
  })

  it('renders loading state', () => {
    mockRecentLoading = true

    render(<LogsViewer />)

    expect(screen.getByText('Loading logs...')).toBeDefined()
  })

  it('displays logs from store', () => {
    const logs = [
      createMockLog({ message: 'First log message', level: 'info' }),
      createMockLog({ message: 'Second log message', level: 'warn' }),
    ]
    useLogsStore.setState({ logs })

    render(<LogsViewer />)

    expect(screen.getByText('First log message')).toBeDefined()
    expect(screen.getByText('Second log message')).toBeDefined()
  })

  it('displays log count in stats', () => {
    const logs = [
      createMockLog({ level: 'info' }),
      createMockLog({ level: 'error' }),
      createMockLog({ level: 'error' }),
      createMockLog({ level: 'warn' }),
    ]
    useLogsStore.setState({ logs })

    render(<LogsViewer />)

    // Total should be 4
    expect(screen.getByText('4')).toBeDefined()
  })

  it('filters logs by source', () => {
    const logs = [
      createMockLog({ message: 'Claude log', source: 'claude' }),
      createMockLog({ message: 'MCP log', source: 'mcp' }),
      createMockLog({ message: 'System log', source: 'system' }),
    ]
    useLogsStore.setState({ logs })

    render(<LogsViewer />)

    // Change source filter to claude
    const sourceSelect = screen.getByDisplayValue('All Sources')
    fireEvent.change(sourceSelect, { target: { value: 'claude' } })

    // Only claude log should be visible
    expect(screen.getByText('Claude log')).toBeDefined()
    expect(screen.queryByText('MCP log')).toBeNull()
    expect(screen.queryByText('System log')).toBeNull()
  })

  it('filters logs by level', () => {
    const logs = [
      createMockLog({ message: 'Info log', level: 'info' }),
      createMockLog({ message: 'Error log', level: 'error' }),
      createMockLog({ message: 'Warning log', level: 'warn' }),
    ]
    useLogsStore.setState({ logs })

    render(<LogsViewer />)

    // Change level filter to error
    const levelSelect = screen.getByDisplayValue('All Levels')
    fireEvent.change(levelSelect, { target: { value: 'error' } })

    // Only error log should be visible
    expect(screen.getByText('Error log')).toBeDefined()
    expect(screen.queryByText('Info log')).toBeNull()
    expect(screen.queryByText('Warning log')).toBeNull()
  })

  it('filters logs by search query', () => {
    const logs = [
      createMockLog({ message: 'Database connection established' }),
      createMockLog({ message: 'User logged in' }),
      createMockLog({ message: 'Database query executed' }),
    ]
    useLogsStore.setState({ logs })

    render(<LogsViewer />)

    // Enter search query
    const searchInput = screen.getByPlaceholderText('Search logs...')
    fireEvent.change(searchInput, { target: { value: 'database' } })

    // Only database logs should be visible
    expect(screen.getByText('Database connection established')).toBeDefined()
    expect(screen.getByText('Database query executed')).toBeDefined()
    expect(screen.queryByText('User logged in')).toBeNull()
  })

  it('toggles pause state', () => {
    render(<LogsViewer />)

    // Initially should show "Live"
    expect(screen.getByText('Live')).toBeDefined()

    // Find and click the pause button
    const pauseButton = screen.getByTitle('Pause')
    fireEvent.click(pauseButton)

    // Store should be updated
    expect(useLogsStore.getState().paused).toBe(true)
  })

  it('toggles auto-scroll', () => {
    render(<LogsViewer />)

    // Initially auto-scroll is on
    expect(useLogsStore.getState().autoScroll).toBe(true)

    // Find and click the auto-scroll button
    const autoScrollButton = screen.getByTitle('Toggle auto-scroll')
    fireEvent.click(autoScrollButton)

    // Store should be updated
    expect(useLogsStore.getState().autoScroll).toBe(false)
  })

  it('clears logs when clicking clear button', () => {
    const logs = [createMockLog({ message: 'Test log' })]
    useLogsStore.setState({ logs })

    render(<LogsViewer />)

    // Verify log is displayed
    expect(screen.getByText('Test log')).toBeDefined()

    // Click clear button
    const clearButton = screen.getByTitle('Clear logs')
    fireEvent.click(clearButton)

    // Logs should be cleared
    expect(useLogsStore.getState().logs).toHaveLength(0)
    expect(screen.getByText('No logs to display')).toBeDefined()
  })

  it('refreshes logs when clicking refresh button', () => {
    render(<LogsViewer />)

    // Click refresh button
    const refreshButton = screen.getByTitle('Refresh')
    fireEvent.click(refreshButton)

    expect(mockRecentRefetch).toHaveBeenCalled()
  })
})

describe('LogsStore', () => {
  beforeEach(() => {
    resetState()
  })

  it('store state affects filtering', () => {
    useLogsStore.setState({
      logs: [
        { id: 'log-1', timestamp: Date.now(), source: 'claude', level: 'info', message: 'Test' },
      ],
      filter: 'claude',
    })

    const state = useLogsStore.getState()
    expect(state.filter).toBe('claude')
    expect(state.logs.length).toBe(1)
  })

  it('store paused state persists', () => {
    useLogsStore.setState({ paused: true })
    expect(useLogsStore.getState().paused).toBe(true)
  })

  it('store autoScroll state persists', () => {
    useLogsStore.setState({ autoScroll: false })
    expect(useLogsStore.getState().autoScroll).toBe(false)
  })

  it('store clear logs works', () => {
    useLogsStore.setState({
      logs: [
        { id: 'log-1', timestamp: Date.now(), source: 'claude', level: 'info', message: 'Test' },
      ],
    })
    useLogsStore.getState().clearLogs()
    expect(useLogsStore.getState().logs.length).toBe(0)
  })

  it('store addLog respects paused state', () => {
    useLogsStore.setState({ paused: true, logs: [] })
    useLogsStore.getState().addLog({
      id: 'log-1',
      timestamp: Date.now(),
      source: 'claude',
      level: 'info',
      message: 'Test',
    })
    // When paused, logs should not be added
    expect(useLogsStore.getState().logs.length).toBe(0)
  })

  it('store addLog adds when not paused', () => {
    useLogsStore.setState({ paused: false, logs: [] })
    useLogsStore.getState().addLog({
      id: 'log-1',
      timestamp: Date.now(),
      source: 'claude',
      level: 'info',
      message: 'Test',
    })
    expect(useLogsStore.getState().logs.length).toBe(1)
  })

  it('store levelFilter can be set', () => {
    useLogsStore.getState().setLevelFilter('error')
    expect(useLogsStore.getState().levelFilter).toBe('error')
  })

  it('store searchQuery can be set', () => {
    useLogsStore.getState().setSearchQuery('database')
    expect(useLogsStore.getState().searchQuery).toBe('database')
  })
})
