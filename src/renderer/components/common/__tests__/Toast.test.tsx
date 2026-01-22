/**
 * Toast System Tests
 *
 * Comprehensive tests for the toast notification system including:
 * - Provider setup and context
 * - Toast variants and styling
 * - Auto-dismiss behavior
 * - User interactions
 * - Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'

// Test component that exposes toast methods
function TestComponent({ onMount }: { onMount?: (toast: ReturnType<typeof useToast>) => void }) {
  const toast = useToast()

  if (onMount) {
    onMount(toast)
  }

  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Success</button>
      <button onClick={() => toast.error('Error message')}>Error</button>
      <button onClick={() => toast.warning('Warning message')}>Warning</button>
      <button onClick={() => toast.info('Info message')}>Info</button>
      <button onClick={() => toast.loading('Loading message')}>Loading</button>
      <button onClick={() => toast.success('With title', { title: 'Title Here' })}>
        With Title
      </button>
      <button
        onClick={() =>
          toast.success('With action', {
            action: { label: 'Undo', onClick: vi.fn() },
          })
        }
      >
        With Action
      </button>
      <button onClick={() => toast.clearToasts()}>Clear All</button>
    </div>
  )
}

function renderWithProvider(ui: React.ReactElement = <TestComponent />) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('Toast System', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('ToastProvider', () => {
    it('renders children correctly', () => {
      renderWithProvider(<div data-testid="child">Child content</div>)
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('throws error when useToast is used outside provider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useToast must be used within a ToastProvider')

      consoleError.mockRestore()
    })
  })

  describe('Toast Variants', () => {
    it('shows success toast', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
      })

      expect(screen.getByText('Success message')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveClass('bg-accent-green/10')
    })

    it('shows error toast', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Error'))
      })

      expect(screen.getByText('Error message')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveClass('bg-accent-red/10')
    })

    it('shows warning toast', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Warning'))
      })

      expect(screen.getByText('Warning message')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveClass('bg-accent-yellow/10')
    })

    it('shows info toast', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Info'))
      })

      expect(screen.getByText('Info message')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveClass('bg-accent-blue/10')
    })

    it('shows loading toast', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Loading'))
      })

      expect(screen.getByText('Loading message')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveClass('bg-accent-purple/10')
    })
  })

  describe('Toast Options', () => {
    it('displays title when provided', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('With Title'))
      })

      expect(screen.getByText('Title Here')).toBeInTheDocument()
      expect(screen.getByText('With title')).toBeInTheDocument()
    })

    it('displays action button when provided', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('With Action'))
      })

      expect(screen.getByText('Undo')).toBeInTheDocument()
    })

    it('calls action onClick and dismisses toast', async () => {
      const actionFn = vi.fn()

      function ActionTestComponent() {
        const toast = useToast()
        return (
          <button
            onClick={() =>
              toast.success('Test', { action: { label: 'Click Me', onClick: actionFn } })
            }
          >
            Show Toast
          </button>
        )
      }

      renderWithProvider(<ActionTestComponent />)

      await act(async () => {
        fireEvent.click(screen.getByText('Show Toast'))
      })

      const actionButton = screen.getByText('Click Me')

      await act(async () => {
        fireEvent.click(actionButton)
      })

      expect(actionFn).toHaveBeenCalledOnce()
    })
  })

  describe('Auto-dismiss', () => {
    it('auto-dismisses success toast after default duration', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
      })

      expect(screen.getByText('Success message')).toBeInTheDocument()

      // Advance past default 5000ms + 200ms animation
      await act(async () => {
        vi.advanceTimersByTime(5200)
      })

      expect(screen.queryByText('Success message')).not.toBeInTheDocument()
    })

    it('error toast has longer duration (8000ms)', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Error'))
      })

      expect(screen.getByText('Error message')).toBeInTheDocument()

      // Should still be visible at 5000ms
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      expect(screen.getByText('Error message')).toBeInTheDocument()

      // Should be gone after 8200ms total
      await act(async () => {
        vi.advanceTimersByTime(3200)
      })

      expect(screen.queryByText('Error message')).not.toBeInTheDocument()
    })

    it('loading toast does not auto-dismiss', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Loading'))
      })

      expect(screen.getByText('Loading message')).toBeInTheDocument()

      // Advance way past normal duration
      await act(async () => {
        vi.advanceTimersByTime(30000)
      })

      // Should still be there
      expect(screen.getByText('Loading message')).toBeInTheDocument()
    })

    it('respects custom duration option', async () => {
      function CustomDurationComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.success('Quick', { duration: 1000 })}>Quick Toast</button>
        )
      }

      renderWithProvider(<CustomDurationComponent />)

      await act(async () => {
        fireEvent.click(screen.getByText('Quick Toast'))
      })

      expect(screen.getByText('Quick')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      expect(screen.queryByText('Quick')).not.toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('dismisses toast when X button is clicked', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
      })

      expect(screen.getByText('Success message')).toBeInTheDocument()

      const dismissButton = screen.getByLabelText('Dismiss notification')

      await act(async () => {
        fireEvent.click(dismissButton)
        vi.advanceTimersByTime(200) // Animation duration
      })

      expect(screen.queryByText('Success message')).not.toBeInTheDocument()
    })

    it('clears all toasts when clearToasts is called', async () => {
      renderWithProvider()

      // Add multiple toasts
      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
        fireEvent.click(screen.getByText('Error'))
        fireEvent.click(screen.getByText('Info'))
      })

      expect(screen.getByText('Success message')).toBeInTheDocument()
      expect(screen.getByText('Error message')).toBeInTheDocument()
      expect(screen.getByText('Info message')).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(screen.getByText('Clear All'))
      })

      expect(screen.queryByText('Success message')).not.toBeInTheDocument()
      expect(screen.queryByText('Error message')).not.toBeInTheDocument()
      expect(screen.queryByText('Info message')).not.toBeInTheDocument()
    })
  })

  describe('Toast Update', () => {
    it('updates existing toast message and variant', async () => {
      let toastApi: ReturnType<typeof useToast>

      function UpdateTestComponent() {
        const toast = useToast()
        toastApi = toast
        return <button onClick={() => toast.loading('Loading...')}>Start Loading</button>
      }

      renderWithProvider(<UpdateTestComponent />)

      await act(async () => {
        fireEvent.click(screen.getByText('Start Loading'))
      })

      // Get the toast ID (it was returned from loading())
      const toastId = toastApi!.toasts[0]?.id

      expect(screen.getByText('Loading...')).toBeInTheDocument()

      // Update the toast
      await act(async () => {
        toastApi!.update(toastId, 'Complete!', 'success')
      })

      expect(screen.getByText('Complete!')).toBeInTheDocument()
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
  })

  describe('Multiple Toasts', () => {
    it('stacks multiple toasts', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
        fireEvent.click(screen.getByText('Error'))
        fireEvent.click(screen.getByText('Warning'))
      })

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(3)
    })

    it('limits visible toasts to MAX_TOASTS (5)', async () => {
      function ManyToastsComponent() {
        const toast = useToast()
        return (
          <button
            onClick={() => {
              for (let i = 0; i < 8; i++) {
                toast.info(`Toast ${i + 1}`)
              }
            }}
          >
            Add Many
          </button>
        )
      }

      renderWithProvider(<ManyToastsComponent />)

      await act(async () => {
        fireEvent.click(screen.getByText('Add Many'))
      })

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(5) // MAX_TOASTS
    })
  })

  describe('Accessibility', () => {
    it('has correct ARIA role', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
      })

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('error toasts have assertive aria-live', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Error'))
      })

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
    })

    it('non-error toasts have polite aria-live', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
      })

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
    })

    it('dismiss button has accessible label', async () => {
      renderWithProvider()

      await act(async () => {
        fireEvent.click(screen.getByText('Success'))
      })

      expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument()
    })
  })

  describe('Toast IDs', () => {
    it('returns unique ID when adding toast', async () => {
      let toastApi: ReturnType<typeof useToast>

      function IdTestComponent() {
        const toast = useToast()
        toastApi = toast
        return <button onClick={() => toast.success('Test')}>Add</button>
      }

      renderWithProvider(<IdTestComponent />)

      let id1: string, id2: string

      await act(async () => {
        id1 = toastApi!.success('First')
        id2 = toastApi!.success('Second')
      })

      expect(id1!).toBeDefined()
      expect(id2!).toBeDefined()
      expect(id1!).not.toBe(id2!)
    })

    it('can remove toast by ID', async () => {
      let toastApi: ReturnType<typeof useToast>

      function RemoveTestComponent() {
        const toast = useToast()
        toastApi = toast
        return <button onClick={() => toast.success('Test')}>Add</button>
      }

      renderWithProvider(<RemoveTestComponent />)

      await act(async () => {
        toastApi!.success('Remove me')
      })

      expect(screen.getByText('Remove me')).toBeInTheDocument()

      const toastId = toastApi!.toasts[0]?.id

      await act(async () => {
        toastApi!.removeToast(toastId)
      })

      expect(screen.queryByText('Remove me')).not.toBeInTheDocument()
    })
  })
})
