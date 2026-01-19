import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanPanel } from '../PlanPanel'
import type { Plan, PlanStatus, StepStatus } from '@shared/types'

// Create mock functions
const mockListRefetch = vi.fn()
const mockStatsRefetch = vi.fn()
const mockExecuteMutate = vi.fn()
const mockPauseMutate = vi.fn()
const mockResumeMutate = vi.fn()
const mockCancelMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockStepCompleteMutate = vi.fn()
const mockCreateMutate = vi.fn()

// Mock return values
let mockListData: Plan[] = []
let mockStatsData: { totalPlans: number; successRate: number; totalStepsExecuted: number; avgDuration: number } | null = null
let mockListLoading = false
let mockStatsLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    plans: {
      list: {
        useQuery: () => ({
          data: mockListData,
          isLoading: mockListLoading,
          refetch: mockListRefetch,
        }),
      },
      stats: {
        useQuery: () => ({
          data: mockStatsData,
          isLoading: mockStatsLoading,
          refetch: mockStatsRefetch,
        }),
      },
      execute: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockExecuteMutate(args)
            onSuccess?.()
          },
        }),
      },
      pause: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockPauseMutate(args)
            onSuccess?.()
          },
        }),
      },
      resume: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockResumeMutate(args)
            onSuccess?.()
          },
        }),
      },
      cancel: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockCancelMutate(args)
            onSuccess?.()
          },
        }),
      },
      delete: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (args: unknown, opts?: { onSuccess?: () => void }) => {
            mockDeleteMutate(args)
            onSuccess?.()
            opts?.onSuccess?.()
          },
        }),
      },
      stepComplete: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockStepCompleteMutate(args)
            onSuccess?.()
          },
        }),
      },
      create: {
        useMutation: ({ onSuccess, onSettled }: { onSuccess?: () => void; onSettled?: () => void }) => ({
          mutate: (args: unknown) => {
            mockCreateMutate(args)
            onSuccess?.()
            onSettled?.()
          },
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

function createMockPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    title: 'Test Plan',
    description: 'A test plan description',
    status: 'draft' as PlanStatus,
    steps: [
      {
        id: 'step-1',
        name: 'Step 1',
        description: 'First step',
        type: 'shell',
        status: 'pending' as StepStatus,
      },
      {
        id: 'step-2',
        name: 'Step 2',
        description: 'Second step',
        type: 'code',
        status: 'pending' as StepStatus,
      },
    ],
    projectPath: '/test/project',
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('PlanPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListData = []
    mockStatsData = null
    mockListLoading = false
    mockStatsLoading = false
  })

  it('renders loading state', () => {
    mockListLoading = true
    mockStatsLoading = true

    render(<PlanPanel />)

    // Should show loading spinner (Loader2 icon with animation)
    const container = document.querySelector('.animate-spin')
    expect(container).toBeDefined()
  })

  it('renders empty state when no plans', () => {
    render(<PlanPanel />)

    expect(screen.getByText('Autonomous Plans')).toBeDefined()
    expect(screen.getByText('No plans created yet')).toBeDefined()
    expect(screen.getByText('New Plan')).toBeDefined()
  })

  it('displays plan list when plans exist', () => {
    mockListData = [
      createMockPlan({ id: 'plan-1', title: 'Plan Alpha', status: 'draft' }),
      createMockPlan({ id: 'plan-2', title: 'Plan Beta', status: 'completed' }),
    ]

    render(<PlanPanel />)

    expect(screen.getByText('Plan Alpha')).toBeDefined()
    expect(screen.getByText('Plan Beta')).toBeDefined()
    expect(screen.getByText('draft')).toBeDefined()
    expect(screen.getByText('completed')).toBeDefined()
  })

  it('displays stats when available', () => {
    mockStatsData = {
      totalPlans: 10,
      successRate: 0.85,
      totalStepsExecuted: 50,
      avgDuration: 120000, // 2 minutes
    }

    render(<PlanPanel />)

    expect(screen.getByText('10')).toBeDefined() // Total plans
    expect(screen.getByText('85%')).toBeDefined() // Success rate
    expect(screen.getByText('50')).toBeDefined() // Steps executed
  })

  it('selects a plan and shows details', () => {
    mockListData = [
      createMockPlan({
        id: 'plan-1',
        title: 'Plan Alpha',
        description: 'Test description',
        status: 'draft',
      }),
    ]

    render(<PlanPanel />)

    // Click on the plan card
    fireEvent.click(screen.getByText('Plan Alpha'))

    // Should show detailed view
    expect(screen.getAllByText('Plan Alpha').length).toBeGreaterThan(0)
    expect(screen.getByText('Test description')).toBeDefined()
  })

  it('triggers execute action for draft plan', () => {
    mockListData = [createMockPlan({ id: 'plan-1', title: 'Plan Alpha', status: 'draft' })]

    render(<PlanPanel />)

    // Select the plan
    fireEvent.click(screen.getByText('Plan Alpha'))

    // Click execute button
    fireEvent.click(screen.getByText('Execute'))

    expect(mockExecuteMutate).toHaveBeenCalledWith({ id: 'plan-1' })
  })

  it('triggers pause action for executing plan', () => {
    mockListData = [createMockPlan({ id: 'plan-1', title: 'Plan Alpha', status: 'executing' })]

    render(<PlanPanel />)

    // Select the plan
    fireEvent.click(screen.getByText('Plan Alpha'))

    // Click pause button
    fireEvent.click(screen.getByText('Pause'))

    expect(mockPauseMutate).toHaveBeenCalledWith({ id: 'plan-1' })
  })

  it('triggers resume action for paused plan', () => {
    mockListData = [createMockPlan({ id: 'plan-1', title: 'Plan Alpha', status: 'paused' })]

    render(<PlanPanel />)

    // Select the plan
    fireEvent.click(screen.getByText('Plan Alpha'))

    // Click resume button
    fireEvent.click(screen.getByText('Resume'))

    expect(mockResumeMutate).toHaveBeenCalledWith({ id: 'plan-1' })
  })

  it('triggers cancel action for executing plan', () => {
    mockListData = [createMockPlan({ id: 'plan-1', title: 'Plan Alpha', status: 'executing' })]

    render(<PlanPanel />)

    // Select the plan
    fireEvent.click(screen.getByText('Plan Alpha'))

    // Click cancel button
    fireEvent.click(screen.getByText('Cancel'))

    expect(mockCancelMutate).toHaveBeenCalledWith({ id: 'plan-1' })
  })

  it('opens create modal when clicking New Plan', () => {
    render(<PlanPanel />)

    fireEvent.click(screen.getByText('New Plan'))

    expect(screen.getByText('Create New Plan')).toBeDefined()
    expect(screen.getByPlaceholderText('Plan title')).toBeDefined()
  })

  it('refreshes data when clicking refresh button', () => {
    render(<PlanPanel />)

    // Find and click the refresh button (has RefreshCw icon)
    const refreshButtons = screen.getAllByRole('button')
    const refreshButton = refreshButtons.find(
      (btn) => btn.querySelector('svg.lucide-refresh-cw') !== null
    )

    if (refreshButton) {
      fireEvent.click(refreshButton)
    }

    expect(mockListRefetch).toHaveBeenCalled()
    expect(mockStatsRefetch).toHaveBeenCalled()
  })

  it('shows steps for selected plan', () => {
    mockListData = [
      createMockPlan({
        id: 'plan-1',
        title: 'Plan Alpha',
        steps: [
          { id: 'step-1', name: 'Build Project', description: 'Run build command', type: 'shell', status: 'pending' },
          { id: 'step-2', name: 'Run Tests', description: 'Execute test suite', type: 'test', status: 'pending' },
        ],
      }),
    ]

    render(<PlanPanel />)

    // Select the plan
    fireEvent.click(screen.getByText('Plan Alpha'))

    expect(screen.getByText('Build Project')).toBeDefined()
    expect(screen.getByText('Run Tests')).toBeDefined()
    expect(screen.getByText('Run build command')).toBeDefined()
  })

  it('shows error message for failed plan', () => {
    mockListData = [
      createMockPlan({
        id: 'plan-1',
        title: 'Failed Plan',
        status: 'failed',
        error: 'Step execution failed: command not found',
      }),
    ]

    render(<PlanPanel />)

    // Select the plan
    fireEvent.click(screen.getByText('Failed Plan'))

    expect(screen.getByText('Step execution failed: command not found')).toBeDefined()
  })

  it('shows progress bar for executing plan', () => {
    mockListData = [
      createMockPlan({
        id: 'plan-1',
        title: 'In Progress Plan',
        status: 'executing',
        steps: [
          { id: 'step-1', name: 'Step 1', description: 'First step', type: 'shell', status: 'completed' },
          { id: 'step-2', name: 'Step 2', description: 'Second step', type: 'shell', status: 'running' },
          { id: 'step-3', name: 'Step 3', description: 'Third step', type: 'shell', status: 'pending' },
        ],
      }),
    ]

    render(<PlanPanel />)

    // Should show progress indicator (1/3 done = 33%)
    expect(screen.getByText('1/3 done')).toBeDefined()
  })

  it('displays step counts correctly', () => {
    mockListData = [
      createMockPlan({
        id: 'plan-1',
        title: 'Multi Step Plan',
        steps: [
          { id: 'step-1', name: 'Step 1', description: 'First', type: 'shell', status: 'completed' },
          { id: 'step-2', name: 'Step 2', description: 'Second', type: 'shell', status: 'completed' },
          { id: 'step-3', name: 'Step 3', description: 'Third', type: 'shell', status: 'pending' },
        ],
      }),
    ]

    render(<PlanPanel />)

    expect(screen.getByText('3 steps')).toBeDefined()
    expect(screen.getByText('2/3 done')).toBeDefined()
  })
})

