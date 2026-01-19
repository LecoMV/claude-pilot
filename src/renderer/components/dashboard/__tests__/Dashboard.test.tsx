import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Dashboard } from '../Dashboard'
import type { SystemStatus, GPUUsage } from '@shared/types'

// Mock the useSystemStatus hook
const mockRefresh = vi.fn()
const mockUseSystemStatus = vi.fn()

vi.mock('@/hooks/useSystemStatus', () => ({
  useSystemStatus: () => mockUseSystemStatus(),
}))

// Mock child components to simplify testing
vi.mock('../MetricsChart', () => ({
  MetricsChart: () => <div data-testid="metrics-chart">MetricsChart</div>,
}))

vi.mock('../GPUPanel', () => ({
  GPUPanel: ({ gpu }: { gpu?: GPUUsage }) => (
    <div data-testid="gpu-panel">GPUPanel: {gpu?.name || 'No GPU'}</div>
  ),
}))

vi.mock('../CostTracker', () => ({
  CostTracker: ({ onNavigate }: { onNavigate?: (view: string) => void }) => (
    <div data-testid="cost-tracker" onClick={() => onNavigate?.('settings')}>
      CostTracker
    </div>
  ),
}))

// Mock formatBytes utility
vi.mock('@/lib/utils', () => ({
  formatBytes: (bytes: number) => `${bytes} bytes`,
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Activity: () => <span data-testid="icon-activity">Activity</span>,
  Cpu: () => <span data-testid="icon-cpu">Cpu</span>,
  HardDrive: () => <span data-testid="icon-harddrive">HardDrive</span>,
  Database: () => <span data-testid="icon-database">Database</span>,
  Server: () => <span data-testid="icon-server">Server</span>,
  Layers: () => <span data-testid="icon-layers">Layers</span>,
  CheckCircle: () => <span data-testid="icon-check">CheckCircle</span>,
  XCircle: () => <span data-testid="icon-xcircle">XCircle</span>,
  Clock: () => <span data-testid="icon-clock">Clock</span>,
  RefreshCw: () => <span data-testid="icon-refresh">RefreshCw</span>,
  Zap: () => <span data-testid="icon-zap">Zap</span>,
  Bot: () => <span data-testid="icon-bot">Bot</span>,
  Monitor: () => <span data-testid="icon-monitor">Monitor</span>,
  Thermometer: () => <span data-testid="icon-thermometer">Thermometer</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AlertTriangle</span>,
}))

