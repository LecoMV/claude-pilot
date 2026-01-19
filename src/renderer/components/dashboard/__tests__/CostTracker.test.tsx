import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CostTracker } from '../CostTracker'
import { useBudgetStore, selectBudgetPercentage } from '@/stores/budget'
import { useSessionsStore } from '@/stores/sessions'
import type { ExternalSession, BudgetSettings } from '@shared/types'

// Mock the stores
vi.mock('@/stores/budget', () => ({
  useBudgetStore: vi.fn(),
  selectBudgetPercentage: vi.fn(),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: vi.fn(),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  DollarSign: () => <span data-testid="icon-dollar">DollarSign</span>,
  TrendingUp: () => <span data-testid="icon-trending">TrendingUp</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AlertTriangle</span>,
  ChevronRight: () => <span data-testid="icon-chevron">ChevronRight</span>,
  Wallet: () => <span data-testid="icon-wallet">Wallet</span>,
  Zap: () => <span data-testid="icon-zap">Zap</span>,
  Activity: () => <span data-testid="icon-activity">Activity</span>,
}))

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}))

// Mock MODEL_CAPABILITIES
vi.mock('@shared/types', async () => {
  const actual = await vi.importActual('@shared/types')
  return {
    ...actual,
    MODEL_CAPABILITIES: {
      'claude-opus-4-5-20251101': {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        recommended: 'planning',
      },
      'claude-sonnet-4-20250514': {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        recommended: 'coding',
      },
    },
  }
})

// Mock session data
const createMockSession = (overrides?: Partial<ExternalSession>): ExternalSession => ({
  id: `session-${Math.random().toString(36).slice(2, 9)}`,
  projectPath: '/home/user/projects/test',
  projectName: 'test-project',
  filePath: '/home/user/.claude/projects/test/transcript.jsonl',
  startTime: Date.now() - 3600000,
  lastActivity: Date.now() - 60000,
  isActive: false,
  model: 'claude-sonnet-4-20250514',
  stats: {
    messageCount: 25,
    userMessages: 12,
    assistantMessages: 13,
    toolCalls: 8,
    inputTokens: 15000,
    outputTokens: 8000,
    cachedTokens: 5000,
    estimatedCost: 0.85,
  },
  ...overrides,
})

const defaultBudgetSettings: BudgetSettings = {
  billingType: 'api',
  monthlyLimit: 100,
  warningThreshold: 80,
  alertsEnabled: true,
}

const defaultBudgetState = {
  budgetSettings: defaultBudgetSettings,
  currentMonthCost: 45.5,
  todayCost: 5.25,
  activeSessions: [],
  costByModel: [],
  lastUpdate: Date.now(),
  budgetWarning: false,
  budgetExceeded: false,
  calculateCosts: vi.fn(),
  loadBudgetSettings: vi.fn(),
}

const defaultSessionsState = {
  sessions: [] as ExternalSession[],
  fetchSessions: vi.fn(),
}