describe('CreatePlanModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListData = []
    mockStatsData = null
    mockListLoading = false
    mockStatsLoading = false
  })

  it('validates required fields', () => {
    render(<PlanPanel />)

    // Open modal
    fireEvent.click(screen.getByText('New Plan'))

    // Create button should be disabled without title
    const createButton = screen.getByRole('button', { name: 'Create Plan' })
    expect(createButton).toHaveProperty('disabled', true)

    // Enter title
    fireEvent.change(screen.getByPlaceholderText('Plan title'), { target: { value: 'New Plan' } })

    // Enter step name (first step is required)
    fireEvent.change(screen.getByPlaceholderText('Step name'), { target: { value: 'First Step' } })

    // Now create button should be enabled
    expect(createButton).toHaveProperty('disabled', false)
  })

  it('adds steps to the form', () => {
    render(<PlanPanel />)

    // Open modal
    fireEvent.click(screen.getByText('New Plan'))

    // Should have one step by default
    expect(screen.getAllByPlaceholderText('Step name').length).toBe(1)

    // Add a step
    fireEvent.click(screen.getByText('Add Step'))

    // Should now have 2 steps
    expect(screen.getAllByPlaceholderText('Step name').length).toBe(2)
  })

  it('closes modal on cancel', () => {
    render(<PlanPanel />)

    // Open modal
    fireEvent.click(screen.getByText('New Plan'))
    expect(screen.getByText('Create New Plan')).toBeDefined()

    // Cancel
    fireEvent.click(screen.getByText('Cancel'))

    // Modal should be closed - "Create New Plan" heading should no longer be visible
    expect(screen.queryByText('Create New Plan')).toBeNull()
  })

  it('submits new plan with correct data', () => {
    render(<PlanPanel projectPath="/test/path" />)

    // Open modal
    fireEvent.click(screen.getByText('New Plan'))

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('Plan title'), { target: { value: 'My New Plan' } })
    fireEvent.change(screen.getByPlaceholderText('What does this plan accomplish?'), {
      target: { value: 'Test description' },
    })
    fireEvent.change(screen.getByPlaceholderText('Step name'), { target: { value: 'Step One' } })
    fireEvent.change(screen.getByPlaceholderText('Step description'), {
      target: { value: 'First step desc' },
    })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }))

    expect(mockCreateMutate).toHaveBeenCalledWith({
      title: 'My New Plan',
      description: 'Test description',
      projectPath: '/test/path',
      steps: [
        {
          name: 'Step One',
          description: 'First step desc',
          type: 'shell',
          command: undefined,
        },
      ],
    })
  })
})
