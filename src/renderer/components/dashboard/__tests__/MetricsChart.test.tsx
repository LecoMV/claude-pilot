import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MetricsChart } from '../MetricsChart'
import type { MetricDataPoint } from '@/stores/metricsHistory'
import type { SystemStatus } from '@shared/types'

// Mock the stores
const mockAddDataPoint = vi.fn()
const mockMetricsHistoryStore = vi.fn()
const mockSystemStore = vi.fn()

vi.mock('@/stores/metricsHistory', () => ({
  useMetricsHistoryStore: () => mockMetricsHistoryStore(),
}))

vi.mock('@/stores/system', () => ({
  useSystemStore: (selector?: (state: { status: SystemStatus | null }) => SystemStatus | null) => {
    const state = mockSystemStore()
    return selector ? selector(state) : state
  },
}))

// Mock Recharts components (they don't render well in tests)
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ dataKey, name }: { dataKey: string; name: string }) => (
    <div data-testid={`line-${dataKey}`}>{name}</div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Legend: () => <div data-testid="legend" />,
}))

const createMockDataPoint = (overrides?: Partial<MetricDataPoint>): MetricDataPoint => ({
  timestamp: Date.now(),
  cpu: 45.5,
  memory: 67.2,
  diskUsed: 50,
  ...overrides,
})

const createMockStatus = (): SystemStatus => ({
  claude: { online: true, version: '1.0.0', lastCheck: Date.now() },
  mcp: { servers: [], totalActive: 0, totalDisabled: 0 },
  memory: {
    postgresql: { online: true },
    memgraph: { online: true },
    qdrant: { online: true },
  },
  ollama: { online: true, modelCount: 0, runningModels: 0 },
  resources: {
    cpu: 45.5,
    memory: 67.2,
    disk: {
      used: 100000000000,
      total: 200000000000,
      claudeData: 5000000000,
    },
    gpu: undefined,
  },
})

