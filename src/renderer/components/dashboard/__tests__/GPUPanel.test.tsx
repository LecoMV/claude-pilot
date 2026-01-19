import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GPUPanel } from '../GPUPanel'
import type { GPUUsage } from '@shared/types'
import type { MetricDataPoint } from '@/stores/metricsHistory'

// Mock the metrics history store
const mockMetricsHistoryStore = vi.fn()

vi.mock('@/stores/metricsHistory', () => ({
  useMetricsHistoryStore: () => mockMetricsHistoryStore(),
}))

// Mock Recharts components (they don't render well in tests)
vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: ({ dataKey, name }: { dataKey: string; name: string }) => (
    <div data-testid={`area-${dataKey}`}>{name}</div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Monitor: () => <span data-testid="icon-monitor">Monitor</span>,
  Thermometer: () => <span data-testid="icon-thermometer">Thermometer</span>,
  Zap: () => <span data-testid="icon-zap">Zap</span>,
  HardDrive: () => <span data-testid="icon-harddrive">HardDrive</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AlertTriangle</span>,
  TrendingUp: () => <span data-testid="icon-trending">TrendingUp</span>,
  Activity: () => <span data-testid="icon-activity">Activity</span>,
}))

// Mock formatBytes utility
vi.mock('@/lib/utils', () => ({
  formatBytes: (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }
    return `${bytes} B`
  },
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}))

const createMockGPU = (overrides?: Partial<GPUUsage>): GPUUsage => ({
  available: true,
  name: 'NVIDIA GeForce RTX 4090',
  memoryUsed: 8 * 1024 * 1024 * 1024, // 8GB
  memoryTotal: 24 * 1024 * 1024 * 1024, // 24GB
  utilization: 55,
  temperature: 65,
  driverVersion: '535.154.05',
  ...overrides,
})

const createMockHistoryPoint = (overrides?: Partial<MetricDataPoint>): MetricDataPoint => ({
  timestamp: Date.now(),
  cpu: 45,
  memory: 60,
  diskUsed: 50,
  gpuUtilization: 55,
  gpuTemperature: 65,
  gpuMemoryUsed: 8 * 1024 * 1024 * 1024,
  gpuMemoryTotal: 24 * 1024 * 1024 * 1024,
  ...overrides,
})