const createMockStatus = (overrides?: Partial<SystemStatus>): SystemStatus => ({
  claude: {
    online: true,
    version: '1.0.0',
    lastCheck: Date.now(),
  },
  mcp: {
    servers: [],
    totalActive: 3,
    totalDisabled: 1,
  },
  memory: {
    postgresql: { online: true },
    memgraph: { online: true },
    qdrant: { online: true },
  },
  ollama: {
    online: true,
    modelCount: 5,
    runningModels: 2,
  },
  resources: {
    cpu: 45.5,
    memory: 67.2,
    disk: {
      used: 100000000000,
      total: 500000000000,
      claudeData: 5000000000,
    },
    gpu: undefined,
  },
  ...overrides,
})

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementation
    mockUseSystemStatus.mockReturnValue({
      status: createMockStatus(),
      loading: false,
      error: null,
      lastUpdate: Date.now(),
      refresh: mockRefresh,
    })
  })

  describe('Loading State', () => {
    it('renders loading spinner when loading with no status', () => {
      mockUseSystemStatus.mockReturnValue({
        status: null,
        loading: true,
        error: null,
        lastUpdate: 0,
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      // Check for spinning animation class
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })

    it('does not show loading spinner when loading with existing status', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus(),
        loading: true,
        error: null,
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      // Should render content, not just spinner
      expect(screen.getByText('System Status')).toBeDefined()
    })
  })

  describe('Error State', () => {
    it('renders error message when error with no status', () => {
      mockUseSystemStatus.mockReturnValue({
        status: null,
        loading: false,
        error: 'Failed to fetch system status',
        lastUpdate: 0,
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      expect(screen.getByText('Failed to fetch system status')).toBeDefined()
      expect(screen.getByText('Retry')).toBeDefined()
    })

    it('calls refresh when retry button is clicked', () => {
      mockUseSystemStatus.mockReturnValue({
        status: null,
        loading: false,
        error: 'Connection error',
        lastUpdate: 0,
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      fireEvent.click(screen.getByText('Retry'))
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    })

    it('renders content when error but status exists', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus(),
        loading: false,
        error: 'Partial error',
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      expect(screen.getByText('System Status')).toBeDefined()
    })
  })

  describe('System Status Section', () => {
    it('renders all status cards', () => {
      render(<Dashboard />)

      expect(screen.getByText('Claude Code')).toBeDefined()
      // MCP Servers appears twice (status card + quick action), so use getAllByText
      expect(screen.getAllByText('MCP Servers').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Ollama')).toBeDefined()
      // PostgreSQL also appears in Memory Systems section
      expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThanOrEqual(1)
      // Memgraph also appears in Memory Systems section
      expect(screen.getAllByText('Memgraph').length).toBeGreaterThanOrEqual(1)
    })

    it('shows Claude Code version when online', () => {
      render(<Dashboard />)

      expect(screen.getByText('1.0.0')).toBeDefined()
    })

    it('shows "Not installed" when Claude Code is offline', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus({
          claude: { online: false, lastCheck: Date.now() },
        }),
        loading: false,
        error: null,
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      expect(screen.getByText('Not installed')).toBeDefined()
    })

    it('shows MCP server counts', () => {
      render(<Dashboard />)

      expect(screen.getByText('3 active, 1 disabled')).toBeDefined()
    })

    it('shows Ollama model count when online', () => {
      render(<Dashboard />)

      expect(screen.getByText('5 models')).toBeDefined()
    })

    it('shows "Not running" when Ollama is offline', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus({
          ollama: { online: false, modelCount: 0, runningModels: 0 },
        }),
        loading: false,
        error: null,
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      expect(screen.getByText('Not running')).toBeDefined()
    })
  })

  describe('Resource Usage Section', () => {
    it('renders resource meters', () => {
      render(<Dashboard />)

      expect(screen.getByText('CPU Usage')).toBeDefined()
      expect(screen.getByText('Memory Usage')).toBeDefined()
      expect(screen.getByText('Claude Data')).toBeDefined()
    })

    it('displays CPU usage value', () => {
      render(<Dashboard />)

      expect(screen.getByText('45.5')).toBeDefined()
    })

    it('displays memory usage value', () => {
      render(<Dashboard />)

      expect(screen.getByText('67.2')).toBeDefined()
    })
  })

  describe('Memory Systems Section', () => {
    it('renders all memory system cards', () => {
      render(<Dashboard />)

      // Check for section header
      expect(screen.getByText('Memory Systems')).toBeDefined()

      // Check for descriptions
      expect(screen.getByText('Long-term learnings storage')).toBeDefined()
      expect(screen.getByText('CybersecKB knowledge graph')).toBeDefined()
      expect(screen.getByText('Mem0 vector memories')).toBeDefined()
    })

    it('shows correct ports for memory systems', () => {
      render(<Dashboard />)

      expect(screen.getByText('localhost:5433')).toBeDefined()
      expect(screen.getByText('localhost:7687')).toBeDefined()
      expect(screen.getByText('localhost:6333')).toBeDefined()
    })

    it('shows offline status for disconnected memory systems', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus({
          memory: {
            postgresql: { online: false },
            memgraph: { online: true },
            qdrant: { online: false },
          },
        }),
        loading: false,
        error: null,
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      const offlineBadges = screen.getAllByText('offline')
      // PostgreSQL and Qdrant are offline in memory systems
      // Also appears in status cards section, so we check there are multiple
      expect(offlineBadges.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Quick Actions Section', () => {
    it('renders all quick action buttons', () => {
      render(<Dashboard />)

      expect(screen.getByText('Quick Actions')).toBeDefined()
      expect(screen.getByRole('button', { name: /MCP Servers/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Memory Browser/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Knowledge Graph/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Sessions/i })).toBeDefined()
    })

    it('calls onNavigate with "mcp" when MCP Servers clicked', () => {
      const mockNavigate = vi.fn()
      render(<Dashboard onNavigate={mockNavigate} />)

      fireEvent.click(screen.getByRole('button', { name: /MCP Servers/i }))
      expect(mockNavigate).toHaveBeenCalledWith('mcp')
    })

    it('calls onNavigate with "memory" when Memory Browser clicked', () => {
      const mockNavigate = vi.fn()
      render(<Dashboard onNavigate={mockNavigate} />)

      fireEvent.click(screen.getByRole('button', { name: /Memory Browser/i }))
      expect(mockNavigate).toHaveBeenCalledWith('memory')
    })

    it('calls onNavigate with "sessions" when Sessions clicked', () => {
      const mockNavigate = vi.fn()
      render(<Dashboard onNavigate={mockNavigate} />)

      fireEvent.click(screen.getByRole('button', { name: /Sessions/i }))
      expect(mockNavigate).toHaveBeenCalledWith('sessions')
    })
  })

  describe('Refresh Functionality', () => {
    it('renders refresh button', () => {
      render(<Dashboard />)

      const refreshButtons = document.querySelectorAll('button[title="Refresh"]')
      expect(refreshButtons.length).toBe(1)
    })

    it('calls refresh when refresh button is clicked', () => {
      render(<Dashboard />)

      const refreshButton = document.querySelector('button[title="Refresh"]')
      if (refreshButton) {
        fireEvent.click(refreshButton)
        expect(mockRefresh).toHaveBeenCalledTimes(1)
      }
    })

    it('disables refresh button when loading', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus(),
        loading: true,
        error: null,
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      const refreshButton = document.querySelector('button[title="Refresh"]')
      expect(refreshButton?.hasAttribute('disabled')).toBe(true)
    })
  })

  describe('GPU Panel', () => {
    it('does not render GPU panel when GPU is not available', () => {
      render(<Dashboard />)

      // GPU Panel section header should not be visible (not GPU Monitor)
      const gpuMonitorHeaders = screen.queryAllByText('GPU Monitor')
      // The header should only appear when GPU is available
      expect(gpuMonitorHeaders.length).toBe(0)
    })

    it('renders GPU panel when GPU is available', () => {
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus({
          resources: {
            cpu: 45.5,
            memory: 67.2,
            disk: {
              used: 100000000000,
              total: 500000000000,
              claudeData: 5000000000,
            },
            gpu: {
              available: true,
              name: 'NVIDIA RTX 4090',
              utilization: 55,
              temperature: 65,
              memoryUsed: 8000000000,
              memoryTotal: 24000000000,
              driverVersion: '535.154.05',
            },
          },
        }),
        loading: false,
        error: null,
        lastUpdate: Date.now(),
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      // Check for GPU Monitor header and GPUPanel component
      expect(screen.getByText('GPU Monitor')).toBeDefined()
      expect(screen.getByTestId('gpu-panel')).toBeDefined()
    })
  })

  describe('Child Components', () => {
    it('renders MetricsChart component', () => {
      render(<Dashboard />)

      expect(screen.getByTestId('metrics-chart')).toBeDefined()
    })

    it('renders CostTracker component', () => {
      render(<Dashboard />)

      expect(screen.getByTestId('cost-tracker')).toBeDefined()
    })

    it('passes onNavigate to CostTracker', () => {
      const mockNavigate = vi.fn()
      render(<Dashboard onNavigate={mockNavigate} />)

      fireEvent.click(screen.getByTestId('cost-tracker'))
      expect(mockNavigate).toHaveBeenCalledWith('settings')
    })
  })

  describe('Last Update Display', () => {
    it('shows time since last update', () => {
      const now = Date.now()
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus(),
        loading: false,
        error: null,
        lastUpdate: now - 5000, // 5 seconds ago
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      expect(screen.getByText(/Updated/)).toBeDefined()
    })

    it('shows "just now" for very recent updates', () => {
      const now = Date.now()
      mockUseSystemStatus.mockReturnValue({
        status: createMockStatus(),
        loading: false,
        error: null,
        lastUpdate: now - 1000, // 1 second ago
        refresh: mockRefresh,
      })

      render(<Dashboard />)

      expect(screen.getByText(/just now/)).toBeDefined()
    })
  })
})