describe('MetricsChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementations
    mockMetricsHistoryStore.mockReturnValue({
      history: [],
      addDataPoint: mockAddDataPoint,
    })
    mockSystemStore.mockReturnValue({
      status: null,
    })
  })

  describe('Collecting State', () => {
    it('shows collecting message when history has less than 2 data points', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      expect(screen.getByText('Collecting metrics data...')).toBeDefined()
      expect(screen.getByText('Resource Metrics')).toBeDefined()
    })

    it('shows collecting message with 1 data point', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [createMockDataPoint()],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      expect(screen.getByText('Collecting metrics data...')).toBeDefined()
    })
  })

  describe('Chart Rendering', () => {
    it('renders chart when history has 2 or more data points', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockDataPoint({ timestamp: now - 10000 }),
          createMockDataPoint({ timestamp: now - 5000 }),
        ],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      expect(screen.getByTestId('responsive-container')).toBeDefined()
      expect(screen.getByTestId('line-chart')).toBeDefined()
    })

    it('renders chart title with time range', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockDataPoint({ timestamp: now - 10000 }),
          createMockDataPoint({ timestamp: now }),
        ],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      expect(screen.getByText('Resource Metrics (Last 5 min)')).toBeDefined()
    })

    it('renders all three metric lines', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockDataPoint({ timestamp: now - 10000 }),
          createMockDataPoint({ timestamp: now }),
        ],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      expect(screen.getByTestId('line-cpu')).toBeDefined()
      expect(screen.getByTestId('line-memory')).toBeDefined()
      expect(screen.getByTestId('line-diskUsed')).toBeDefined()
    })

    it('renders chart components', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockDataPoint({ timestamp: now - 10000 }),
          createMockDataPoint({ timestamp: now }),
        ],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      expect(screen.getByTestId('x-axis')).toBeDefined()
      expect(screen.getByTestId('y-axis')).toBeDefined()
      expect(screen.getByTestId('cartesian-grid')).toBeDefined()
      expect(screen.getByTestId('tooltip')).toBeDefined()
      expect(screen.getByTestId('legend')).toBeDefined()
    })
  })

  describe('Data Point Addition', () => {
    it('adds data point when status changes', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })
      mockSystemStore.mockReturnValue({
        status: createMockStatus(),
      })

      render(<MetricsChart />)

      expect(mockAddDataPoint).toHaveBeenCalledWith({
        cpu: 45.5,
        memory: 67.2,
        diskUsed: 50, // (100000000000 / 200000000000) * 100
      })
    })

    it('includes GPU metrics when available', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })
      mockSystemStore.mockReturnValue({
        status: {
          ...createMockStatus(),
          resources: {
            cpu: 45.5,
            memory: 67.2,
            disk: {
              used: 100000000000,
              total: 200000000000,
              claudeData: 5000000000,
            },
            gpu: {
              available: true,
              name: 'NVIDIA RTX 4090',
              utilization: 55,
              temperature: 65,
              memoryUsed: 8000000000,
              memoryTotal: 24000000000,
            },
          },
        },
      })

      render(<MetricsChart />)

      expect(mockAddDataPoint).toHaveBeenCalledWith({
        cpu: 45.5,
        memory: 67.2,
        diskUsed: 50,
        gpuUtilization: 55,
        gpuMemoryUsed: 8000000000,
        gpuMemoryTotal: 24000000000,
        gpuTemperature: 65,
      })
    })

    it('does not add data point when status is null', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })
      mockSystemStore.mockReturnValue({
        status: null,
      })

      render(<MetricsChart />)

      expect(mockAddDataPoint).not.toHaveBeenCalled()
    })

    it('does not include GPU metrics when GPU is not available', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })
      mockSystemStore.mockReturnValue({
        status: {
          ...createMockStatus(),
          resources: {
            cpu: 45.5,
            memory: 67.2,
            disk: {
              used: 100000000000,
              total: 200000000000,
              claudeData: 5000000000,
            },
            gpu: {
              available: false,
            },
          },
        },
      })

      render(<MetricsChart />)

      expect(mockAddDataPoint).toHaveBeenCalledWith({
        cpu: 45.5,
        memory: 67.2,
        diskUsed: 50,
      })
    })

    it('does not include GPU metrics when utilization is undefined', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })
      mockSystemStore.mockReturnValue({
        status: {
          ...createMockStatus(),
          resources: {
            cpu: 45.5,
            memory: 67.2,
            disk: {
              used: 100000000000,
              total: 200000000000,
              claudeData: 5000000000,
            },
            gpu: {
              available: true,
              name: 'NVIDIA GPU',
              utilization: undefined,
            },
          },
        },
      })

      render(<MetricsChart />)

      expect(mockAddDataPoint).toHaveBeenCalledWith({
        cpu: 45.5,
        memory: 67.2,
        diskUsed: 50,
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles zero disk total', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })
      mockSystemStore.mockReturnValue({
        status: {
          ...createMockStatus(),
          resources: {
            cpu: 45.5,
            memory: 67.2,
            disk: {
              used: 0,
              total: 0,
              claudeData: 0,
            },
          },
        },
      })

      render(<MetricsChart />)

      expect(mockAddDataPoint).toHaveBeenCalledWith({
        cpu: 45.5,
        memory: 67.2,
        diskUsed: 0,
      })
    })

    it('renders card container with correct styling', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [],
        addDataPoint: mockAddDataPoint,
      })

      render(<MetricsChart />)

      const card = document.querySelector('.card')
      expect(card).toBeDefined()
    })
  })
})

describe('CustomTooltip', () => {
  // Note: CustomTooltip is an internal component, but we can test it indirectly
  // through its behavior in the chart. For now, we rely on Recharts to handle
  // tooltip rendering properly. A more thorough test would export CustomTooltip
  // or test it in integration tests.

  it('is included in the chart as tooltip component', () => {
    const now = Date.now()
    mockMetricsHistoryStore.mockReturnValue({
      history: [
        createMockDataPoint({ timestamp: now - 10000 }),
        createMockDataPoint({ timestamp: now }),
      ],
      addDataPoint: mockAddDataPoint,
    })

    render(<MetricsChart />)

    // Tooltip component is rendered (though actual tooltip behavior
    // would require mouse events that are better tested in E2E)
    expect(screen.getByTestId('tooltip')).toBeDefined()
  })
})