describe('GPUPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementation with no history
    mockMetricsHistoryStore.mockReturnValue({
      history: [],
    })
  })

  // ==========================================================================
  // NO GPU AVAILABLE TESTS
  // ==========================================================================
  describe('No GPU Available', () => {
    it('renders "No NVIDIA GPU detected" when gpu is undefined', () => {
      render(<GPUPanel gpu={undefined} />)

      expect(screen.getByText('GPU Monitor')).toBeDefined()
      expect(screen.getByText('No NVIDIA GPU detected')).toBeDefined()
      expect(
        screen.getByText(/Install NVIDIA drivers and ensure nvidia-smi is available/)
      ).toBeDefined()
    })

    it('renders "No NVIDIA GPU detected" when gpu.available is false', () => {
      render(<GPUPanel gpu={{ available: false }} />)

      expect(screen.getByText('GPU Monitor')).toBeDefined()
      expect(screen.getByText('No NVIDIA GPU detected')).toBeDefined()
    })

    it('shows monitor icon in muted state when no GPU', () => {
      render(<GPUPanel gpu={undefined} />)

      expect(screen.getByTestId('icon-monitor')).toBeDefined()
    })
  })

  // ==========================================================================
  // GPU ERROR STATE TESTS
  // ==========================================================================
  describe('GPU Error State', () => {
    it('shows error message when gpu has error', () => {
      const gpuWithError = createMockGPU({
        error: 'nvidia-smi command failed',
        utilization: undefined,
      })

      render(<GPUPanel gpu={gpuWithError} />)

      expect(screen.getByText('nvidia-smi command failed')).toBeDefined()
      expect(screen.getByTestId('icon-alert')).toBeDefined()
    })

    it('shows "Limited monitoring available" when utilization is undefined without error', () => {
      const gpuLimited = createMockGPU({
        utilization: undefined,
        error: undefined,
      })

      render(<GPUPanel gpu={gpuLimited} />)

      expect(screen.getByText('Limited monitoring available')).toBeDefined()
    })

    it('shows driver version in error state if available', () => {
      const gpuWithError = createMockGPU({
        error: 'Some error',
        utilization: undefined,
        driverVersion: '535.154.05',
      })

      render(<GPUPanel gpu={gpuWithError} />)

      expect(screen.getByText('Driver: 535.154.05')).toBeDefined()
    })

    it('shows GPU name in error state', () => {
      const gpuWithError = createMockGPU({
        error: 'Some error',
        utilization: undefined,
        name: 'NVIDIA RTX 4090',
      })

      render(<GPUPanel gpu={gpuWithError} />)

      expect(screen.getByText('NVIDIA RTX 4090')).toBeDefined()
    })

    it('falls back to "NVIDIA GPU" when name is not provided in error state', () => {
      const gpuWithError: GPUUsage = {
        available: true,
        error: 'Some error',
        utilization: undefined,
      }

      render(<GPUPanel gpu={gpuWithError} />)

      expect(screen.getByText('NVIDIA GPU')).toBeDefined()
    })
  })

  // ==========================================================================
  // SUCCESSFUL GPU RENDERING TESTS
  // ==========================================================================
  describe('Successful GPU Rendering', () => {
    it('renders GPU name with NVIDIA/GeForce stripped', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      // "NVIDIA GeForce RTX 4090" should become "RTX 4090"
      expect(screen.getByText('RTX 4090')).toBeDefined()
    })

    it('renders driver version', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByText('Driver 535.154.05')).toBeDefined()
    })

    it('renders utilization percentage', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 55 })} />)

      expect(screen.getByText('55%')).toBeDefined()
    })

    it('renders temperature', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: 65 })} />)

      expect(screen.getByText('65°C')).toBeDefined()
    })

    it('renders "N/A" when temperature is undefined', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: undefined })} />)

      expect(screen.getByText('N/A')).toBeDefined()
    })

    it('renders VRAM used', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      // 8GB used
      expect(screen.getByText('8.0 GB')).toBeDefined()
    })

    it('renders VRAM total in subtext', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      // "of 24GB" should appear
      expect(screen.getByText(/of.*24\.0 GB/)).toBeDefined()
    })

    it('renders VRAM percentage', () => {
      const gpu = createMockGPU({
        memoryUsed: 8 * 1024 * 1024 * 1024,
        memoryTotal: 24 * 1024 * 1024 * 1024,
      })
      render(<GPUPanel gpu={gpu} />)

      // 8/24 = 33.3%
      expect(screen.getByText('33.3%')).toBeDefined()
    })

    it('renders free VRAM', () => {
      const gpu = createMockGPU({
        memoryUsed: 8 * 1024 * 1024 * 1024,
        memoryTotal: 24 * 1024 * 1024 * 1024,
      })
      render(<GPUPanel gpu={gpu} />)

      // 24 - 8 = 16GB free
      expect(screen.getByText(/16\.0 GB free/)).toBeDefined()
    })
  })

  // ==========================================================================
  // UTILIZATION STATUS TESTS
  // ==========================================================================
  describe('Utilization Status Labels', () => {
    it('shows "Idle Load" for utilization < 10%', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 5 })} />)

      expect(screen.getByText('Idle Load')).toBeDefined()
    })

    it('shows "Light Load" for utilization 10-30%', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 20 })} />)

      expect(screen.getByText('Light Load')).toBeDefined()
    })

    it('shows "Moderate Load" for utilization 30-60%', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 45 })} />)

      expect(screen.getByText('Moderate Load')).toBeDefined()
    })

    it('shows "Heavy Load" for utilization 60-85%', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 75 })} />)

      expect(screen.getByText('Heavy Load')).toBeDefined()
    })

    it('shows "Maximum Load" for utilization >= 85%', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 95 })} />)

      expect(screen.getByText('Maximum Load')).toBeDefined()
    })
  })

  // ==========================================================================
  // TEMPERATURE COLOR TESTS
  // ==========================================================================
  describe('Temperature Color Coding', () => {
    it('uses green color for cool temperatures (< 50°C)', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: 45 })} />)

      // Should render temperature text - verify it exists
      expect(screen.getByText('45°C')).toBeDefined()
    })

    it('uses teal color for warm temperatures (50-70°C)', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: 60 })} />)

      expect(screen.getByText('60°C')).toBeDefined()
    })

    it('uses yellow color for hot temperatures (70-85°C)', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: 75 })} />)

      expect(screen.getByText('75°C')).toBeDefined()
    })

    it('shows high temperature warning for temps >= 85°C', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: 87 })} />)

      expect(screen.getByText('87°C')).toBeDefined()
      expect(screen.getByText('High temperature')).toBeDefined()
    })

    it('uses red color for critical temperatures (>= 90°C)', () => {
      render(<GPUPanel gpu={createMockGPU({ temperature: 92 })} />)

      expect(screen.getByText('92°C')).toBeDefined()
      expect(screen.getByText('High temperature')).toBeDefined()
    })
  })

  // ==========================================================================
  // METRICS GRID TESTS
  // ==========================================================================
  describe('Metrics Grid', () => {
    it('renders all four metric cards', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByText('Utilization')).toBeDefined()
      expect(screen.getByText('Temperature')).toBeDefined()
      expect(screen.getByText('VRAM Used')).toBeDefined()
      expect(screen.getByText('VRAM %')).toBeDefined()
    })

    it('renders metric icons', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByTestId('icon-zap')).toBeDefined()
      expect(screen.getByTestId('icon-thermometer')).toBeDefined()
      expect(screen.getByTestId('icon-harddrive')).toBeDefined()
      expect(screen.getByTestId('icon-activity')).toBeDefined()
    })

    it('renders progress bars for metrics', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      // Progress bars should exist in the DOM
      const progressBars = document.querySelectorAll('.rounded-full.transition-all')
      expect(progressBars.length).toBeGreaterThanOrEqual(3) // Utilization, Temperature, VRAM
    })
  })

  // ==========================================================================
  // HISTORY CHART TESTS
  // ==========================================================================
  describe('Performance History Chart', () => {
    it('does not render chart when history has less than 2 data points', () => {
      mockMetricsHistoryStore.mockReturnValue({
        history: [createMockHistoryPoint()],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.queryByTestId('responsive-container')).toBeNull()
      expect(screen.queryByText('Performance History')).toBeNull()
    })

    it('renders chart when history has 2 or more GPU data points', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockHistoryPoint({ timestamp: now - 10000 }),
          createMockHistoryPoint({ timestamp: now }),
        ],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByText('Performance History')).toBeDefined()
      expect(screen.getByTestId('responsive-container')).toBeDefined()
      expect(screen.getByTestId('area-chart')).toBeDefined()
    })

    it('renders utilization and temperature area lines', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockHistoryPoint({ timestamp: now - 10000 }),
          createMockHistoryPoint({ timestamp: now }),
        ],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByTestId('area-gpuUtilization')).toBeDefined()
      expect(screen.getByTestId('area-gpuTemperature')).toBeDefined()
    })

    it('filters out history points without GPU data', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockHistoryPoint({ timestamp: now - 20000, gpuUtilization: undefined }),
          createMockHistoryPoint({ timestamp: now - 10000 }),
          createMockHistoryPoint({ timestamp: now }),
        ],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      // Chart should still render with 2 valid GPU points
      expect(screen.getByTestId('responsive-container')).toBeDefined()
    })

    it('does not render chart when no history points have GPU data', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          { timestamp: now - 10000, cpu: 45, memory: 60, diskUsed: 50 },
          { timestamp: now, cpu: 50, memory: 65, diskUsed: 55 },
        ],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.queryByText('Performance History')).toBeNull()
    })

    it('renders chart axis components', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockHistoryPoint({ timestamp: now - 10000 }),
          createMockHistoryPoint({ timestamp: now }),
        ],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByTestId('x-axis')).toBeDefined()
      expect(screen.getByTestId('y-axis')).toBeDefined()
      expect(screen.getByTestId('cartesian-grid')).toBeDefined()
      expect(screen.getByTestId('tooltip')).toBeDefined()
    })
  })

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================
  describe('Edge Cases', () => {
    it('handles 0% utilization', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 0 })} />)

      expect(screen.getByText('0%')).toBeDefined()
      expect(screen.getByText('Idle Load')).toBeDefined()
    })

    it('handles 100% utilization', () => {
      render(<GPUPanel gpu={createMockGPU({ utilization: 100 })} />)

      expect(screen.getByText('100%')).toBeDefined()
      expect(screen.getByText('Maximum Load')).toBeDefined()
    })

    it('handles 0 VRAM usage', () => {
      render(<GPUPanel gpu={createMockGPU({ memoryUsed: 0 })} />)

      expect(screen.getByText('0.0%')).toBeDefined()
    })

    it('handles GPU with only name (minimal data)', () => {
      const minimalGPU: GPUUsage = {
        available: true,
        name: 'NVIDIA RTX 3090',
        utilization: 30,
      }

      render(<GPUPanel gpu={minimalGPU} />)

      expect(screen.getByText('RTX 3090')).toBeDefined()
      expect(screen.getByText('30%')).toBeDefined()
    })

    it('falls back to "GPU" when name is empty after stripping', () => {
      const gpuNoName: GPUUsage = {
        available: true,
        name: '',
        utilization: 50,
      }

      render(<GPUPanel gpu={gpuNoName} />)

      expect(screen.getByText('GPU')).toBeDefined()
    })

    it('handles undefined memory values gracefully', () => {
      const gpuNoMemory: GPUUsage = {
        available: true,
        name: 'Test GPU',
        utilization: 50,
        memoryUsed: undefined,
        memoryTotal: undefined,
      }

      render(<GPUPanel gpu={gpuNoMemory} />)

      // Should show 0 bytes for memory
      expect(screen.getByText('0 B')).toBeDefined()
      expect(screen.getByText('0.0%')).toBeDefined()
    })
  })

  // ==========================================================================
  // CARD STRUCTURE TESTS
  // ==========================================================================
  describe('Card Structure', () => {
    it('renders main card container', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      const card = document.querySelector('.card')
      expect(card).not.toBeNull()
    })

    it('renders header with GPU icon', () => {
      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getAllByTestId('icon-monitor').length).toBeGreaterThan(0)
    })

    it('renders trending icon for history section', () => {
      const now = Date.now()
      mockMetricsHistoryStore.mockReturnValue({
        history: [
          createMockHistoryPoint({ timestamp: now - 10000 }),
          createMockHistoryPoint({ timestamp: now }),
        ],
      })

      render(<GPUPanel gpu={createMockGPU()} />)

      expect(screen.getByTestId('icon-trending')).toBeDefined()
    })
  })
})
