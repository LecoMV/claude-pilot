/**
 * ErrorNotifications Component Tests
 *
 * Tests the error notification components including:
 * - ErrorNotificationsPanel: Displays list of errors
 * - ErrorToast: Toast-style notifications
 * - ErrorBadge: Badge indicator for unread errors
 * - Severity icons and colors
 * - Dismiss behavior
 * - Auto-dismiss for non-critical errors
 * - Error listener initialization
 *
 * @module ErrorNotifications.test
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ErrorNotificationsPanel,
  ErrorToast,
  ErrorBadge,
} from '../ErrorNotifications'
import {
  useErrorStore,
  initializeErrorListener,
  type ErrorNotification,
} from '@/stores/errors'

// ===========================================================================
// MOCK SETUP
// ===========================================================================

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertTriangle: ({ className }: { className?: string }) => (
    <span data-testid="icon-triangle" className={className}>
      Triangle
    </span>
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-circle" className={className}>
      Circle
    </span>
  ),
  AlertOctagon: ({ className }: { className?: string }) => (
    <span data-testid="icon-octagon" className={className}>
      Octagon
    </span>
  ),
  Info: ({ className }: { className?: string }) => (
    <span data-testid="icon-info" className={className}>
      Info
    </span>
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="icon-x" className={className}>
      X
    </span>
  ),
  Bell: ({ className }: { className?: string }) => (
    <span data-testid="icon-bell" className={className}>
      Bell
    </span>
  ),
  Trash2: ({ className }: { className?: string }) => (
    <span data-testid="icon-trash" className={className}>
      Trash
    </span>
  ),
}))

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// ===========================================================================
// TEST UTILITIES
// ===========================================================================

const createMockError = (overrides: Partial<ErrorNotification> = {}): ErrorNotification => ({
  id: `error-${Date.now()}-${Math.random()}`,
  code: 'ERR_TEST',
  message: 'Test error message',
  severity: 'error',
  category: 'unknown',
  timestamp: Date.now(),
  dismissed: false,
  ...overrides,
})

const resetStoreState = () => {
  useErrorStore.setState({
    errors: [],
    unreadCount: 0,
  })
}

// ===========================================================================
// ErrorNotificationsPanel TESTS
// ===========================================================================

describe('ErrorNotificationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // RENDERING
  // =========================================================================

  describe('Rendering', () => {
    it('renders nothing when no errors', () => {
      render(<ErrorNotificationsPanel />)

      expect(screen.queryByText('Notifications')).toBeNull()
    })

    it('renders panel when errors exist', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText(/Notifications/)).toBeDefined()
    })

    it('displays error count in header', () => {
      useErrorStore.setState({
        errors: [createMockError(), createMockError()],
        unreadCount: 2,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('Notifications (2)')).toBeDefined()
    })

    it('renders bell icon in header', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByTestId('icon-bell')).toBeDefined()
    })

    it('renders dismiss all button', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('Dismiss All')).toBeDefined()
    })

    it('renders clear button', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByTestId('icon-trash')).toBeDefined()
    })

    it('applies custom className', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel className="my-custom-class" />)

      const panel = document.querySelector('.my-custom-class')
      expect(panel).not.toBeNull()
    })
  })

  // =========================================================================
  // ERROR ITEM DISPLAY
  // =========================================================================

  describe('Error Item Display', () => {
    it('displays error message', () => {
      useErrorStore.setState({
        errors: [createMockError({ message: 'Connection failed' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('Connection failed')).toBeDefined()
    })

    it('displays error code', () => {
      useErrorStore.setState({
        errors: [createMockError({ code: 'ERR_NETWORK' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('ERR_NETWORK')).toBeDefined()
    })

    it('displays timestamp', () => {
      const timestamp = Date.now()
      useErrorStore.setState({
        errors: [createMockError({ timestamp })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const timeString = new Date(timestamp).toLocaleTimeString()
      expect(screen.getByText(timeString)).toBeDefined()
    })

    it('displays action button when action provided', () => {
      const actionHandler = vi.fn()
      useErrorStore.setState({
        errors: [
          createMockError({
            action: { label: 'Retry', handler: actionHandler },
          }),
        ],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('Retry')).toBeDefined()
    })

    it('calls action handler when action button clicked', () => {
      const actionHandler = vi.fn()
      useErrorStore.setState({
        errors: [
          createMockError({
            action: { label: 'Retry', handler: actionHandler },
          }),
        ],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      fireEvent.click(screen.getByText('Retry'))

      expect(actionHandler).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // SEVERITY ICONS
  // =========================================================================

  describe('Severity Icons', () => {
    it('shows octagon icon for critical severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'critical' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByTestId('icon-octagon')).toBeDefined()
    })

    it('shows triangle icon for error severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'error' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByTestId('icon-triangle')).toBeDefined()
    })

    it('shows circle icon for warning severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'warning' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByTestId('icon-circle')).toBeDefined()
    })

    it('shows info icon for info severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'info' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByTestId('icon-info')).toBeDefined()
    })
  })

  // =========================================================================
  // SEVERITY COLORS
  // =========================================================================

  describe('Severity Colors', () => {
    it('applies red styling for critical severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'critical' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const errorItem = document.querySelector('.bg-accent-red\\/10')
      expect(errorItem).not.toBeNull()
    })

    it('applies red styling for error severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'error' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const errorItem = document.querySelector('.bg-accent-red\\/10')
      expect(errorItem).not.toBeNull()
    })

    it('applies yellow styling for warning severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'warning' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const errorItem = document.querySelector('.bg-accent-yellow\\/10')
      expect(errorItem).not.toBeNull()
    })

    it('applies blue styling for info severity', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'info' })],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const errorItem = document.querySelector('.bg-accent-blue\\/10')
      expect(errorItem).not.toBeNull()
    })
  })

  // =========================================================================
  // DISMISS BEHAVIOR
  // =========================================================================

  describe('Dismiss Behavior', () => {
    it('dismisses individual error when X clicked', () => {
      const error = createMockError({ id: 'error-1' })
      useErrorStore.setState({
        errors: [error],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const dismissButton = screen.getByTestId('icon-x').closest('button')
      if (dismissButton) {
        fireEvent.click(dismissButton)
      }

      const state = useErrorStore.getState()
      expect(state.errors[0].dismissed).toBe(true)
    })

    it('hides dismissed errors', () => {
      useErrorStore.setState({
        errors: [
          createMockError({ id: 'error-1', message: 'Visible error', dismissed: false }),
          createMockError({ id: 'error-2', message: 'Hidden error', dismissed: true }),
        ],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('Visible error')).toBeDefined()
      expect(screen.queryByText('Hidden error')).toBeNull()
    })

    it('dismisses all errors when Dismiss All clicked', () => {
      useErrorStore.setState({
        errors: [
          createMockError({ id: 'error-1' }),
          createMockError({ id: 'error-2' }),
        ],
        unreadCount: 2,
      })

      render(<ErrorNotificationsPanel />)

      fireEvent.click(screen.getByText('Dismiss All'))

      const state = useErrorStore.getState()
      expect(state.errors.every((e) => e.dismissed)).toBe(true)
    })

    it('clears all errors when clear button clicked', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      const clearButton = screen.getByTestId('icon-trash').closest('button')
      if (clearButton) {
        fireEvent.click(clearButton)
      }

      const state = useErrorStore.getState()
      expect(state.errors.length).toBe(0)
    })
  })

  // =========================================================================
  // MAX VISIBLE LIMIT
  // =========================================================================

  describe('Max Visible Limit', () => {
    it('limits visible errors to maxVisible', () => {
      const errors = Array.from({ length: 10 }, (_, i) =>
        createMockError({ id: `error-${i}`, message: `Error ${i}` })
      )
      useErrorStore.setState({
        errors,
        unreadCount: 10,
      })

      render(<ErrorNotificationsPanel maxVisible={3} />)

      // Should show 3 errors and "+7 more" message
      expect(screen.getByText('+7 more notifications')).toBeDefined()
    })

    it('defaults to showing 5 errors', () => {
      const errors = Array.from({ length: 8 }, (_, i) =>
        createMockError({ id: `error-${i}`, message: `Error ${i}` })
      )
      useErrorStore.setState({
        errors,
        unreadCount: 8,
      })

      render(<ErrorNotificationsPanel />)

      expect(screen.getByText('+3 more notifications')).toBeDefined()
    })

    it('does not show "more" message when within limit', () => {
      const errors = Array.from({ length: 3 }, (_, i) =>
        createMockError({ id: `error-${i}`, message: `Error ${i}` })
      )
      useErrorStore.setState({
        errors,
        unreadCount: 3,
      })

      render(<ErrorNotificationsPanel maxVisible={5} />)

      expect(screen.queryByText(/more notifications/)).toBeNull()
    })
  })

  // =========================================================================
  // ERROR LISTENER
  // =========================================================================

  describe('Error Listener', () => {
    it('initializes error listener on mount', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorNotificationsPanel />)

      expect(window.electron.on).toHaveBeenCalledWith('error:occurred', expect.any(Function))
    })

    it('unsubscribes on unmount', () => {
      const unsubscribe = vi.fn()
      ;(window.electron.on as ReturnType<typeof vi.fn>).mockReturnValue(unsubscribe)

      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      const { unmount } = render(<ErrorNotificationsPanel />)
      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })
  })
})

// ===========================================================================
// ErrorToast TESTS
// ===========================================================================

describe('ErrorToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // =========================================================================
  // RENDERING
  // =========================================================================

  describe('Rendering', () => {
    it('renders nothing when no errors', () => {
      render(<ErrorToast />)

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('renders toast for latest undismissed error', () => {
      useErrorStore.setState({
        errors: [createMockError({ message: 'Toast message' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      expect(screen.getByText('Toast message')).toBeDefined()
    })

    it('displays error code', () => {
      useErrorStore.setState({
        errors: [createMockError({ code: 'ERR_TOAST' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      expect(screen.getByText('ERR_TOAST')).toBeDefined()
    })

    it('shows severity icon', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'error' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      expect(screen.getByTestId('icon-triangle')).toBeDefined()
    })
  })

  // =========================================================================
  // AUTO-DISMISS
  // =========================================================================

  describe('Auto-Dismiss', () => {
    it('auto-dismisses non-critical errors after 5 seconds', async () => {
      useErrorStore.setState({
        errors: [createMockError({ id: 'error-1', severity: 'error' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      const state = useErrorStore.getState()
      expect(state.errors[0].dismissed).toBe(true)
    })

    it('does not auto-dismiss critical errors', async () => {
      useErrorStore.setState({
        errors: [createMockError({ id: 'error-1', severity: 'critical' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      await act(async () => {
        vi.advanceTimersByTime(10000)
      })

      const state = useErrorStore.getState()
      expect(state.errors[0].dismissed).toBe(false)
    })

    it('auto-dismisses warning severity', async () => {
      useErrorStore.setState({
        errors: [createMockError({ id: 'error-1', severity: 'warning' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      const state = useErrorStore.getState()
      expect(state.errors[0].dismissed).toBe(true)
    })

    it('auto-dismisses info severity', async () => {
      useErrorStore.setState({
        errors: [createMockError({ id: 'error-1', severity: 'info' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      const state = useErrorStore.getState()
      expect(state.errors[0].dismissed).toBe(true)
    })
  })

  // =========================================================================
  // MANUAL DISMISS
  // =========================================================================

  describe('Manual Dismiss', () => {
    it('dismisses toast when X clicked', () => {
      useErrorStore.setState({
        errors: [createMockError({ id: 'error-1' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const dismissButton = screen.getByTestId('icon-x').closest('button')
      if (dismissButton) {
        fireEvent.click(dismissButton)
      }

      const state = useErrorStore.getState()
      expect(state.errors[0].dismissed).toBe(true)
    })
  })

  // =========================================================================
  // SEVERITY STYLING
  // =========================================================================

  describe('Severity Styling', () => {
    it('applies red background for critical', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'critical' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const toast = document.querySelector('.bg-accent-red')
      expect(toast).not.toBeNull()
    })

    it('applies red/90 background for error', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'error' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const toast = document.querySelector('.bg-accent-red\\/90')
      expect(toast).not.toBeNull()
    })

    it('applies yellow background for warning', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'warning' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const toast = document.querySelector('.bg-accent-yellow\\/90')
      expect(toast).not.toBeNull()
    })

    it('applies blue background for info', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'info' })],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const toast = document.querySelector('.bg-accent-blue\\/90')
      expect(toast).not.toBeNull()
    })
  })

  // =========================================================================
  // POSITIONING
  // =========================================================================

  describe('Positioning', () => {
    it('positions toast fixed at bottom right', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const toast = document.querySelector('.fixed.bottom-4.right-4')
      expect(toast).not.toBeNull()
    })

    it('has high z-index', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorToast />)

      const toast = document.querySelector('.z-50')
      expect(toast).not.toBeNull()
    })
  })
})

// ===========================================================================
// ErrorBadge TESTS
// ===========================================================================

describe('ErrorBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // RENDERING
  // =========================================================================

  describe('Rendering', () => {
    it('renders nothing when no unread errors', () => {
      render(<ErrorBadge />)

      expect(screen.queryByRole('button')).toBeNull()
    })

    it('renders badge when unread errors exist', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorBadge />)

      expect(screen.getByRole('button')).toBeDefined()
    })

    it('displays unread count', () => {
      useErrorStore.setState({
        errors: [createMockError(), createMockError()],
        unreadCount: 3,
      })

      render(<ErrorBadge />)

      expect(screen.getByText('3')).toBeDefined()
    })

    it('displays "9+" for counts over 9', () => {
      useErrorStore.setState({
        errors: Array.from({ length: 15 }, () => createMockError()),
        unreadCount: 15,
      })

      render(<ErrorBadge />)

      expect(screen.getByText('9+')).toBeDefined()
    })

    it('applies custom className', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorBadge className="my-badge-class" />)

      const badge = document.querySelector('.my-badge-class')
      expect(badge).not.toBeNull()
    })
  })

  // =========================================================================
  // CRITICAL INDICATOR
  // =========================================================================

  describe('Critical Indicator', () => {
    it('applies red styling for critical errors', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'critical', dismissed: false })],
        unreadCount: 1,
      })

      render(<ErrorBadge />)

      const badge = document.querySelector('.bg-accent-red')
      expect(badge).not.toBeNull()
    })

    it('applies pulse animation for critical errors', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'critical', dismissed: false })],
        unreadCount: 1,
      })

      render(<ErrorBadge />)

      const badge = document.querySelector('.animate-pulse')
      expect(badge).not.toBeNull()
    })

    it('applies yellow styling for non-critical errors', () => {
      useErrorStore.setState({
        errors: [createMockError({ severity: 'error', dismissed: false })],
        unreadCount: 1,
      })

      render(<ErrorBadge />)

      const badge = document.querySelector('.bg-accent-yellow')
      expect(badge).not.toBeNull()
    })
  })

  // =========================================================================
  // CLICK BEHAVIOR
  // =========================================================================

  describe('Click Behavior', () => {
    it('marks all as read when clicked', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 5,
      })

      render(<ErrorBadge />)

      fireEvent.click(screen.getByRole('button'))

      const state = useErrorStore.getState()
      expect(state.unreadCount).toBe(0)
    })
  })

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('has accessible title with singular notification', () => {
      useErrorStore.setState({
        errors: [createMockError()],
        unreadCount: 1,
      })

      render(<ErrorBadge />)

      const badge = screen.getByRole('button')
      expect(badge.getAttribute('title')).toBe('1 unread notification')
    })

    it('has accessible title with plural notifications', () => {
      useErrorStore.setState({
        errors: [createMockError(), createMockError()],
        unreadCount: 5,
      })

      render(<ErrorBadge />)

      const badge = screen.getByRole('button')
      expect(badge.getAttribute('title')).toBe('5 unread notifications')
    })
  })
})

// ===========================================================================
// initializeErrorListener TESTS
// ===========================================================================

describe('initializeErrorListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()
  })

  it('subscribes to error:occurred events', () => {
    initializeErrorListener()

    expect(window.electron.on).toHaveBeenCalledWith('error:occurred', expect.any(Function))
  })

  it('returns unsubscribe function', () => {
    const unsubscribe = vi.fn()
    ;(window.electron.on as ReturnType<typeof vi.fn>).mockReturnValue(unsubscribe)

    const result = initializeErrorListener()

    expect(typeof result).toBe('function')
  })

  it('adds error to store when event received', async () => {
    initializeErrorListener()

    const callback = (window.electron.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'error:occurred'
    )?.[1]

    if (callback) {
      await act(async () => {
        callback({
          code: 'ERR_NEW',
          message: 'New error',
          severity: 'error',
          category: 'network',
          timestamp: Date.now(),
        })
      })
    }

    const state = useErrorStore.getState()
    expect(state.errors.length).toBe(1)
    expect(state.errors[0].code).toBe('ERR_NEW')
    expect(state.errors[0].message).toBe('New error')
  })
})