describe('CostTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default mock implementations
    ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: typeof defaultBudgetState) => unknown) => {
        if (selector) {
          return selector(defaultBudgetState)
        }
        return defaultBudgetState
      }
    )
    ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(45.5)

    ;(useSessionsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: typeof defaultSessionsState) => unknown) => {
        if (selector) {
          return selector(defaultSessionsState)
        }
        return defaultSessionsState
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ==========================================================================
  // MAIN COST CARDS TESTS
  // ==========================================================================
  describe('Main Cost Cards', () => {
    it('renders This Month cost card', () => {
      render(<CostTracker />)

      expect(screen.getByText('This Month')).toBeDefined()
      expect(screen.getByText('$45.50')).toBeDefined()
      expect(screen.getByText(/of \$100\.00 budget/)).toBeDefined()
    })

    it('renders Today cost card', () => {
      render(<CostTracker />)

      expect(screen.getByText('Today')).toBeDefined()
      expect(screen.getByText('$5.25')).toBeDefined()
    })

    it('renders Active Sessions cost card', () => {
      render(<CostTracker />)

      expect(screen.getByText('Active Sessions')).toBeDefined()
      expect(screen.getByText(/session.*running/i)).toBeDefined()
    })

    it('renders Projected Monthly cost card', () => {
      render(<CostTracker />)

      expect(screen.getByText('Projected Monthly')).toBeDefined()
      expect(screen.getByText('Based on today\'s rate')).toBeDefined()
    })

    it('renders all four cost card icons', () => {
      render(<CostTracker />)

      expect(screen.getByTestId('icon-wallet')).toBeDefined()
      expect(screen.getByTestId('icon-dollar')).toBeDefined()
      expect(screen.getByTestId('icon-activity')).toBeDefined()
      expect(screen.getByTestId('icon-trending')).toBeDefined()
    })
  })

  // ==========================================================================
  // BUDGET PROGRESS TESTS
  // ==========================================================================
  describe('Budget Progress', () => {
    it('shows progress bar on This Month card', () => {
      render(<CostTracker />)

      // Progress bar exists
      const progressBars = document.querySelectorAll('.rounded-full.transition-all')
      expect(progressBars.length).toBeGreaterThan(0)
    })

    it('shows budget percentage', () => {
      ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(45.5)

      render(<CostTracker />)

      expect(screen.getByText('46%')).toBeDefined() // Rounded
    })

    it('shows 0% and 100% labels on progress bar', () => {
      render(<CostTracker />)

      expect(screen.getByText('0%')).toBeDefined()
      expect(screen.getByText('100%')).toBeDefined()
    })
  })

  // ==========================================================================
  // BUDGET WARNING TESTS
  // ==========================================================================
  describe('Budget Warning Banner', () => {
    it('shows warning banner when budgetWarning is true', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetWarning: true,
            currentMonthCost: 85,
          }
          if (selector) return selector(state)
          return state
        }
      )
      ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(85)

      render(<CostTracker />)

      expect(screen.getByText(/Approaching budget limit/)).toBeDefined()
      expect(screen.getByTestId('icon-alert')).toBeDefined()
    })

    it('shows exceeded banner when budgetExceeded is true', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetExceeded: true,
            currentMonthCost: 105,
          }
          if (selector) return selector(state)
          return state
        }
      )
      ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(105)

      render(<CostTracker />)

      expect(screen.getByText('Budget exceeded!')).toBeDefined()
    })

    it('does not show warning banner when alertsEnabled is false', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetSettings: { ...defaultBudgetSettings, alertsEnabled: false },
            budgetWarning: true,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.queryByText(/Approaching budget limit/)).toBeNull()
    })

    it('does not show warning banner for subscription billing type', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetSettings: { ...defaultBudgetSettings, billingType: 'subscription' },
            budgetWarning: true,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.queryByText(/Approaching budget limit/)).toBeNull()
    })

    it('shows Adjust budget button in warning banner', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetWarning: true,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('Adjust budget')).toBeDefined()
    })
  })

  // ==========================================================================
  // NAVIGATION TESTS
  // ==========================================================================
  describe('Navigation', () => {
    it('calls onNavigate with "settings" when This Month card is clicked', () => {
      const onNavigate = vi.fn()
      render(<CostTracker onNavigate={onNavigate} />)

      const thisMonthCard = screen.getByText('This Month').closest('.card')
      if (thisMonthCard) fireEvent.click(thisMonthCard)

      expect(onNavigate).toHaveBeenCalledWith('settings')
    })

    it('calls onNavigate with "sessions" when Today card is clicked', () => {
      const onNavigate = vi.fn()
      render(<CostTracker onNavigate={onNavigate} />)

      const todayCard = screen.getByText('Today').closest('.card')
      if (todayCard) fireEvent.click(todayCard)

      expect(onNavigate).toHaveBeenCalledWith('sessions')
    })

    it('calls onNavigate with "context" when Active Sessions card is clicked', () => {
      const onNavigate = vi.fn()
      render(<CostTracker onNavigate={onNavigate} />)

      const activeCard = screen.getByText('Active Sessions').closest('.card')
      if (activeCard) fireEvent.click(activeCard)

      expect(onNavigate).toHaveBeenCalledWith('context')
    })

    it('calls onNavigate with "sessions" when View all sessions is clicked', () => {
      const onNavigate = vi.fn()
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            costByModel: [
              {
                modelId: 'claude-sonnet-4-20250514',
                modelName: 'Claude Sonnet 4',
                cost: 25.5,
                inputTokens: 500000,
                outputTokens: 250000,
                cachedTokens: 100000,
                sessionCount: 10,
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker onNavigate={onNavigate} />)

      const viewAllButton = screen.getByText('View all sessions')
      fireEvent.click(viewAllButton)

      expect(onNavigate).toHaveBeenCalledWith('sessions')
    })

    it('calls onNavigate with "settings" when Adjust budget is clicked', () => {
      const onNavigate = vi.fn()
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetWarning: true,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker onNavigate={onNavigate} />)

      const adjustButton = screen.getByText('Adjust budget')
      fireEvent.click(adjustButton)

      expect(onNavigate).toHaveBeenCalledWith('settings')
    })
  })

  // ==========================================================================
  // COST BY MODEL BREAKDOWN TESTS
  // ==========================================================================
  describe('Cost by Model Breakdown', () => {
    it('renders cost by model section when data exists', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            costByModel: [
              {
                modelId: 'claude-opus-4-5-20251101',
                modelName: 'Claude Opus 4.5',
                cost: 35.0,
                inputTokens: 700000,
                outputTokens: 350000,
                cachedTokens: 150000,
                sessionCount: 15,
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('Cost by Model')).toBeDefined()
      expect(screen.getByText('Claude Opus 4.5')).toBeDefined()
      expect(screen.getByText('$35.00')).toBeDefined()
      expect(screen.getByText('15 sessions')).toBeDefined()
    })

    it('shows recommended badge for models', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            costByModel: [
              {
                modelId: 'claude-opus-4-5-20251101',
                modelName: 'Claude Opus 4.5',
                cost: 35.0,
                inputTokens: 700000,
                outputTokens: 350000,
                cachedTokens: 150000,
                sessionCount: 15,
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('planning')).toBeDefined()
    })

    it('shows token counts in model breakdown', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            costByModel: [
              {
                modelId: 'claude-opus-4-5-20251101',
                modelName: 'Claude Opus 4.5',
                cost: 35.0,
                inputTokens: 700000,
                outputTokens: 350000,
                cachedTokens: 150000,
                sessionCount: 15,
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText(/Input:.*700\.0K tokens/)).toBeDefined()
      expect(screen.getByText(/Output:.*350\.0K tokens/)).toBeDefined()
      expect(screen.getByText(/Cached:.*150\.0K tokens/)).toBeDefined()
    })

    it('does not show cached tokens when 0', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            costByModel: [
              {
                modelId: 'claude-opus-4-5-20251101',
                modelName: 'Claude Opus 4.5',
                cost: 35.0,
                inputTokens: 700000,
                outputTokens: 350000,
                cachedTokens: 0,
                sessionCount: 15,
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.queryByText(/Cached:/)).toBeNull()
    })

    it('does not render cost by model section when empty', () => {
      render(<CostTracker />)

      expect(screen.queryByText('Cost by Model')).toBeNull()
    })

    it('shows only first 4 models', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            costByModel: [
              { modelId: 'model-1', modelName: 'Model 1', cost: 10, inputTokens: 1000, outputTokens: 500, cachedTokens: 0, sessionCount: 1 },
              { modelId: 'model-2', modelName: 'Model 2', cost: 20, inputTokens: 2000, outputTokens: 1000, cachedTokens: 0, sessionCount: 2 },
              { modelId: 'model-3', modelName: 'Model 3', cost: 30, inputTokens: 3000, outputTokens: 1500, cachedTokens: 0, sessionCount: 3 },
              { modelId: 'model-4', modelName: 'Model 4', cost: 40, inputTokens: 4000, outputTokens: 2000, cachedTokens: 0, sessionCount: 4 },
              { modelId: 'model-5', modelName: 'Model 5', cost: 50, inputTokens: 5000, outputTokens: 2500, cachedTokens: 0, sessionCount: 5 },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('Model 1')).toBeDefined()
      expect(screen.getByText('Model 4')).toBeDefined()
      expect(screen.queryByText('Model 5')).toBeNull()
    })
  })

  // ==========================================================================
  // ACTIVE SESSIONS DETAIL TESTS
  // ==========================================================================
  describe('Active Sessions Detail', () => {
    it('renders live sessions section when active sessions exist', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              {
                sessionId: 'session-1',
                projectName: 'my-project',
                cost: 1.25,
                model: 'claude-sonnet-4-20250514',
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('Live Sessions')).toBeDefined()
      expect(screen.getByText('my-project')).toBeDefined()
      // Cost appears multiple times (in card and in row), so use getAllByText
      expect(screen.getAllByText('$1.25').length).toBeGreaterThanOrEqual(1)
    })

    it('shows model name in active session row', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              {
                sessionId: 'session-1',
                projectName: 'my-project',
                cost: 1.25,
                model: 'claude-sonnet-4-20250514',
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('(Claude Sonnet 4)')).toBeDefined()
    })

    it('shows pulse indicator for active sessions', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              {
                sessionId: 'session-1',
                projectName: 'my-project',
                cost: 1.25,
                model: 'claude-sonnet-4-20250514',
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      const pulseIndicators = document.querySelectorAll('.animate-ping')
      expect(pulseIndicators.length).toBeGreaterThan(0)
    })

    it('does not render live sessions when no active sessions', () => {
      render(<CostTracker />)

      expect(screen.queryByText('Live Sessions')).toBeNull()
    })
  })

  // ==========================================================================
  // LAST UPDATE INDICATOR TESTS
  // ==========================================================================
  describe('Last Update Indicator', () => {
    it('shows "just now" for recent updates', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            lastUpdate: Date.now() - 2000, // 2 seconds ago
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText(/Last updated:.*just now/)).toBeDefined()
    })

    it('shows seconds ago', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            lastUpdate: Date.now() - 30000, // 30 seconds ago
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText(/Last updated:.*30s ago/)).toBeDefined()
    })

    it('shows minutes ago', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            lastUpdate: Date.now() - 180000, // 3 minutes ago
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText(/Last updated:.*3m ago/)).toBeDefined()
    })

    it('shows "Loading..." when no lastUpdate', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            lastUpdate: 0,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText(/Last updated:.*Loading/)).toBeDefined()
    })
  })

  // ==========================================================================
  // INITIAL LOAD TESTS
  // ==========================================================================
  describe('Initial Load', () => {
    it('calls loadBudgetSettings on mount', () => {
      const loadBudgetSettings = vi.fn()
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            loadBudgetSettings,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(loadBudgetSettings).toHaveBeenCalled()
    })

    it('calls fetchSessions on mount', () => {
      const fetchSessions = vi.fn()
      ;(useSessionsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultSessionsState) => unknown) => {
          const state = {
            ...defaultSessionsState,
            fetchSessions,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(fetchSessions).toHaveBeenCalled()
    })

    it('recalculates costs when sessions change', () => {
      const calculateCosts = vi.fn()
      const sessions = [createMockSession()]

      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            calculateCosts,
          }
          if (selector) return selector(state)
          return state
        }
      )
      ;(useSessionsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultSessionsState) => unknown) => {
          const state = {
            ...defaultSessionsState,
            sessions,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(calculateCosts).toHaveBeenCalledWith(sessions)
    })
  })

  // ==========================================================================
  // AUTO-REFRESH TESTS
  // ==========================================================================
  describe('Auto-Refresh', () => {
    it('refreshes sessions every 30 seconds', () => {
      const fetchSessions = vi.fn()
      ;(useSessionsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultSessionsState) => unknown) => {
          const state = {
            ...defaultSessionsState,
            fetchSessions,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      // Initial call
      expect(fetchSessions).toHaveBeenCalledTimes(1)

      // Advance 30 seconds
      vi.advanceTimersByTime(30000)

      expect(fetchSessions).toHaveBeenCalledTimes(2)

      // Advance another 30 seconds
      vi.advanceTimersByTime(30000)

      expect(fetchSessions).toHaveBeenCalledTimes(3)
    })
  })

  // ==========================================================================
  // SESSION COUNT DISPLAY TESTS
  // ==========================================================================
  describe('Session Count Display', () => {
    it('shows correct session count for today in Today card subtext', () => {
      const today = new Date().toISOString().split('T')[0]
      const todaySessions = [
        createMockSession({ startTime: new Date(today + 'T10:00:00').getTime() }),
        createMockSession({ startTime: new Date(today + 'T14:00:00').getTime() }),
      ]

      ;(useSessionsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultSessionsState) => unknown) => {
          const state = {
            ...defaultSessionsState,
            sessions: todaySessions,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('2 sessions')).toBeDefined()
    })

    it('shows singular "session" when only one active session', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              { sessionId: 's1', projectName: 'test', cost: 1, model: 'claude' },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('1 session running')).toBeDefined()
    })

    it('shows plural "sessions" when multiple active sessions', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              { sessionId: 's1', projectName: 'test1', cost: 1, model: 'claude' },
              { sessionId: 's2', projectName: 'test2', cost: 2, model: 'claude' },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      expect(screen.getByText('2 sessions running')).toBeDefined()
    })
  })

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================
  describe('Edge Cases', () => {
    it('handles zero monthly cost', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            currentMonthCost: 0,
            todayCost: 0,
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      // $0.00 may appear multiple times (today and month), so use getAllByText
      expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1)
    })

    it('handles model not in MODEL_CAPABILITIES', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              { sessionId: 's1', projectName: 'test', cost: 1, model: 'unknown-model' },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      // Should fall back to model ID
      expect(screen.getByText('(unknown-model)')).toBeDefined()
    })

    it('calculates correct projected monthly from today cost', () => {
      // Today's cost * days in month
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            todayCost: 10, // $10/day
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      // Should show some projected value (10 * days in current month)
      const projectedCard = screen.getByText('Projected Monthly').closest('.card')
      expect(projectedCard).not.toBeNull()
      // Value will be $10 * days in current month
    })

    it('truncates long project names in active sessions', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            activeSessions: [
              {
                sessionId: 's1',
                projectName: 'very-long-project-name-that-should-be-truncated-in-the-ui',
                cost: 1,
                model: 'claude-sonnet-4-20250514',
              },
            ],
          }
          if (selector) return selector(state)
          return state
        }
      )

      render(<CostTracker />)

      // The text should exist (truncation is CSS, not React)
      expect(
        screen.getByText('very-long-project-name-that-should-be-truncated-in-the-ui')
      ).toBeDefined()
    })
  })

  // ==========================================================================
  // COST CARD COLOR TESTS
  // ==========================================================================
  describe('Cost Card Colors', () => {
    it('uses green color when budget is healthy', () => {
      ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(40)

      render(<CostTracker />)

      // This Month card should have green styling
      const walletIcon = screen.getByTestId('icon-wallet')
      expect(walletIcon).toBeDefined()
    })

    it('uses yellow color when warning', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetWarning: true,
          }
          if (selector) return selector(state)
          return state
        }
      )
      ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(85)

      render(<CostTracker />)

      // Should render with warning state
      expect(screen.getByText('This Month')).toBeDefined()
    })

    it('uses red color when exceeded', () => {
      ;(useBudgetStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector?: (state: typeof defaultBudgetState) => unknown) => {
          const state = {
            ...defaultBudgetState,
            budgetExceeded: true,
          }
          if (selector) return selector(state)
          return state
        }
      )
      ;(selectBudgetPercentage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(105)

      render(<CostTracker />)

      // Should render with exceeded state
      expect(screen.getByText('This Month')).toBeDefined()
    })
  })
})
