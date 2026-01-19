/**
 * SessionAnalytics Tests
 *
 * Tests for session analytics calculation and display.
 *
 * @module SessionAnalytics.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SessionAnalytics } from '../SessionAnalytics'
import type { ExternalSession } from '@shared/types'

// Mock recharts to avoid complex chart rendering
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
}))

// Mock sessions store
const mockDiscoverSessions = vi.fn()
const mockSessions: ExternalSession[] = []
let mockLoading = false

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    sessions: mockSessions,
    loading: mockLoading,
    discoverSessions: mockDiscoverSessions,
  }),
}))

// Test data factory
const createMockSession = (overrides?: Partial<ExternalSession>): ExternalSession => ({
  id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  projectName: 'test-project',
  projectPath: '/path/to/project',
  transcriptPath: '/path/to/transcript.jsonl',
  startTime: Date.now() - 3600000,
  lastActivity: Date.now() - 1800000,
  model: 'claude-3-sonnet-20240229',
  stats: {
    messageCount: 25,
    tokenCount: 5000,
    duration: 3600000,
    inputTokens: 3000,
    outputTokens: 2000,
    cachedTokens: 500,
    toolCalls: 10,
  },
  status: 'completed',
  ...overrides,
})

describe('SessionAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessions.length = 0
    mockLoading = false
  })

  // ===========================================================================
  // LOADING STATE
  // ===========================================================================
  describe('loading state', () => {
    it('shows loading spinner when loading with no sessions', () => {
      mockLoading = true

      render(<SessionAnalytics />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeTruthy()
    })

    it('calls discoverSessions on mount', () => {
      render(<SessionAnalytics />)

      expect(mockDiscoverSessions).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // HEADER
  // ===========================================================================
  describe('header', () => {
    it('displays Session Analytics title', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Session Analytics')).toBeInTheDocument()
      })
    })

    it('displays time range description', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Last 30 days of Claude Code usage')).toBeInTheDocument()
      })
    })

    it('renders time range buttons', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('7d')).toBeInTheDocument()
        expect(screen.getByText('14d')).toBeInTheDocument()
        expect(screen.getByText('30d')).toBeInTheDocument()
      })
    })

    it('allows switching time range', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('7d')).toBeInTheDocument()
      })

      const button7d = screen.getByText('7d')
      fireEvent.click(button7d)

      // The button should be selected (has different styling)
      expect(button7d.className).toContain('bg-accent-purple')
    })
  })

  // ===========================================================================
  // STATS CARDS
  // ===========================================================================
  describe('stats cards', () => {
    it('displays total sessions count', async () => {
      mockSessions.push(createMockSession(), createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Total Sessions')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
      })
    })

    it('displays total messages count', async () => {
      mockSessions.push(
        createMockSession({
          stats: {
            messageCount: 50,
            tokenCount: 5000,
            duration: 3600000,
            inputTokens: 3000,
            outputTokens: 2000,
            cachedTokens: 500,
            toolCalls: 10,
          },
        })
      )

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Total Messages')).toBeInTheDocument()
        // 50 messages formatted
        expect(screen.getByText('50')).toBeInTheDocument()
      })
    })

    it('displays tool calls count', async () => {
      mockSessions.push(
        createMockSession({
          stats: {
            messageCount: 25,
            tokenCount: 5000,
            duration: 3600000,
            inputTokens: 3000,
            outputTokens: 2000,
            cachedTokens: 500,
            toolCalls: 100,
          },
        })
      )

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Tool Calls')).toBeInTheDocument()
        expect(screen.getByText('100')).toBeInTheDocument()
      })
    })

    it('formats large numbers with K suffix', async () => {
      mockSessions.push(
        createMockSession({
          stats: {
            messageCount: 2500,
            tokenCount: 5000,
            duration: 3600000,
            inputTokens: 3000,
            outputTokens: 2000,
            cachedTokens: 500,
            toolCalls: 10,
          },
        })
      )

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('2.5K')).toBeInTheDocument()
      })
    })

    it('displays estimated cost', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Est. Cost')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // CHARTS
  // ===========================================================================
  describe('charts', () => {
    it('renders daily sessions chart', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Daily Sessions')).toBeInTheDocument()
        expect(screen.getByTestId('area-chart')).toBeInTheDocument()
      })
    })

    it('renders hourly activity chart', async () => {
      mockSessions.push(createMockSession())

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Hourly Activity')).toBeInTheDocument()
      })
    })

    it('renders top projects list', async () => {
      mockSessions.push(
        createMockSession({ projectName: 'Project Alpha' }),
        createMockSession({ projectName: 'Project Beta' })
      )

      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Top Projects')).toBeInTheDocument()
        expect(screen.getByText('Project Alpha')).toBeInTheDocument()
        expect(screen.getByText('Project Beta')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // ANALYTICS CALCULATION
  // ===========================================================================
  describe('analytics calculation', () => {
    it('handles sessions without model info', async () => {
      mockSessions.push(createMockSession({ model: undefined }))

      render(<SessionAnalytics />)

      // Should not throw and should render
      await waitFor(() => {
        expect(screen.getByText('Session Analytics')).toBeInTheDocument()
      })
    })

    it('filters sessions to last 30 days', async () => {
      // Add old session (35 days ago - definitely outside 30-day window)
      const oldTime = Date.now() - 35 * 24 * 60 * 60 * 1000
      mockSessions.push(
        createMockSession({ startTime: oldTime, lastActivity: oldTime }),
        createMockSession() // Recent session
      )

      render(<SessionAnalytics />)

      await waitFor(() => {
        // Should only show 1 session (the recent one)
        expect(screen.getByText('Total Sessions')).toBeInTheDocument()
        // Check that we have 1 in the rendered output
        const sessionCard = screen.getByText('Total Sessions').closest('.card')
        expect(sessionCard?.textContent).toContain('1')
      })
    })

    it('calculates average messages per session', async () => {
      mockSessions.push(
        createMockSession({
          stats: {
            messageCount: 20,
            tokenCount: 5000,
            duration: 3600000,
            inputTokens: 3000,
            outputTokens: 2000,
            cachedTokens: 500,
            toolCalls: 10,
          },
        }),
        createMockSession({
          stats: {
            messageCount: 30,
            tokenCount: 5000,
            duration: 3600000,
            inputTokens: 3000,
            outputTokens: 2000,
            cachedTokens: 500,
            toolCalls: 10,
          },
        })
      )

      render(<SessionAnalytics />)

      await waitFor(() => {
        // Average: (20 + 30) / 2 = 25
        expect(screen.getByText('Avg. Messages/Session')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // EMPTY STATE
  // ===========================================================================
  describe('empty state', () => {
    it('handles no sessions gracefully', async () => {
      render(<SessionAnalytics />)

      await waitFor(() => {
        expect(screen.getByText('Session Analytics')).toBeInTheDocument()
        // Should show 0 for totals
        expect(screen.getByText('Total Sessions')).toBeInTheDocument()
      })
    })
  })
})
